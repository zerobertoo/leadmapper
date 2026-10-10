import { mergeIntoList } from './dedupe';
import {
  EMPTY_PROGRESS,
  STORAGE_KEYS,
  type CollectionState,
  type Lead,
  type Progress,
} from './types';

export async function readLeads(): Promise<Lead[]> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.leads);
  return (stored[STORAGE_KEYS.leads] as Lead[] | undefined) ?? [];
}

/**
 * Grava leads novos mesclando duplicados com os já salvos (inclusive de buscas
 * anteriores). Leitura e escrita não são atômicas: quem chama deve serializar.
 */
export async function upsertLeads(incoming: Lead[]): Promise<void> {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.leads, STORAGE_KEYS.duplicates]);
  const existing = (stored[STORAGE_KEYS.leads] as Lead[] | undefined) ?? [];
  const previousDuplicates = (stored[STORAGE_KEYS.duplicates] as number | undefined) ?? 0;
  // a mesma mensagem entregue duas vezes traz o mesmo id: não conta como duplicado
  const knownIds = new Set(existing.map((lead) => lead.id));
  const fresh = incoming.filter((lead) => !knownIds.has(lead.id));
  const { leads, duplicates } = mergeIntoList(existing, fresh);
  await chrome.storage.local.set({
    [STORAGE_KEYS.leads]: leads,
    [STORAGE_KEYS.duplicates]: previousDuplicates + duplicates,
  });
}

export type EnrichmentPatch = Partial<
  Pick<Lead, 'emails' | 'whatsapp' | 'redes_sociais' | 'status_enriquecimento'>
>;

/**
 * Atualiza um lead com os dados achados no site (listas são unidas às
 * existentes). Ignora ids que não existem mais, por exemplo após limpar a lista
 * ou mesclar duplicados. Quem chama deve serializar, como em upsertLeads.
 */
export async function patchLead(id: string, patch: EnrichmentPatch): Promise<void> {
  const leads = await readLeads();
  const index = leads.findIndex((lead) => lead.id === id);
  if (index === -1) return;

  const lead = leads[index];
  const union = (a: string[], b: string[] = []) => [...new Set([...a, ...b])];
  // fonte e data dos dados que o site acrescentou (RF4.2)
  const fromSite = { origem: 'site', em: new Date().toISOString() } as const;
  const gained = (field: 'emails' | 'whatsapp' | 'redes_sociais') =>
    (patch[field] ?? []).some((value) => !lead[field].includes(value));
  leads[index] = {
    ...lead,
    fontes: {
      ...lead.fontes,
      ...(gained('emails') && { emails: fromSite }),
      ...(gained('whatsapp') && { whatsapp: fromSite }),
      ...(gained('redes_sociais') && { redes_sociais: fromSite }),
    },
    emails: union(lead.emails, patch.emails),
    whatsapp: union(lead.whatsapp, patch.whatsapp),
    redes_sociais: union(lead.redes_sociais, patch.redes_sociais),
    status_enriquecimento: patch.status_enriquecimento ?? lead.status_enriquecimento,
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.leads]: leads });
}

export async function readDuplicates(): Promise<number> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.duplicates);
  return (stored[STORAGE_KEYS.duplicates] as number | undefined) ?? 0;
}

/** Apaga leads, contadores e estado (RF4.3). */
export function clearAll(): Promise<void> {
  return chrome.storage.local.remove(Object.values(STORAGE_KEYS));
}

export async function readState(): Promise<CollectionState> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.state);
  return (stored[STORAGE_KEYS.state] as CollectionState | undefined) ?? 'idle';
}

export function writeState(state: CollectionState): Promise<void> {
  return chrome.storage.local.set({ [STORAGE_KEYS.state]: state });
}

export async function readProgress(): Promise<Progress> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.progress);
  return (stored[STORAGE_KEYS.progress] as Progress | undefined) ?? EMPTY_PROGRESS;
}

export function writeProgress(progress: Progress): Promise<void> {
  return chrome.storage.local.set({ [STORAGE_KEYS.progress]: progress });
}
