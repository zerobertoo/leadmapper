/** Domínios de perfis de redes sociais e agregadores de links (RF2.5). */
export const SOCIAL_DOMAINS = [
  'instagram.com', 'facebook.com', 'linktr.ee', 'linkedin.com', 'youtube.com', 'tiktok.com',
];

/** Host sem `www`, em minúsculas. Retorna '' se a URL for inválida. */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function isSocialDomain(domain: string): boolean {
  return SOCIAL_DOMAINS.some((social) => domain === social || domain.endsWith(`.${social}`));
}

/** Links de WhatsApp (wa.me, api.whatsapp.com, web.whatsapp.com). */
export function isWhatsappDomain(domain: string): boolean {
  return domain === 'wa.me' || domain === 'whatsapp.com' || domain.endsWith('.whatsapp.com');
}

/** URL que não é site da empresa: perfil de rede social ou link de WhatsApp. */
export function isNonWebsite(url: string): boolean {
  const domain = extractDomain(url);
  return isSocialDomain(domain) || isWhatsappDomain(domain);
}

/** Par de ids `0x...:0x...` do Maps na URL, ou null se não houver. */
export function placeId(mapsUrl: string): string | null {
  const id = mapsUrl.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  return id ? id[1].toLowerCase() : null;
}

/**
 * Identificador estável de uma empresa a partir do link do Maps: o par de ids
 * `0x...:0x...`; na falta dele, o caminho sem parâmetros de rastreamento.
 */
export function placeKey(mapsUrl: string): string {
  const id = placeId(mapsUrl);
  if (id) return id;
  try {
    const url = new URL(mapsUrl);
    return url.origin + url.pathname;
  } catch {
    return mapsUrl;
  }
}
