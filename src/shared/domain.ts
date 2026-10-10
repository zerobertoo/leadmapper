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

/** localhost, nomes de rede local e IPs privados: a extensão não deve visitá-los a pedido de uma ficha do Maps. */
export function isPrivateHost(host: string): boolean {
  const name = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (name === 'localhost' || name.endsWith('.localhost') || name.endsWith('.local') || name.endsWith('.internal')) {
    return true;
  }
  if (!name.includes('.') && !name.includes(':')) return true; // nome sem ponto: só existe na rede local
  const octets = name.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)?.slice(1).map(Number);
  if (octets) {
    const [a, b] = octets;
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    );
  }
  return name.includes(':') && (name === '::1' || name === '::' || /^f[cd]/.test(name) || /^fe80/.test(name));
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
