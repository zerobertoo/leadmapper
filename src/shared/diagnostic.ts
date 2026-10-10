import { LOG_STORAGE_KEY, MAX_LOG_ENTRIES } from './types';

export interface LogEntry {
  /** ISO 8601 */
  em: string;
  texto: string;
}

export async function readLog(): Promise<LogEntry[]> {
  const stored = await chrome.storage.local.get(LOG_STORAGE_KEY);
  return (stored[LOG_STORAGE_KEY] as LogEntry[] | undefined) ?? [];
}

/** Acrescenta uma linha ao log local, mantendo só as últimas MAX_LOG_ENTRIES. */
export async function appendLog(text: string, now: Date = new Date()): Promise<void> {
  const log = await readLog();
  log.push({ em: now.toISOString(), texto: text });
  await chrome.storage.local.set({ [LOG_STORAGE_KEY]: log.slice(-MAX_LOG_ENTRIES) });
}

export function clearLog(): Promise<void> {
  return chrome.storage.local.remove(LOG_STORAGE_KEY);
}
