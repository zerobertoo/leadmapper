/** Comandos de controle da coleta, enviados do popup até o content script. */
export type CollectionCommand = 'START' | 'PAUSE' | 'RESUME' | 'CANCEL';

/** Estado da coleta, persistido em chrome.storage.local. */
export type CollectionState = 'idle' | 'running' | 'paused' | 'cancelled';

/** Mensagens aceitas pelo service worker (vindas do popup). */
export type PopupMessage = { type: 'GET_STATUS' } | { type: CollectionCommand };

/** Mensagens aceitas pelo content script (vindas do service worker). */
export type ContentMessage = { type: 'PING' } | { type: CollectionCommand };

/** Resposta do content script a qualquer mensagem. */
export interface ContentReply {
  ok: true;
  /** Há uma lista de resultados de busca visível no Maps. */
  hasResults: boolean;
}

/** Resposta do service worker ao popup. */
export type StatusReply =
  | { kind: 'outside_maps' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; state: CollectionState; hasResults: boolean };

export const STATE_STORAGE_KEY = 'collectionState';
