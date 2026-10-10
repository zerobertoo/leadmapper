import { deriveFields } from '../shared/dedupe';
import { appendLog } from '../shared/diagnostic';
import { extractDomain, isNonWebsite } from '../shared/domain';
import {
  clearAll,
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
  MAX_LIMIT,
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
// cada lead é gravado na hora: o service worker pode morrer a qualquer momento
const BATCH_SIZE = 1;
const WATCHDOG_ALARM = 'enrichment-watchdog';
const ENRICHMENT_CONCURRENCY = 3;
const PAUSE_POLL_MS = 300;

const STATE_AFTER_COMMAND = {
  PAUSE: 'paused',
  CANCEL: 'cancelled',
} as const satisfies Record<string, CollectionState>;

// leads aguardando gravação; se o service worker morrer, perde no máximo BATCH_SIZE - 1 (0 hoje)
let pendingBatch: Lead[] = [];
// serializa as gravações, pois upsertLeads faz leitura + escrita
let writeChain: Promise<void> = Promise.resolve();
// serializa as gravações do log de diagnóstico (leitura + escrita)
let logChain: Promise<void> = Promise.resolve();

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

// selo no ícone: o popup fecha ao perder o foco, então o progresso precisa aparecer fora dele
const BADGE_BY_STATE: Partial<Record<CollectionState, { text: string; color: string }>> = {
  enriching: { text: '…', color: '#0b57d0' },
  paused: { text: '||', color: '#6b7280' },
  done: { text: 'OK', color: '#1e8e3e' },
  error: { text: '!', color: '#d93025' },
};

async function updateBadge(state: CollectionState, processed?: number): Promise<void> {
  const badge = BADGE_BY_STATE[state];
  const text = badge?.text ?? (state === 'running' && processed !== undefined ? String(processed) : '');
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: badge?.color ?? '#0b57d0' });
}

/**
 * Grava o estado e liga o vigia (alarme a cada minuto) só enquanto há sites a
 * visitar: se o service worker morrer com o popup fechado, o alarme o acorda
 * e a fila é retomada.
 */
async function setState(state: CollectionState): Promise<void> {
  await writeState(state);
  await updateBadge(state);
  if (state === 'enriching') await chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: 1 });
  else await chrome.alarms.clear(WATCHDOG_ALARM);
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
  if (!domain || isNonWebsite(lead.site)) {
    // perfil de rede social ou link de WhatsApp não é site: a URL já foi guardada (RF2.5)
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
    for (const lead of pending) attempted.add(lead.id);
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
  if ((await readState()) === 'enriching' && !enrichmentRunning) await setState('done');
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
  if (message.type === 'CLEAR') {
    // esvazia o buffer antes: um flush atrasado reintroduziria leads apagados
    pendingBatch = [];
    await writeChain.catch(() => undefined);
    await clearAll();
    await chrome.alarms.clear(WATCHDOG_ALARM);
    await updateBadge('idle');
    return { kind: 'ready', state: 'idle', hasResults: false };
  }

  try {
    const tab = await getActiveMapsTab();
    if (!tab) return { kind: 'outside_maps' };

    if (message.type === 'GET_STATUS') {
      const reply = await sendToContent(tab.id!, { type: 'PING' });
      let state = await readState();
      // aba recarregada durante a coleta: o content script voltou ao zero
      if ((state === 'running' || state === 'paused') && reply.state === 'idle') {
        // sites que ficaram pendentes continuam sendo visitados
        state = (await isEnrichmentEnabled()) && (await hasPendingSites()) ? 'enriching' : 'idle';
        await setState(state);
      }
      // service worker reiniciado no meio do enriquecimento: retoma a fila
      if (state === 'enriching') void processPending();
      const stored = await chrome.storage.local.get(STORAGE_KEYS.errorMessage);
      const errorMessage =
        state === 'error' ? (stored[STORAGE_KEYS.errorMessage] as string | undefined) : undefined;
      return { kind: 'ready', state, hasResults: reply.hasResults, errorMessage };
    }

    if (message.type === 'START') {
      await writeProgress(EMPTY_PROGRESS);
      await chrome.storage.local.set({ [STORAGE_KEYS.duplicates]: 0, [STORAGE_KEYS.startedAt]: Date.now() });
      const settings = { ...DEFAULT_SETTINGS, ...message.settings };
      settings.limit = Math.min(Math.max(Math.floor(settings.limit) || DEFAULT_SETTINGS.limit, 1), MAX_LIMIT);
      await chrome.storage.local.set({ [STORAGE_KEYS.enrichSites]: settings.enrichSites });
      await chrome.storage.local.remove([STORAGE_KEYS.errorMessage, STORAGE_KEYS.warnings]);
      const reply = await sendToContent(tab.id!, { type: 'START', settings });
      await setState('running');
      return { kind: 'ready', state: 'running', hasResults: reply.hasResults };
    }

    if (message.type === 'RESUME') {
      const reply = await sendToContent(tab.id!, { type: 'RESUME' });
      // se a coleta do Maps já terminou, o que falta é visitar os sites
      const state = reply.state === 'running' ? 'running' : 'enriching';
      await setState(state);
      void processPending();
      return { kind: 'ready', state, hasResults: reply.hasResults };
    }

    // grava o estado antes: o DONE do content script não pode sobrescrever "cancelled"
    const state = STATE_AFTER_COMMAND[message.type];
    await setState(state);
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
      await updateBadge('running', event.progress.processed);
      break;
    case 'LOG':
      logChain = logChain.then(() => appendLog(event.text));
      await logChain;
      break;
    case 'WARNING': {
      const stored = await chrome.storage.local.get(STORAGE_KEYS.warnings);
      const known = (stored[STORAGE_KEYS.warnings] as string[] | undefined) ?? [];
      await chrome.storage.local.set({
        [STORAGE_KEYS.warnings]: [...new Set([...known, ...event.messages])],
      });
      break;
    }
    case 'ERROR':
      await flushBatch();
      await writeProgress(event.progress);
      await chrome.storage.local.set({ [STORAGE_KEYS.errorMessage]: event.message });
      await appendLog(`Erro: ${event.message}`);
      await setState('error');
      break;
    case 'DONE':
      await flushBatch();
      await writeProgress(event.progress);
      // se o usuário cancelou ou pausou, o estado é mantido
      if ((await readState()) === 'running') {
        if ((await isEnrichmentEnabled()) && (await hasPendingSites())) {
          await setState('enriching');
          void processPending();
        } else {
          await setState('done');
        }
      }
      break;
  }
}

chrome.runtime.onMessage.addListener(
  (message: PopupMessage | ContentEvent, _sender, sendResponse: (reply?: StatusReply) => void) => {
    if (
      message.type === 'LEAD_FOUND' ||
      message.type === 'PROGRESS' ||
      message.type === 'DONE' ||
      message.type === 'ERROR' ||
      message.type === 'WARNING' ||
      message.type === 'LOG'
    ) {
      void handleContentEvent(message);
      return false;
    }
    handlePopupMessage(message).then(sendResponse, (error: unknown) =>
      sendResponse({ kind: 'error', message: error instanceof Error ? error.message : String(error) }),
    );
    return true; // resposta assíncrona
  },
);

// o alarme acorda o service worker se ele morreu no meio do enriquecimento
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== WATCHDOG_ALARM) return;
  if ((await readState()) === 'enriching') void processPending();
  else await chrome.alarms.clear(WATCHDOG_ALARM);
});

// ao acordar, continua o enriquecimento que ficou pela metade
void readState().then((state) => {
  if (state === 'enriching') void processPending();
});
