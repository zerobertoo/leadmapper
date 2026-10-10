import { deriveFields } from '../shared/dedupe';
import { extractDomain, isSocialDomain } from '../shared/domain';
import {
  patchLead,
  readLeads,
  readState,
  upsertLeads,
  writeProgress,
  writeState,
  type EnrichmentPatch,
} from '../shared/storage';
import {
  DEFAULT_SETTINGS,
  EMPTY_PROGRESS,
  STORAGE_KEYS,
  type CollectionState,
  type ContentEvent,
  type ContentMessage,
  type ContentReply,
  type Lead,
  type PopupMessage,
  type StatusReply,
} from '../shared/types';
import { enrichSite } from './enrich';
import { runWithConcurrency } from './queue';

const MAPS_URL_PATTERN = /^https:\/\/www\.google\.com(\.br)?\/maps/;
const BATCH_SIZE = 10;
const ENRICHMENT_CONCURRENCY = 3;
const PAUSE_POLL_MS = 300;

const STATE_AFTER_COMMAND = {
  PAUSE: 'paused',
  CANCEL: 'cancelled',
} as const satisfies Record<string, CollectionState>;

// leads aguardando gravação; se o service worker morrer, perde no máximo BATCH_SIZE - 1
let pendingBatch: Lead[] = [];
// serializa as gravações, pois upsertLeads faz leitura + escrita
let writeChain: Promise<void> = Promise.resolve();

function flushBatch(): Promise<void> {
  const leads = pendingBatch;
  pendingBatch = [];
  if (leads.length > 0) {
    writeChain = writeChain.then(() => upsertLeads(leads));
    // leads novos podem ter site para visitar
    void writeChain.then(processPending);
  }
  return writeChain;
}

// ---- enriquecimento pelos sites (fila reconstruída a partir de status_enriquecimento) ----

let enrichmentRunning = false;
let rerunRequested = false;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function isEnrichmentEnabled(): Promise<boolean> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.enrichSites);
  return (stored[STORAGE_KEYS.enrichSites] as boolean | undefined) ?? DEFAULT_SETTINGS.enrichSites;
}

// bloqueia enquanto pausado; devolve false se a coleta não está mais ativa
async function waitUntilActive(): Promise<boolean> {
  for (;;) {
    const state = await readState();
    if (state === 'paused') await sleep(PAUSE_POLL_MS);
    else return state === 'running' || state === 'enriching';
  }
}

async function enrichLead(lead: Lead): Promise<void> {
  if (!(await waitUntilActive())) return;

  const domain = extractDomain(lead.site);
  let patch: EnrichmentPatch;
  if (!domain || isSocialDomain(domain)) {
    // perfil de rede social não é site: a URL já foi guardada em redes_sociais (RF2.5)
    patch = { status_enriquecimento: 'sem_site' };
  } else {
    const result = await enrichSite(lead.site);
    patch = {
      emails: result.emails,
      whatsapp: result.whatsapp,
      redes_sociais: result.redes_sociais,
      status_enriquecimento: result.status,
    };
  }
  writeChain = writeChain.then(() => patchLead(lead.id, patch));
  await writeChain;
}

async function drainQueue(): Promise<void> {
  const attempted = new Set<string>();
  for (;;) {
    if (!(await isEnrichmentEnabled()) || !(await waitUntilActive())) return;
    const pending = (await readLeads()).filter(
      (lead) => lead.status_enriquecimento === 'pendente' && lead.site && !attempted.has(lead.id),
    );
    if (pending.length === 0) return;
    pending.forEach((lead) => attempted.add(lead.id));
    await runWithConcurrency(pending, ENRICHMENT_CONCURRENCY, enrichLead);
  }
}

/** Processa os leads pendentes, com no máximo 3 sites em paralelo (RF2.4). */
async function processPending(): Promise<void> {
  if (enrichmentRunning) {
    rerunRequested = true;
    return;
  }
  enrichmentRunning = true;
  try {
    do {
      rerunRequested = false;
      await drainQueue();
    } while (rerunRequested);
  } finally {
    enrichmentRunning = false;
  }
  // fila vazia depois do fim da coleta: a coleta termina de fato aqui
  if ((await readState()) === 'enriching' && !enrichmentRunning) await writeState('done');
}

async function hasPendingSites(): Promise<boolean> {
  const leads = await readLeads();
  return leads.some((lead) => lead.status_enriquecimento === 'pendente' && lead.site);
}

async function getActiveMapsTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id !== undefined && MAPS_URL_PATTERN.test(tab.url ?? '') ? tab : null;
}

/**
 * Envia uma mensagem ao content script da aba. Se ele ainda não estiver
 * injetado (aba aberta antes da extensão), injeta e tenta de novo.
 */
async function sendToContent(tabId: number, message: ContentMessage): Promise<ContentReply> {
  try {
    return await chrome.tabs.sendMessage<ContentMessage, ContentReply>(tabId, message);
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return await chrome.tabs.sendMessage<ContentMessage, ContentReply>(tabId, message);
  }
}

async function handlePopupMessage(message: PopupMessage): Promise<StatusReply> {
  const tab = await getActiveMapsTab();
  if (!tab) return { kind: 'outside_maps' };

  try {
    if (message.type === 'GET_STATUS') {
      const reply = await sendToContent(tab.id!, { type: 'PING' });
      let state = await readState();
      // aba recarregada durante a coleta: o content script voltou ao zero
      if ((state === 'running' || state === 'paused') && reply.state === 'idle') {
        state = 'idle';
        await writeState(state);
      }
      // service worker reiniciado no meio do enriquecimento: retoma a fila
      if (state === 'enriching') void processPending();
      return { kind: 'ready', state, hasResults: reply.hasResults };
    }

    if (message.type === 'START') {
      await writeProgress(EMPTY_PROGRESS);
      await chrome.storage.local.set({ [STORAGE_KEYS.duplicates]: 0 });
      const settings = { ...DEFAULT_SETTINGS, ...message.settings };
      await chrome.storage.local.set({ [STORAGE_KEYS.enrichSites]: settings.enrichSites });
      const reply = await sendToContent(tab.id!, { type: 'START', settings });
      await writeState('running');
      return { kind: 'ready', state: 'running', hasResults: reply.hasResults };
    }

    if (message.type === 'RESUME') {
      const reply = await sendToContent(tab.id!, { type: 'RESUME' });
      // se a coleta do Maps já terminou, o que falta é visitar os sites
      const state = reply.state === 'running' ? 'running' : 'enriching';
      await writeState(state);
      void processPending();
      return { kind: 'ready', state, hasResults: reply.hasResults };
    }

    // grava o estado antes: o DONE do content script não pode sobrescrever "cancelled"
    const state = STATE_AFTER_COMMAND[message.type];
    await writeState(state);
    const reply = await sendToContent(tab.id!, { type: message.type });
    if (state === 'cancelled' || state === 'paused') await flushBatch();
    return { kind: 'ready', state, hasResults: reply.hasResults };
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

async function handleContentEvent(event: ContentEvent): Promise<void> {
  switch (event.type) {
    case 'LEAD_FOUND':
      pendingBatch.push(deriveFields(event.lead));
      if (pendingBatch.length >= BATCH_SIZE) await flushBatch();
      break;
    case 'PROGRESS':
      await writeProgress(event.progress);
      break;
    case 'DONE':
      await flushBatch();
      await writeProgress(event.progress);
      // se o usuário cancelou ou pausou, o estado é mantido
      if ((await readState()) === 'running') {
        if ((await isEnrichmentEnabled()) && (await hasPendingSites())) {
          await writeState('enriching');
          void processPending();
        } else {
          await writeState('done');
        }
      }
      break;
  }
}

chrome.runtime.onMessage.addListener(
  (message: PopupMessage | ContentEvent, _sender, sendResponse: (reply?: StatusReply) => void) => {
    if (message.type === 'LEAD_FOUND' || message.type === 'PROGRESS' || message.type === 'DONE') {
      void handleContentEvent(message);
      return false;
    }
    handlePopupMessage(message).then(sendResponse);
    return true; // resposta assíncrona
  },
);

// ao acordar, continua o enriquecimento que ficou pela metade
void readState().then((state) => {
  if (state === 'enriching') void processPending();
});
