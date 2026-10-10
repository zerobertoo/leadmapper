import { extractDomain, isSocialDomain, isWhatsappDomain } from './domain';
import { normalizeWhatsappNumber } from './extract';
import { parseBrazilianPhone } from './phone';
import type { Lead } from './types';

/** Preenche os campos derivados (telefone normalizado, celular, domínio, rede social). */
export function deriveFields(lead: Lead): Lead {
  const phone = parseBrazilianPhone(lead.telefone);
  const dominio = extractDomain(lead.site);
  const redesSociais = [...lead.redes_sociais];
  if (lead.site && isSocialDomain(dominio) && !redesSociais.includes(lead.site)) {
    redesSociais.push(lead.site);
  }
  // site do Maps que é link de WhatsApp: o número vira WhatsApp do lead
  const whatsapp = [...lead.whatsapp];
  if (lead.site && isWhatsappDomain(dominio)) {
    const digits = lead.site.match(/(?:wa\.me\/|phone=)\+?(\d{8,15})/i)?.[1];
    const number = digits ? normalizeWhatsappNumber(digits) : null;
    if (number && !whatsapp.includes(number)) whatsapp.push(number);
  }
  return {
    ...lead,
    telefone_e164: phone?.e164 ?? '',
    eh_celular: phone?.isMobile ?? false,
    dominio,
    redes_sociais: redesSociais,
    whatsapp,
  };
}

// minúsculas, sem acentos e sem pontuação
function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Chave de deduplicação (RF3.2): telefone normalizado; na falta, domínio do
 * site (exceto redes sociais, que juntariam empresas diferentes); na falta,
 * nome + endereço normalizados.
 */
export function dedupeKey(lead: Lead): string {
  const phone = lead.telefone_e164 || parseBrazilianPhone(lead.telefone)?.e164;
  if (phone) return `tel:${phone}`;
  const domain = lead.dominio || extractDomain(lead.site);
  if (domain && !isSocialDomain(domain) && !isWhatsappDomain(domain)) return `dom:${domain}`;
  return `nome:${normalizeText(lead.nome)}|${normalizeText(lead.endereco)}`;
}

function isFilled(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value !== '' && value !== null && value !== undefined;
}

const COMPLETENESS_FIELDS = [
  'nome', 'categoria', 'nota', 'avaliacoes', 'endereco', 'telefone', 'site',
  'emails', 'whatsapp', 'redes_sociais',
] as const satisfies readonly (keyof Lead)[];

function completeness(lead: Lead): number {
  return COMPLETENESS_FIELDS.filter((field) => isFilled(lead[field])).length;
}

// números e CEP: duas lojas da mesma rua têm números diferentes
const numbersOf = (text: string) => new Set(text.match(/\d+/g) ?? []);

/**
 * Endereços de uma mesma empresa: iguais, um contido no outro, ou quase os mesmos
 * termos com os mesmos números. Sem endereço de um dos lados, não há como negar.
 */
export function sameAddress(first: string, second: string): boolean {
  const a = normalizeText(first);
  const b = normalizeText(second);
  // contido por palavras inteiras: "rua a 10" está em "rua a 10 centro", mas "av x 1" não está em "av x 150"
  if (!a || !b || a === b || ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `)) return true;
  const tokensA = new Set(a.split(' '));
  const tokensB = new Set(b.split(' '));
  const shared = [...tokensA].filter((token) => tokensB.has(token)).length;
  const numbersA = numbersOf(a);
  const numbersB = numbersOf(b);
  const sameNumbers =
    [...numbersA].every((n) => numbersB.has(n)) && [...numbersB].every((n) => numbersA.has(n));
  return shared / Math.min(tokensA.size, tokensB.size) >= 0.8 && sameNumbers;
}

/** Mantém o registro mais completo e preenche os campos vazios com o outro (RF3.3). */
export function mergeLeads(first: Lead, second: Lead): Lead {
  const [base, other] = completeness(second) > completeness(first) ? [second, first] : [first, second];
  // o id do primeiro (o que já estava salvo) permanece: seleção, status e patches em voo apontam para ele
  const merged: Record<string, unknown> = { ...base, id: first.id };
  for (const [key, value] of Object.entries(other)) {
    if (!isFilled(merged[key]) && isFilled(value)) merged[key] = value;
  }
  for (const field of ['emails', 'whatsapp', 'redes_sociais'] as const) {
    merged[field] = [...new Set([...base[field], ...other[field]])];
  }
  // guarda os links dos cartões fundidos, para a retomada não revisitá-los
  const urls = [
    other.url_maps, ...(base.urls_maps_extras ?? []), ...(other.urls_maps_extras ?? []),
  ].filter((url) => url && url !== base.url_maps);
  merged.urls_maps_extras = [...new Set(urls)];
  merged.fontes = { ...other.fontes, ...base.fontes };
  const tags = [...new Set([...(base.tags ?? []), ...(other.tags ?? [])])];
  if (tags.length > 0) merged.tags = tags;
  if (other.status_enriquecimento === 'ok') merged.status_enriquecimento = 'ok';
  return deriveFields(merged as unknown as Lead);
}

/** Acrescenta `incoming` a `existing`, mesclando duplicados. */
export function mergeIntoList(
  existing: Lead[],
  incoming: Lead[],
): { leads: Lead[]; duplicates: number } {
  const leads = [...existing];
  // uma chave pode ter várias unidades (mesmo telefone ou domínio, endereços diferentes)
  const indexesByKey = new Map<string, number[]>();
  const register = (key: string, index: number) => {
    const known = indexesByKey.get(key);
    if (known) known.push(index);
    else indexesByKey.set(key, [index]);
  };
  for (const [index, lead] of leads.entries()) register(dedupeKey(lead), index);
  let duplicates = 0;

  for (const lead of incoming) {
    const key = dedupeKey(lead);
    const sameUnit = indexesByKey.get(key)?.find((index) => sameAddress(leads[index].endereco, lead.endereco));
    if (sameUnit === undefined) {
      register(key, leads.length);
      leads.push(lead);
    } else {
      leads[sameUnit] = mergeLeads(leads[sameUnit], lead);
      duplicates++;
    }
  }
  return { leads, duplicates };
}
