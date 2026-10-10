import { parseBrazilianPhone } from './phone';

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}/gi;
const MAILTO_PATTERN = /mailto:([^"'?#\s<>]+)/gi;
const FULL_EMAIL_PATTERN = new RegExp(`^${EMAIL_PATTERN.source}$`, 'i');

// "foto@2x.png" parece e-mail, mas a "extensão" é de arquivo
const FILE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif', 'css', 'js', 'json',
  'woff', 'woff2', 'ttf', 'eot', 'mp4', 'pdf', 'html', 'php',
]);

// domínios de exemplo, hospedagem e serviços de terceiros embutidos nas páginas
const BLOCKED_DOMAINS = [
  'example.com', 'example.org', 'email.com', 'domain.com', 'dominio.com', 'seudominio.com',
  'seudominio.com.br', 'meudominio.com', 'meudominio.com.br', 'yourdomain.com', 'test.com',
  'teste.com', 'exemplo.com', 'exemplo.com.br', 'exemplo.org', 'whatsapp.com', 'whatsapp.com.br',
  'sentry.io', 'wixpress.com', 'wix.com', 'godaddy.com', 'squarespace.com',
  'shopify.com', 'wordpress.com', 'cloudflare.com', 'w3.org', 'schema.org',
];

const BLOCKED_LOCAL_PARTS = /^(no-?reply|do-?not-?reply)$/i;

// limite por empresa, para não guardar a lista de e-mails de um blog inteiro
export const MAX_EMAILS = 5;

function isUsefulEmail(email: string): boolean {
  if (!FULL_EMAIL_PATTERN.test(email)) return false;
  const [local, domain] = email.split('@');
  const tld = domain.split('.').pop()!;
  if (FILE_EXTENSIONS.has(tld)) return false;
  if (BLOCKED_LOCAL_PARTS.test(local)) return false;
  return !BLOCKED_DOMAINS.some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`));
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** E-mails de links `mailto:` e do texto da página, sem falsos positivos (RF2.2). */
export function extractEmails(rawHtml: string): string[] {
  // texto de scripts traz sequências literais como \n e >, que grudariam no começo do e-mail
  const html = rawHtml.replace(/\\u[0-9a-f]{4}/gi, ' ').replace(/\\[nrt]/g, ' ');
  const candidates: string[] = [];
  for (const match of html.matchAll(MAILTO_PATTERN)) {
    candidates.push(...safeDecode(match[1]).split(/[,;]/));
  }
  candidates.push(...(html.match(EMAIL_PATTERN) ?? []));

  const unique = new Set<string>();
  for (const candidate of candidates) {
    const email = candidate.trim().toLowerCase();
    if (isUsefulEmail(email)) unique.add(email);
  }
  return [...unique].slice(0, MAX_EMAILS);
}

const WHATSAPP_PATTERNS = [
  /wa\.me\/\+?(\d{8,15})/gi,
  /(?:api|web)\.whatsapp\.com\/send\/?\?[^"'\s<>]*?phone=\+?(\d{8,15})/gi,
  /whatsapp:\/\/send\?[^"'\s<>]*?phone=\+?(\d{8,15})/gi,
];

/** Número de WhatsApp em formato internacional (+55...), ou null se inválido. */
export function normalizeWhatsappNumber(digits: string): string | null {
  const brazilian = parseBrazilianPhone(digits);
  if (brazilian) return brazilian.e164;
  // número de outro país: guarda como veio, em formato internacional
  return digits.length >= 11 && !digits.startsWith('55') ? `+${digits}` : null;
}

/** Links de WhatsApp (wa.me, api.whatsapp.com, web.whatsapp.com), normalizados (RF2.3). */
export function extractWhatsappNumbers(html: string): string[] {
  const unique = new Set<string>();
  for (const pattern of WHATSAPP_PATTERNS) {
    for (const match of html.matchAll(pattern)) {
      const number = normalizeWhatsappNumber(match[1]);
      if (number) unique.add(number);
    }
  }
  return [...unique];
}

const SOCIAL_PATTERN = /https?:\/\/(?:www\.)?(instagram|facebook)\.com\/([a-z0-9_.-]+)/gi;
// caminhos que não são perfis (compartilhar, pixels, páginas internas)
const NOT_A_PROFILE = new Set([
  'sharer', 'sharer.php', 'share', 'share.php', 'plugins', 'tr', 'dialog', 'p', 'reel', 'reels',
  'explore', 'login', 'login.php', 'pages', 'profile.php', 'groups', 'events', 'watch', 'policies',
  'privacy', 'help', 'about', 'accounts', 'stories', 'tv',
]);

/** Primeiro perfil de Instagram e de Facebook encontrado na página. */
export function extractSocialProfiles(html: string): string[] {
  const found = new Map<string, string>();
  for (const match of html.matchAll(SOCIAL_PATTERN)) {
    const network = match[1].toLowerCase();
    const handle = match[2].replace(/\.+$/, '');
    if (found.has(network) || NOT_A_PROFILE.has(handle.toLowerCase())) continue;
    found.set(network, `https://www.${network}.com/${handle}`);
  }
  return [...found.values()];
}

const CONTACT_PATH = /(contato|contact|fale-?conosco|sobre|about)/i;
const FALLBACK_PATHS = ['/contato', '/fale-conosco', '/contact', '/sobre'];
const ASSET_EXTENSION = /\.(pdf|jpe?g|png|gif|svg|webp|zip|docx?|xlsx?)$/i;
const MAX_CONTACT_PAGES = 3;

/**
 * Páginas de contato do mesmo site: links da home que parecem contato e, para
 * completar, caminhos comuns. Retorna no máximo 3 URLs (RF2.1).
 */
export function findContactPages(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const sameSite = (url: URL) =>
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    url.hostname.replace(/^www\./, '') === base.hostname.replace(/^www\./, '');

  const pages = new Set<string>();
  const homeKey = (url: URL) => url.origin + url.pathname.replace(/\/$/, '');
  const home = homeKey(base);

  for (const match of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      const url = new URL(match[1].replace(/&amp;/g, '&'), base);
      if (!sameSite(url) || !CONTACT_PATH.test(url.pathname) || ASSET_EXTENSION.test(url.pathname)) continue;
      if (homeKey(url) !== home) pages.add(url.origin + url.pathname);
    } catch {
      // href inválido
    }
  }
  for (const path of FALLBACK_PATHS) pages.add(base.origin + path);
  return [...pages].slice(0, MAX_CONTACT_PAGES);
}
