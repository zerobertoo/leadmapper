import { placeId, placeKey } from '../shared/domain';
import type { Lead } from '../shared/types';
import { SELECTORS } from './selectors';

type SelectorList = readonly string[];

export interface ResultCard {
  name: string;
  url: string;
  element: HTMLAnchorElement;
}

export const normalizeText = (text: string | null | undefined) =>
  (text ?? '').replace(/\s+/g, ' ').trim();

/** Primeiro elemento achado pelos seletores, na ordem de preferência. */
export function queryFirst<T extends Element = HTMLElement>(
  root: ParentNode,
  selectors: SelectorList,
): T | null {
  for (const selector of selectors) {
    const found = root.querySelector<T>(selector);
    if (found) return found;
  }
  return null;
}

/** Texto do elemento; na falta, o aria-label (ícones de estrelas não têm texto). */
function textOf(root: ParentNode, selectors: SelectorList): string {
  const element = queryFirst(root, selectors);
  return normalizeText(element?.textContent) || normalizeText(element?.getAttribute('aria-label'));
}

/** "5,0 (1.234)" ou "4,8 estrelas 132 avaliações" -> { rating: 5, reviews: 1234 } */
export function parseRating(text: string): { rating: number | null; reviews: number | null } {
  const ratingMatch = text.match(/(\d+(?:[.,]\d+)?)/);
  const reviewsMatch =
    text.match(/\(([\d.,]+)\)/) ?? text.match(/([\d.,]+)\s*(?:avalia|review|opini)/i);
  return {
    rating: ratingMatch ? Number(ratingMatch[1].replace(',', '.')) : null,
    reviews: reviewsMatch ? Number(reviewsMatch[1].replace(/[.,]/g, '')) : null,
  };
}

export function listCards(root: ParentNode = document): ResultCard[] {
  const feed = queryFirst(root, SELECTORS.resultsFeed);
  if (!feed) return [];
  const seenUrls = new Set<string>();
  const cards: ResultCard[] = [];
  for (const element of feed.querySelectorAll<HTMLAnchorElement>(SELECTORS.resultCard[0])) {
    if (seenUrls.has(element.href)) continue;
    seenUrls.add(element.href);
    cards.push({ name: normalizeText(element.getAttribute('aria-label')), url: element.href, element });
  }
  return cards;
}

/** Painel de detalhes já carregado (com endereço, telefone ou site). */
export function findDetailsPanel(root: ParentNode = document): HTMLElement | null {
  for (const panel of root.querySelectorAll<HTMLElement>(SELECTORS.detailsPanel[0])) {
    if (queryFirst(panel, SELECTORS.detailsLoadedMarker)) return panel;
  }
  return null;
}

/** Assinatura do painel (endereço + telefone), para distinguir lojas de mesmo nome. */
export function panelSignature(panel: HTMLElement): string {
  return `${textOf(panel, SELECTORS.address)}|${textOf(panel, SELECTORS.phone)}`;
}

export interface PanelCheck {
  shownName: string;
  expectedName: string;
  previousName: string;
  signature: string;
  previousSignature: string;
  /** URL atual da página e a do cartão clicado. */
  currentUrl: string;
  cardUrl: string;
  previousUrl: string;
}

/**
 * Decide se o painel mostrado é o da empresa clicada (e não o da anterior).
 * Com o id do Maps na URL, ele manda; sem ele, exige que a URL tenha mudado.
 * Dois painéis com mesmo nome e mesma assinatura são o mesmo painel (obsoleto).
 */
export function isPanelForCard(check: PanelCheck): boolean {
  if (!check.shownName) return false;

  const wanted = placeId(check.cardUrl);
  const current = placeId(check.currentUrl);
  if (wanted && current) {
    if (wanted !== current) return false;
  } else if (placeKey(check.currentUrl) === placeKey(check.previousUrl)) {
    // sem id para conferir: a URL precisa ter mudado desde a empresa anterior
    return false;
  }

  const stale =
    check.previousName !== '' &&
    check.shownName === check.previousName &&
    check.signature === check.previousSignature;
  return !stale;
}

export function extractLead(panel: HTMLElement, card: ResultCard, searchQuery: string): Lead {
  const { rating, reviews } = parseRating(textOf(panel, SELECTORS.ratingBlock));
  const site = queryFirst<HTMLAnchorElement>(panel, SELECTORS.website)?.href ?? '';
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

/** Campos que, vazios em quase todos os itens, indicam seletor quebrado. */
const WATCHED_FIELDS = [
  ['categoria', 'categoria'],
  ['endereco', 'endereço'],
  ['nota', 'nota'],
] as const satisfies readonly (readonly [keyof Lead, string])[];

const MIN_ITEMS_FOR_WARNING = 10;
const MAX_FILLED_RATIO = 0.2;

/** Mensagens para os campos vazios em ≥80% dos itens (só a partir de 10 itens). */
export function fieldWarnings(leads: Lead[]): string[] {
  if (leads.length < MIN_ITEMS_FOR_WARNING) return [];
  const warnings: string[] = [];
  for (const [field, label] of WATCHED_FIELDS) {
    const filled = leads.filter((lead) => lead[field] !== '' && lead[field] !== null).length;
    if (filled / leads.length <= MAX_FILLED_RATIO) {
      warnings.push(`O campo "${label}" veio vazio em ${leads.length - filled} de ${leads.length} itens; o Maps pode ter mudado.`);
    }
  }
  return warnings;
}
