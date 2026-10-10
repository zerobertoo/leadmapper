import { placeKey } from '../shared/domain';
import {
  EMPTY_PROGRESS,
  STORAGE_KEYS,
  type CollectionSettings,
  type CollectionState,
  type ContentEvent,
  type ContentMessage,
  type ContentReply,
  type Lead,
  type Progress,
  type SpeedMode,
} from '../shared/types';
import { SELECTORS } from './selectors';
import {
  detectBlock,
  extractLead,
  fieldWarnings,
  findDetailsPanel,
  isPanelForCard,
  listCards,
  normalizeText,
  panelSignature,
  queryFirst,
  type ResultCard,
} from './parse';

const DETAILS_TIMEOUT_MS = 8000;
const POLL_INTERVAL_MS = 200;
const MAX_IDLE_SCROLLS = 3;
const NEW_CARDS_WAIT_MS = 5000;
// falhas seguidas indicam seletor quebrado: para cedo em vez de gastar 16 s por cartão até o fim da lista
const MAX_CONSECUTIVE_FAILURES = 5;
const BLOCKED_MESSAGE =
  'O Google pediu uma verificação. Resolva-a na aba do Maps e inicie a coleta de novo.';
const MAPS_CHANGED_MESSAGE =
  'O Google mudou a página do Maps; atualize a extensão ou tente de novo.';

// faixa de pausa aleatória (ms) entre ações, por velocidade
const DELAY_RANGE: Record<SpeedMode, [number, number]> = {
  slow: [1500, 3500],
  normal: [800, 2000],
  fast: [400, 1000],
};

// avisa cópias anteriores deste script na mesma página (injeção dupla ou resto de
// uma versão antiga da extensão) para pararem; só a mais nova responde
const TAKEOVER_EVENT = 'leadmapper:takeover';

let state: CollectionState = 'idle';
let cancelRequested = false;
let disposed = false;

class CancelledError extends Error {}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Pausa aleatória que acorda cedo se a coleta for pausada ou cancelada. */
async function randomDelay(speed: SpeedMode): Promise<void> {
  const [min, max] = DELAY_RANGE[speed];
  const deadline = Date.now() + min + Math.random() * (max - min);
  while (Date.now() < deadline && state === 'running' && !cancelRequested) {
    await sleep(Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())));
  }
}

// bloqueia enquanto pausado e interrompe se a coleta foi cancelada
async function checkpoint(): Promise<void> {
  while (state === 'paused' && !cancelRequested) await sleep(POLL_INTERVAL_MS);
  if (cancelRequested) throw new CancelledError();
}

function sendEvent(event: ContentEvent): void {
  if (disposed) return;
  try {
    chrome.runtime.sendMessage(event).catch(() => {
      // service worker pode estar reiniciando; o próximo evento tenta de novo
    });
  } catch {
    // contexto da extensão invalidado (extensão recarregada)
  }
}

function hasResultsList(): boolean {
  return queryFirst(document, SELECTORS.resultsFeed) !== null;
}

// termo pesquisado: campo de busca ou, na falta dele, o trecho /maps/search/<termo> da URL
function readSearchQuery(): string {
  const input = queryFirst<HTMLInputElement>(document, SELECTORS.searchInput);
  if (input?.value.trim()) return input.value.trim();
  const match = location.pathname.match(/\/maps\/search\/([^/]+)/);
  if (!match) return '';
  const raw = match[1].replace(/\+/g, ' ');
  try {
    return decodeURIComponent(raw);
  } catch {
    // "%" solto na URL: usa o texto como veio em vez de travar a coleta
    return raw;
  }
}

// empresas já salvas em coletas anteriores, para retomar sem repetir visitas
async function readKnownPlaces(): Promise<Set<string>> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.leads);
  const leads = (stored[STORAGE_KEYS.leads] as Lead[] | undefined) ?? [];
  const urls = leads.flatMap((lead) => [lead.url_maps, ...(lead.urls_maps_extras ?? [])]);
  return new Set(urls.map(placeKey));
}

/** Rola a lista até o fim, até o limite, ou até 3 rolagens seguidas sem itens novos (RF1.2). */
async function scrollListToEnd(settings: CollectionSettings): Promise<void> {
  let idleScrolls = 0;
  while (idleScrolls < MAX_IDLE_SCROLLS) {
    await checkpoint();
    const countBefore = listCards().length;
    if (countBefore >= settings.limit) return;
    if (queryFirst(document, SELECTORS.endOfList)) return;

    const feed = queryFirst(document, SELECTORS.resultsFeed);
    feed?.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
    await randomDelay(settings.speed);
    // rede lenta: espera os cartões novos chegarem antes de contar rolagem ociosa
    const deadline = Date.now() + NEW_CARDS_WAIT_MS;
    while (listCards().length <= countBefore && Date.now() < deadline) {
      await checkpoint();
      await sleep(POLL_INTERVAL_MS);
    }
    idleScrolls = listCards().length > countBefore ? 0 : idleScrolls + 1;
  }
}

/** Dados do último painel aceito, para reconhecer um painel obsoleto. */
interface PreviousPanel {
  name: string;
  signature: string;
  url: string;
}

/**
 * Espera o painel de detalhes mostrar a empresa clicada (ver `isPanelForCard`).
 * O tempo parado em pausa não conta para o timeout.
 */
async function waitForDetails(card: ResultCard, previous: PreviousPanel): Promise<HTMLElement> {
  let deadline = Date.now() + DETAILS_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const checkpointStart = Date.now();
    await checkpoint();
    deadline += Date.now() - checkpointStart;

    const panel = findDetailsPanel();
    if (
      panel &&
      isPanelForCard({
        shownName: normalizeText(panel.getAttribute('aria-label')),
        previousName: previous.name,
        signature: panelSignature(panel),
        previousSignature: previous.signature,
        currentUrl: location.href,
        cardUrl: card.url,
        previousUrl: previous.url,
      })
    ) {
      return panel;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Painel de detalhes não carregou para "${card.name}"`);
}

/** Clica no cartão e devolve o lead; uma segunda tentativa antes de desistir (R1). */
async function collectCard(
  card: ResultCard,
  previous: PreviousPanel,
  searchQuery: string,
): Promise<{ lead: Lead; panel: PreviousPanel }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // o elemento pode ter sido recriado pelo Maps: procura de novo pela URL
      const element = listCards().find((candidate) => candidate.url === card.url)?.element ?? card.element;
      element.scrollIntoView({ block: 'center' });
      element.click();
      const panel = await waitForDetails(card, previous);
      return {
        lead: extractLead(panel, card, searchQuery),
        panel: {
          name: normalizeText(panel.getAttribute('aria-label')),
          signature: panelSignature(panel),
          url: location.href,
        },
      };
    } catch (error) {
      if (error instanceof CancelledError) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

async function runCollection(settings: CollectionSettings): Promise<void> {
  const progress: Progress = { ...EMPTY_PROGRESS };
  const searchQuery = readSearchQuery();
  let previous: PreviousPanel = { name: '', signature: '', url: location.href };
  let errorMessage = '';
  let consecutiveFailures = 0;
  const collected: Lead[] = [];
  const warned = new Set<string>();

  try {
    const knownPlaces = await readKnownPlaces();
    await scrollListToEnd(settings);
    const cards = listCards().slice(0, settings.limit);
    progress.found = cards.length;
    sendEvent({ type: 'PROGRESS', progress: { ...progress } });

    if (cards.length === 0) {
      errorMessage = detectBlock(document, location.href) ? BLOCKED_MESSAGE : MAPS_CHANGED_MESSAGE;
      sendEvent({ type: 'LOG', text: `Nenhum cartão encontrado: ${errorMessage}` });
      return;
    }

    for (const card of cards) {
      await checkpoint();
      if (detectBlock(document, location.href)) {
        errorMessage = BLOCKED_MESSAGE;
        sendEvent({ type: 'LOG', text: 'Verificação do Google detectada; coleta pausada' });
        break;
      }
      progress.current = card.name;
      if (knownPlaces.has(placeKey(card.url))) {
        // já coletado antes (retomada ou busca sobreposta)
        progress.skipped++;
        progress.processed++;
        sendEvent({ type: 'PROGRESS', progress: { ...progress } });
        continue;
      }
      try {
        const result = await collectCard(card, previous, searchQuery);
        previous = result.panel;
        const { lead } = result;
        consecutiveFailures = 0;
        if (lead.telefone) progress.withPhone++;
        sendEvent({ type: 'LEAD_FOUND', lead });
        // campo vazio em quase todos os itens: seletor provavelmente quebrado
        collected.push(lead);
        const fresh = fieldWarnings(collected).filter((message) => !warned.has(message));
        if (fresh.length > 0) {
          for (const message of fresh) warned.add(message);
          sendEvent({ type: 'WARNING', messages: fresh });
        }
      } catch (error) {
        if (error instanceof CancelledError) throw error;
        // RF1.5: registra o erro e segue para o próximo
        console.warn('[LeadMapper] falha ao coletar item:', card.name, error);
        sendEvent({ type: 'LOG', text: `Falha em "${card.name}": ${error instanceof Error ? error.message : String(error)}` });
        progress.failures++;
        consecutiveFailures++;
      }
      progress.processed++;
      sendEvent({ type: 'PROGRESS', progress: { ...progress } });
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        errorMessage = MAPS_CHANGED_MESSAGE;
        sendEvent({ type: 'LOG', text: `${consecutiveFailures} falhas seguidas; coleta interrompida` });
        break;
      }
      await randomDelay(settings.speed);
    }

    // nenhum item deu certo: quase certamente os seletores deixaram de funcionar
    const attempted = progress.processed - progress.skipped;
    if (!errorMessage && attempted > 0 && progress.failures === attempted) errorMessage = MAPS_CHANGED_MESSAGE;
  } catch (error) {
    if (!(error instanceof CancelledError)) {
      console.error('[LeadMapper] coleta interrompida:', error);
      errorMessage = MAPS_CHANGED_MESSAGE;
    }
  } finally {
    progress.current = '';
    if (!disposed) {
      if (errorMessage && !cancelRequested) {
        state = 'error';
        sendEvent({ type: 'ERROR', message: errorMessage, progress });
      } else {
        state = cancelRequested ? 'cancelled' : 'done';
        sendEvent({ type: 'DONE', progress });
      }
    }
  }
}

function reply(): ContentReply {
  return { ok: true, hasResults: hasResultsList(), state };
}

function onMessage(
  message: ContentMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (reply: ContentReply) => void,
): void {
  if (disposed) return;
  switch (message.type) {
    case 'START':
      if (state !== 'running' && state !== 'paused') {
        state = 'running';
        cancelRequested = false;
        void runCollection(message.settings);
      }
      break;
    case 'PAUSE':
      if (state === 'running') state = 'paused';
      break;
    case 'RESUME':
      if (state === 'paused') state = 'running';
      break;
    case 'CANCEL':
      cancelRequested = true;
      break;
  }
  sendResponse(reply());
}

function dispose(): void {
  disposed = true;
  cancelRequested = true;
  try {
    chrome.runtime.onMessage.removeListener(onMessage);
  } catch {
    // contexto invalidado: o listener já não recebe nada
  }
}

document.dispatchEvent(new CustomEvent(TAKEOVER_EVENT));
document.addEventListener(TAKEOVER_EVENT, dispose);
chrome.runtime.onMessage.addListener(onMessage);
