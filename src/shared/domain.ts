/** Domínios de perfis de redes sociais e agregadores de links (RF2.5). */
export const SOCIAL_DOMAINS = ['instagram.com', 'facebook.com', 'linktr.ee'];

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

/**
 * Identificador estável de uma empresa a partir do link do Maps: o par de ids
 * `0x...:0x...`; na falta dele, o caminho sem parâmetros de rastreamento.
 */
export function placeKey(mapsUrl: string): string {
  const id = mapsUrl.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  if (id) return id[1].toLowerCase();
  try {
    const url = new URL(mapsUrl);
    return url.origin + url.pathname;
  } catch {
    return mapsUrl;
  }
}
