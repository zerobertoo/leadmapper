import { extractDomain, isSocialDomain } from './domain';
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
  return {
    ...lead,
    telefone_e164: phone?.e164 ?? '',
    eh_celular: phone?.isMobile ?? false,
    dominio,
    redes_sociais: redesSociais,
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
  if (domain && !isSocialDomain(domain)) return `dom:${domain}`;
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

/** Mantém o registro mais completo e preenche os campos vazios com o outro (RF3.3). */
export function mergeLeads(first: Lead, second: Lead): Lead {
  const [base, other] = completeness(second) > completeness(first) ? [second, first] : [first, second];
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(other)) {
    if (!isFilled(merged[key]) && isFilled(value)) merged[key] = value;
  }
  for (const field of ['emails', 'whatsapp', 'redes_sociais'] as const) {
    merged[field] = [...new Set([...base[field], ...other[field]])];
  }
  if (other.status_enriquecimento === 'ok') merged.status_enriquecimento = 'ok';
  return deriveFields(merged as unknown as Lead);
}

/** Acrescenta `incoming` a `existing`, mesclando duplicados. */
export function mergeIntoList(
  existing: Lead[],
  incoming: Lead[],
): { leads: Lead[]; duplicates: number } {
  const leads = [...existing];
  const indexByKey = new Map(leads.map((lead, index) => [dedupeKey(lead), index]));
  let duplicates = 0;

  for (const lead of incoming) {
    const key = dedupeKey(lead);
    const index = indexByKey.get(key);
    if (index === undefined) {
      indexByKey.set(key, leads.length);
      leads.push(lead);
    } else {
      leads[index] = mergeLeads(leads[index], lead);
      duplicates++;
    }
  }
  return { leads, duplicates };
}
