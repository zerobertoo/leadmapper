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

const DETAILS_TIMEOUT_MS = 8000;
const POLL_INTERVAL_MS = 200;
const MAX_IDLE_SCROLLS = 3;
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

const normalizeText = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

function hasResultsList(): boolean {
  return document.querySelector(SELECTORS.resultsFeed) !== null;
}

interface ResultCard {
  name: string;
  url: string;
  element: HTMLAnchorElement;
}

function listCards(): ResultCard[] {
  const feed = document.querySelector(SELECTORS.resultsFeed);
  if (!feed) return [];
  const seenUrls = new Set<string>();
  const cards: ResultCard[] = [];
  for (const element of feed.querySelectorAll<HTMLAnchorElement>(SELECTORS.resultCard)) {
    if (seenUrls.has(element.href)) continue;
    seenUrls.add(element.href);
    cards.push({ name: normalizeText(element.getAttribute('aria-label')), url: element.href, element });
  }
  return cards;
}

// termo pesquisado: campo de busca ou, na falta dele, o trecho /maps/search/<termo> da URL
function readSearchQuery(): string {
  const input = document.querySelector<HTMLInputElement>(SELECTORS.searchInput);
  if (input?.value.trim()) return input.value.trim();
  const match = location.pathname.match(/\/maps\/search\/([^/]+)/);
  return match ? decodeURIComponent(match[1].replace(/\+/g, ' ')) : '';
}

// empresas já salvas em coletas anteriores, para retomar sem repetir visitas
async function readKnownPlaces(): Promise<Set<string>> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.leads);
  const leads = (stored[STORAGE_KEYS.leads] as Lead[] | undefined) ?? [];
  return new Set(leads.map((lead) => placeKey(lead.url_maps)));
}

/** Rola a lista até o fim, até o limite, ou até 3 rolagens seguidas sem itens novos (RF1.2). */
async function scrollListToEnd(settings: CollectionSettings): Promise<void> {
  let idleScrolls = 0;
  while (idleScrolls < MAX_IDLE_SCROLLS) {
    await checkpoint();
    const countBefore = listCards().length;
    if (countBefore >= settings.limit) return;
    if (document.querySelector(SELECTORS.endOfList)) return;

    const feed = document.querySelector(SELECTORS.resultsFeed);
    feed?.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
    await randomDelay(settings.speed);
    idleScrolls = listCards().length > countBefore ? 0 : idleScrolls + 1;
  }
}

function findDetailsPanel(): HTMLElement | null {
  for (const panel of document.querySelectorAll<HTMLElement>(SELECTORS.detailsPanel)) {
    if (panel.querySelector(SELECTORS.detailsLoadedMarker)) return panel;
  }
  return null;
}

/**
 * Espera o painel de detalhes mostrar a empresa clicada. Aceita o painel quando
 * o nome bate com o do cartão ou, como plano B, quando mudou em relação ao anterior.
 * O tempo parado em pausa não conta para o timeout.
 */
async function waitForDetails(expectedName: string, previousName: string): Promise<HTMLElement> {
  let deadline = Date.now() + DETAILS_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const checkpointStart = Date.now();
    await checkpoint();
    deadline += Date.now() - checkpointStart;

    const panel = findDetailsPanel();
    const shownName = normalizeText(panel?.getAttribute('aria-label'));
    if (panel && shownName && (shownName === expectedName || shownName !== previousName)) {
      return panel;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Painel de detalhes não carregou para "${expectedName}"`);
}

function textOf(root: ParentNode, selector: string): string {
  return normalizeText(root.querySelector<HTMLElement>(selector)?.textContent);
}

/** "5,0 (1.234)" -> { rating: 5, reviews: 1234 } */
function parseRating(text: string): { rating: number | null; reviews: number | null } {
  const ratingMatch = text.match(/(\d+(?:[.,]\d+)?)/);
  const reviewsMatch = text.match(/\(([\d.,]+)\)/);
  return {
    rating: ratingMatch ? Number(ratingMatch[1].replace(',', '.')) : null,
    reviews: reviewsMatch ? Number(reviewsMatch[1].replace(/[.,]/g, '')) : null,
  };
}

function extractLead(panel: HTMLElement, card: ResultCard, searchQuery: string): Lead {
  const { rating, reviews } = parseRating(textOf(panel, SELECTORS.ratingBlock));
  const site = panel.querySelector<HTMLAnchorElement>(SELECTORS.website)?.href ?? '';
  return {
    id: crypto.randomUUID(),
    nome: normalizeText(panel.getAttribute('aria-label')) || card.name,
    categoria: textOf(panel, SELECTORS.category),
    nota: rating,
    avaliacoes: reviews,
    endereco: textOf(panel, SELECTORS.address),
    telefone: textOf(panel, SELECTORS.phone),
    telefone_e164: '',
    eh_celular: false,
    site,
    dominio: '',
    emails: [],
    whatsapp: [],
    redes_sociais: [],
    url_maps: card.url,
    busca_origem: searchQuery,
    coletado_em: new Date().toISOString(),
    status_enriquecimento: site ? 'pendente' : 'sem_site',
  };
}

async function runCollection(settings: CollectionSettings): Promise<void> {
  const progress: Progress = { ...EMPTY_PROGRESS };
  const searchQuery = readSearchQuery();
  let previousName = '';
  let errorMessage = '';

  try {
    const knownPlaces = await readKnownPlaces();
    await scrollListToEnd(settings);
    const cards = listCards().slice(0, settings.limit);
    progress.found = cards.length;
    sendEvent({ type: 'PROGRESS', progress: { ...progress } });

    if (cards.length === 0) {
      errorMessage = MAPS_CHANGED_MESSAGE;
      return;
    }

    for (const card of cards) {
      await checkpoint();
      if (knownPlaces.has(placeKey(card.url))) {
        // já coletado antes (retomada ou busca sobreposta)
        progress.skipped++;
        progress.processed++;
        sendEvent({ type: 'PROGRESS', progress: { ...progress } });
        continue;
      }
      try {
        card.element.scrollIntoView({ block: 'center' });
        card.element.click();
        const panel = await waitForDetails(card.name, previousName);
        previousName = normalizeText(panel.getAttribute('aria-label'));
        const lead = extractLead(panel, card, searchQuery);
        if (lead.telefone) progress.withPhone++;
        sendEvent({ type: 'LEAD_FOUND', lead });
      } catch (error) {
        if (error instanceof CancelledError) throw error;
        // RF1.5: registra o erro e segue para o próximo
        console.warn('[LeadMapper] falha ao coletar item:', card.name, error);
        progress.failures++;
      }
      progress.processed++;
      sendEvent({ type: 'PROGRESS', progress: { ...progress } });
      await randomDelay(settings.speed);
    }

    // nenhum item deu certo: quase certamente os seletores deixaram de funcionar
    const attempted = progress.processed - progress.skipped;
    if (attempted > 0 && progress.failures === attempted) errorMessage = MAPS_CHANGED_MESSAGE;
  } catch (error) {
    if (!(error instanceof CancelledError)) {
      console.error('[LeadMapper] coleta interrompida:', error);
      errorMessage = MAPS_CHANGED_MESSAGE;
    }
  } finally {
    if (disposed) return;
    if (errorMessage && !cancelRequested) {
      state = 'error';
      sendEvent({ type: 'ERROR', message: errorMessage, progress });
    } else {
      state = cancelRequested ? 'cancelled' : 'done';
      sendEvent({ type: 'DONE', progress });
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
