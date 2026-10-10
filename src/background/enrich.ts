import { extractDomain } from '../shared/domain';
import {
  MAX_EMAILS,
  extractEmails,
  extractSocialProfiles,
  extractWhatsappNumbers,
  findContactPages,
  keepOwnEmails,
} from '../shared/extract';

const REQUEST_TIMEOUT_MS = 10_000;
const MIN_INTERVAL_PER_DOMAIN_MS = 1000;
const MAX_HTML_LENGTH = 1_500_000;

export interface SiteEnrichment {
  emails: string[];
  whatsapp: string[];
  redes_sociais: string[];
  status: 'ok' | 'erro';
}

export interface EnrichOptions {
  fetchImpl?: typeof fetch;
  /** Espera a vez do domínio (RF2.6). Injetável nos testes. */
  waitTurn?: (domain: string) => Promise<void>;
  timeoutMs?: number;
  /** Espera entre tentativas após 429/503. Injetável nos testes. */
  sleepImpl?: (ms: number) => Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// próximo horário livre por domínio; reserva o horário antes de esperar,
// então requisições concorrentes ao mesmo domínio ficam em fila
const nextFreeSlot = new Map<string, number>();

async function waitDomainTurn(domain: string): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextFreeSlot.get(domain) ?? 0);
  nextFreeSlot.set(domain, slot + MIN_INTERVAL_PER_DOMAIN_MS);
  if (slot > now) await sleep(slot - now);
}

async function fetchOnce(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { signal: controller.signal, credentials: 'omit' });
  } finally {
    clearTimeout(timer);
  }
}

/** Baixa uma página HTML, com uma nova tentativa em caso de falha de rede (RF2.4). */
async function fetchHtml(
  url: string,
  options: Required<EnrichOptions>,
): Promise<{ html: string; finalUrl: string } | null> {
  const domain = extractDomain(url);
  for (let attempt = 0; attempt < 2; attempt++) {
    await options.waitTurn(domain);
    try {
      const response = await fetchOnce(url, options.fetchImpl, options.timeoutMs);
      if ((response.status === 429 || response.status === 503) && attempt === 0) {
        // o site pediu para esperar: respeita Retry-After (máx. 10 s) e tenta uma vez mais
        const seconds = Number(response.headers.get('retry-after'));
        await options.sleepImpl(Math.min(Number.isFinite(seconds) && seconds > 0 ? seconds : 2, 10) * 1000);
        continue;
      }
      if (!response.ok) return null;
      const type = response.headers.get('content-type') ?? '';
      if (type && !/html|xml|text/i.test(type)) return null;
      const html = (await response.text()).slice(0, MAX_HTML_LENGTH);
      return { html, finalUrl: response.url || url };
    } catch {
      // falha de rede ou timeout: tenta de novo uma vez
    }
  }
  return null;
}

/**
 * Visita a home e até 3 páginas de contato do site e extrai e-mails, WhatsApp
 * e redes sociais. `erro` só quando a home não pôde ser lida.
 */
export async function enrichSite(siteUrl: string, overrides: EnrichOptions = {}): Promise<SiteEnrichment> {
  const options: Required<EnrichOptions> = {
    fetchImpl: overrides.fetchImpl ?? fetch,
    waitTurn: overrides.waitTurn ?? waitDomainTurn,
    timeoutMs: overrides.timeoutMs ?? REQUEST_TIMEOUT_MS,
    sleepImpl: overrides.sleepImpl ?? sleep,
  };

  const home = await fetchHtml(siteUrl, options);
  if (!home) return { emails: [], whatsapp: [], redes_sociais: [], status: 'erro' };

  const pages = [home.html];
  for (const pageUrl of findContactPages(home.html, home.finalUrl)) {
    const page = await fetchHtml(pageUrl, options);
    if (page) pages.push(page.html);
  }

  const unique = (values: string[]) => [...new Set(values)];
  return {
    emails: keepOwnEmails(unique(pages.flatMap(extractEmails)), extractDomain(home.finalUrl)).slice(0, MAX_EMAILS),
    whatsapp: unique(pages.flatMap(extractWhatsappNumbers)),
    redes_sociais: unique(pages.flatMap(extractSocialProfiles)),
    status: 'ok',
  };
}
