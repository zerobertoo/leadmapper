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

// leitura e escrita não são atômicas: quem chama deve serializar as chamadas
export async function appendLeads(newLeads: Lead[]): Promise<void> {
  const leads = await readLeads();
  await chrome.storage.local.set({ [STORAGE_KEYS.leads]: [...leads, ...newLeads] });
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
