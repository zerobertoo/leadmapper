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
  'teste.com', 'exemplo.com', 'exemplo.com.br', 'exemplo.org', 'email.com.br', 'whatsapp.com', 'whatsapp.com.br',
  'sentry.io', 'wixpress.com', 'wix.com', 'godaddy.com', 'squarespace.com',
  'shopify.com', 'wordpress.com', 'cloudflare.com', 'w3.org', 'schema.org',
];

// no-reply e textos de modelo de formulário ("seuemail@...")
const BLOCKED_LOCAL_PARTS = /^(no-?reply|do-?not-?reply|seu-?e-?mail|seu-?nome|nome|e-?mail)$/i;

// limite por empresa, para não guardar a lista de e-mails de um blog inteiro
export const MAX_EMAILS = 5;

// TLDs genéricos aceitos; os de 2 letras (países) passam sempre
const GENERIC_TLDS = new Set([
  'com', 'net', 'org', 'edu', 'gov', 'mil', 'int', 'info', 'biz', 'app', 'dev', 'online', 'site',
  'store', 'shop', 'tech', 'xyz', 'club', 'pro', 'blog', 'cloud', 'digital', 'email', 'agency',
  'link', 'live', 'life', 'world', 'today', 'center', 'clinic', 'health', 'dental', 'med', 'adv',
]);

function isUsefulEmail(email: string): boolean {
  if (!FULL_EMAIL_PATTERN.test(email)) return false;
  const [local, domain] = email.split('@');
  const tld = domain.split('.').pop()!;
  if (FILE_EXTENSIONS.has(tld)) return false;
  // "n@crisvet.taki": local de 1 letra e TLD inexistente são lixo de script
  if (local.length < 2 || (tld.length > 2 && !GENERIC_TLDS.has(tld))) return false;
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

// crédito de quem fez o site ("desenvolvido por ..."): o e-mail ao lado é da agência
const CREDIT_PATTERN =
  /(?:desenvolvid[oa]s?|criad[oa]s?|feit[oa]s?|hospedad[oa]s?)\s+(?:por|pel[oa])\b|(?:created|developed|designed|powered|made|hosted)\s+by\b|(?:design|site|web)\s+by\b/gi;
const CREDIT_REGEX = new RegExp(`(?:${CREDIT_PATTERN.source})[\\s\\S]{0,300}`, 'gi');

/** E-mails de links `mailto:` e do texto da página, sem falsos positivos (RF2.2). */
export function extractEmails(rawHtml: string): string[] {
  // texto de scripts traz sequências literais como \n e >, que grudariam no começo do e-mail
  const html = rawHtml.replace(CREDIT_REGEX, ' ').replace(/\\u[0-9a-f]{4}/gi, ' ').replace(/\\[nrt]/g, ' ');
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

// redes extras: só perfis de empresa ou de canal, nunca de pessoa (LinkedIn /in/)
const EXTRA_SOCIAL: [string, RegExp, (handle: string) => string][] = [
  ['linkedin', /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/company\/([a-z0-9_.%-]+)/gi, (h) => `https://www.linkedin.com/company/${h}`],
  ['youtube', /https?:\/\/(?:www\.)?youtube\.com\/(@[a-z0-9_.-]+|channel\/[a-z0-9_-]+|c\/[a-z0-9_.-]+|user\/[a-z0-9_.-]+)/gi, (h) => `https://www.youtube.com/${h}`],
  ['tiktok', /https?:\/\/(?:www\.)?tiktok\.com\/(@[a-z0-9_.]+)/gi, (h) => `https://www.tiktok.com/${h}`],
];

/** Primeiro perfil de cada rede (Instagram, Facebook, LinkedIn da empresa, YouTube, TikTok). */
export function extractSocialProfiles(html: string): string[] {
  const found = new Map<string, string>();
  for (const [network, pattern, toUrl] of EXTRA_SOCIAL) {
    const match = html.matchAll(pattern).next().value;
    if (match) found.set(network, toUrl(match[1].replace(/[.]+$/, '')));
  }
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

// provedores de e-mail pessoal: valem como contato de pequenas empresas
const PERSONAL_PROVIDERS = new Set([
  'gmail.com', 'hotmail.com', 'outlook.com', 'live.com', 'yahoo.com', 'yahoo.com.br',
  'uol.com.br', 'bol.com.br', 'terra.com.br', 'icloud.com', 'msn.com', 'ig.com.br',
]);

const SECOND_LEVEL = new Set(['com', 'net', 'org', 'gov', 'edu', 'ind', 'eco', 'adv', 'med']);

// nome da marca no domínio: "zee-dog.com" e "zeedog.com.br" viram "zeedog"
function brandOf(domain: string): string {
  const labels = domain.split('.');
  const suffixLength = labels.length >= 3 && SECOND_LEVEL.has(labels[labels.length - 2]) ? 2 : 1;
  const brand = labels[Math.max(0, labels.length - suffixLength - 1)] ?? domain;
  return brand.replace(/-/g, '');
}

export type EmailKind = 'proprio' | 'pessoal' | 'terceiro';

/** `proprio`: mesma marca do site; `pessoal`: Gmail e afins; `terceiro`: o resto (agência, rede, modelo). */
export function classifyEmail(email: string, siteDomain: string): EmailKind {
  const domain = email.split('@')[1] ?? '';
  const emailBrand = brandOf(domain);
  const siteBrand = brandOf(siteDomain);
  const sameBrand =
    emailBrand === siteBrand ||
    (Math.min(emailBrand.length, siteBrand.length) >= 4 &&
      (emailBrand.startsWith(siteBrand) || siteBrand.startsWith(emailBrand)));
  if (sameBrand) return 'proprio';
  return PERSONAL_PROVIDERS.has(domain) ? 'pessoal' : 'terceiro';
}

/** Mantém e-mails do próprio domínio e de provedores pessoais, os do domínio primeiro. */
export function keepOwnEmails(emails: string[], siteDomain: string): string[] {
  const kinds = emails.map((email) => [email, classifyEmail(email, siteDomain)] as const);
  return [
    ...kinds.filter(([, kind]) => kind === 'proprio'),
    ...kinds.filter(([, kind]) => kind === 'pessoal'),
  ].map(([email]) => email);
}

// parte local de e-mails de setor ou de caixa compartilhada
const GENERIC_LOCAL_PARTS = new Set([
  'contato', 'contatos', 'comercial', 'vendas', 'atendimento', 'sac', 'suporte', 'financeiro', 'adm',
  'administrativo', 'administracao', 'recepcao', 'secretaria', 'faleconosco', 'info', 'ouvidoria',
  'marketing', 'rh', 'compras', 'orcamento', 'orcamentos', 'agendamento', 'agenda', 'pedidos',
  'loja', 'clinica', 'escritorio', 'geral', 'cliente', 'clientes', 'imprensa', 'duvidas', 'ajuda',
]);

export type EmailType = 'generico' | 'pessoal';

/**
 * `generico` para caixas de setor (contato@, vendas@); `pessoal` quando parece
 * nome de gente (joao.silva@ ou provedor pessoal com nome próprio). É heurística:
 * serve para o aviso de LGPD, não para validar contato.
 */
export function classifyEmailType(email: string): EmailType {
  const [local] = email.split('@');
  const normalized = local.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[._-]/g, '');
  if (GENERIC_LOCAL_PARTS.has(normalized)) return 'generico';
  return /^[a-z]{2,}[._-][a-z]{2,}$/.test(local) ? 'pessoal' : 'generico';
}
