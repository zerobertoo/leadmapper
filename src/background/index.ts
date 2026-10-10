import {
  STATE_STORAGE_KEY,
  type CollectionState,
  type ContentMessage,
  type ContentReply,
  type PopupMessage,
  type StatusReply,
} from '../shared/types';

const MAPS_URL_PATTERN = /^https:\/\/www\.google\.com(\.br)?\/maps/;

const STATE_AFTER_COMMAND = {
  START: 'running',
  PAUSE: 'paused',
  RESUME: 'running',
  CANCEL: 'cancelled',
} as const satisfies Record<string, CollectionState>;

async function getActiveMapsTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id !== undefined && MAPS_URL_PATTERN.test(tab.url ?? '') ? tab : null;
}

async function readState(): Promise<CollectionState> {
  const stored = await chrome.storage.local.get(STATE_STORAGE_KEY);
  return (stored[STATE_STORAGE_KEY] as CollectionState | undefined) ?? 'idle';
}

/**
 * Envia uma mensagem ao content script da aba. Se ele ainda não estiver
 * injetado (aba aberta antes da extensão), injeta e tenta de novo.
 */
async function sendToContent(tabId: number, message: ContentMessage): Promise<ContentReply> {
  try {
    return await chrome.tabs.sendMessage<ContentMessage, ContentReply>(tabId, message);
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return await chrome.tabs.sendMessage<ContentMessage, ContentReply>(tabId, message);
  }
}

async function handlePopupMessage(message: PopupMessage): Promise<StatusReply> {
  const tab = await getActiveMapsTab();
  if (!tab) return { kind: 'outside_maps' };

  try {
    if (message.type === 'GET_STATUS') {
      const reply = await sendToContent(tab.id!, { type: 'PING' });
      return { kind: 'ready', state: await readState(), hasResults: reply.hasResults };
    }
    const reply = await sendToContent(tab.id!, { type: message.type });
    const state = STATE_AFTER_COMMAND[message.type];
    await chrome.storage.local.set({ [STATE_STORAGE_KEY]: state });
    return { kind: 'ready', state, hasResults: reply.hasResults };
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

chrome.runtime.onMessage.addListener(
  (message: PopupMessage, _sender, sendResponse: (reply: StatusReply) => void) => {
    handlePopupMessage(message).then(sendResponse);
    return true; // resposta assíncrona
  },
);
