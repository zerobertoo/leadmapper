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
