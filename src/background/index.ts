import { deriveFields } from '../shared/dedupe';
import { appendLog } from '../shared/diagnostic';
import { extractDomain, isNonWebsite, isPrivateHost } from '../shared/domain';
import {
  clearAll,
  deleteLeads,
  editLeads,
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
// serializa as gravações, pois upsertLeads faz leitura + escrita; nunca fica rejeitada
let writeChain: Promise<void> = Promise.resolve();
// serializa as gravações do log de diagnóstico (leitura + escrita)
let logChain: Promise<void> = Promise.resolve();
// muda a cada CLEAR: um lote que falhou antes do CLEAR não pode voltar para a fila depois dele
let clearEpoch = 0;

/**
 * Coloca uma gravação na fila. Uma falha é registrada no log e não trava os
 * passos seguintes: a cadeia continua utilizável.
 */
function enqueueWrite(job: () => Promise<void>): Promise<void> {
  writeChain = writeChain.then(job).catch((error: unknown) => {
    logChain = logChain
      .then(() => appendLog(`Falha ao gravar: ${error instanceof Error ? error.message : String(error)}`))
      .catch(() => undefined);
  });
  return writeChain;
}

function flushBatch(): Promise<void> {
  const leads = pendingBatch;
  pendingBatch = [];
  if (leads.length === 0) return writeChain;

  const epoch = clearEpoch;
  const written = enqueueWrite(async () => {
    try {
      await upsertLeads(leads);
    } catch (error) {
      // devolve os leads ao buffer: a próxima gravação tenta de novo
      if (epoch === clearEpoch) pendingBatch = [...leads, ...pendingBatch];
      throw error;
    }
  });
  // leads novos podem ter site para visitar
  void written.then(processPending);
  return written;
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

let activeLanes = 0;

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
  if (!domain || isNonWebsite(lead.site) || isPrivateHost(domain)) {
    // perfil de rede social, link de WhatsApp ou endereço da rede local não é site: a URL já foi guardada (RF2.5)
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
  await enqueueWrite(() => patchLead(lead.id, patch));
}

// ids já tentados nesta rodada: um lead que falhou na gravação não entra em laço
const attempted = new Set<string>();
// as retiradas da fila são serializadas para duas faixas não pegarem o mesmo lead
let takeChain: Promise<unknown> = Promise.resolve();

async function pickNextPending(): Promise<Lead | null> {
  if (!(await isEnrichmentEnabled()) || !(await waitUntilActive())) return null;
  const next = (await readLeads()).find(
    (lead) => lead.status_enriquecimento === 'pendente' && lead.site && !attempted.has(lead.id),
  );
  if (next) attempted.add(next.id);
  return next ?? null;
}

function takePending(): Promise<Lead | null> {
  const taken = takeChain.then(pickNextPending);
  takeChain = taken.catch(() => undefined);
  return taken;
}

/** Fecha a rodada quando a última faixa termina: a coleta só acaba de fato aqui. */
async function finishEnrichment(): Promise<void> {
  if (activeLanes > 0) return;
  attempted.clear();
  if ((await readState()) === 'enriching' && activeLanes === 0) await setState('done');
}

async function runLane(): Promise<void> {
  activeLanes++;
  try {
    for (;;) {
      const lead = await takePending();
      if (!lead) return;
      try {
        await enrichLead(lead);
      } catch {
        // o lead fica pendente e não é retentado nesta rodada; a faixa segue
      }
    }
  } finally {
    activeLanes--;
    await finishEnrichment().catch(() => undefined);
  }
}

/**
 * Completa as faixas até 3 sites em paralelo (RF2.4). Cada faixa retira o
 * próximo pendente quando termina, então leads que chegam durante a coleta
 * entram sem esperar o fim de uma rodada.
 */
function processPending(): Promise<void> {
  const missing = Math.max(ENRICHMENT_CONCURRENCY - activeLanes, 0);
  return Promise.all(Array.from({ length: missing }, runLane)).then(() => undefined);
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
    clearEpoch++;
    // o apagamento entra na fila: um patch em voo não pode regravar a lista depois dele
    await enqueueWrite(clearAll);
    attempted.clear();
    await chrome.alarms.clear(WATCHDOG_ALARM);
    await updateBadge('idle');
    return { kind: 'ready', state: 'idle', hasResults: false };
  }

  if (message.type === 'UPDATE_LEADS' || message.type === 'DELETE_LEADS') {
    // edição vinda do painel lateral: entra na mesma fila de gravações do service worker
    await enqueueWrite(() =>
      message.type === 'UPDATE_LEADS' ? editLeads(message.ids, message.edit) : deleteLeads(message.ids),
    );
    return { kind: 'ready', state: await readState(), hasResults: false };
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
      logChain = logChain.then(() => appendLog(event.text)).catch(() => undefined);
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

// defesa em profundidade: um LEAD_FOUND sem as listas quebraria deriveFields e a gravação
function isWellFormedEvent(event: ContentEvent): boolean {
  if (event.type !== 'LEAD_FOUND') return true;
  const { lead } = event;
  return (
    typeof lead?.id === 'string' &&
    typeof lead.nome === 'string' &&
    typeof lead.site === 'string' &&
    typeof lead.telefone === 'string' &&
    Array.isArray(lead.emails) &&
    Array.isArray(lead.whatsapp) &&
    Array.isArray(lead.redes_sociais)
  );
}

chrome.runtime.onMessage.addListener(
  (message: PopupMessage | ContentEvent, sender, sendResponse: (reply?: StatusReply) => void) => {
    if (
      message.type === 'LEAD_FOUND' ||
      message.type === 'PROGRESS' ||
      message.type === 'DONE' ||
      message.type === 'ERROR' ||
      message.type === 'WARNING' ||
      message.type === 'LOG'
    ) {
      // eventos de coleta só vêm de uma aba (o content script); o formato é conferido antes de gravar
      if (sender.tab && isWellFormedEvent(message)) void handleContentEvent(message).catch(() => undefined);
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
