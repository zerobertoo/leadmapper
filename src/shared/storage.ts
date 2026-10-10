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
  const { leads, duplicates } = mergeIntoList(existing, incoming);
  await chrome.storage.local.set({
    [STORAGE_KEYS.leads]: leads,
    [STORAGE_KEYS.duplicates]: previousDuplicates + duplicates,
  });
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
