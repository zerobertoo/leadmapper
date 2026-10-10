import { deriveFields } from '../shared/dedupe';
import { readState, upsertLeads, writeProgress, writeState } from '../shared/storage';
import {
  DEFAULT_SETTINGS,
  EMPTY_PROGRESS,
  STORAGE_KEYS,
  type CollectionState,
  type ContentEvent,
  type ContentMessage,
  type ContentReply,
  type Lead,
  type PopupMessage,
  type StatusReply,
} from '../shared/types';

const MAPS_URL_PATTERN = /^https:\/\/www\.google\.com(\.br)?\/maps/;
const BATCH_SIZE = 10;

const STATE_AFTER_COMMAND = {
  START: 'running',
  PAUSE: 'paused',
  RESUME: 'running',
  CANCEL: 'cancelled',
} as const satisfies Record<string, CollectionState>;

// leads aguardando gravação; se o service worker morrer, perde no máximo BATCH_SIZE - 1
let pendingBatch: Lead[] = [];
// serializa as gravações, pois upsertLeads faz leitura + escrita
let writeChain: Promise<void> = Promise.resolve();

function flushBatch(): Promise<void> {
  const leads = pendingBatch;
  pendingBatch = [];
  if (leads.length > 0) writeChain = writeChain.then(() => upsertLeads(leads));
  return writeChain;
}

async function getActiveMapsTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id !== undefined && MAPS_URL_PATTERN.test(tab.url ?? '') ? tab : null;
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
      let state = await readState();
      // aba recarregada durante a coleta: o content script voltou ao zero
      if ((state === 'running' || state === 'paused') && reply.state === 'idle') {
        state = 'idle';
        await writeState(state);
      }
      return { kind: 'ready', state, hasResults: reply.hasResults };
    }

    if (message.type === 'START') {
      await writeProgress(EMPTY_PROGRESS);
      await chrome.storage.local.set({ [STORAGE_KEYS.duplicates]: 0 });
      const reply = await sendToContent(tab.id!, { type: 'START', settings: DEFAULT_SETTINGS });
      await writeState('running');
      return { kind: 'ready', state: 'running', hasResults: reply.hasResults };
    }

    // grava o estado antes: o DONE do content script não pode sobrescrever "cancelled"
    const state = STATE_AFTER_COMMAND[message.type];
    await writeState(state);
    const reply = await sendToContent(tab.id!, { type: message.type });
    if (state === 'cancelled' || state === 'paused') await flushBatch();
    return { kind: 'ready', state, hasResults: reply.hasResults };
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

async function handleContentEvent(event: ContentEvent): Promise<void> {
  switch (event.type) {
    case 'LEAD_FOUND':
      pendingBatch.push(deriveFields(event.lead));
      if (pendingBatch.length >= BATCH_SIZE) await flushBatch();
      break;
    case 'PROGRESS':
      await writeProgress(event.progress);
      break;
    case 'DONE':
      await flushBatch();
      await writeProgress(event.progress);
      // se o usuário cancelou, mantém "cancelled"
      if ((await readState()) !== 'cancelled') await writeState('done');
      break;
  }
}

chrome.runtime.onMessage.addListener(
  (message: PopupMessage | ContentEvent, _sender, sendResponse: (reply?: StatusReply) => void) => {
    if (message.type === 'LEAD_FOUND' || message.type === 'PROGRESS' || message.type === 'DONE') {
      void handleContentEvent(message);
      return false;
    }
    handlePopupMessage(message).then(sendResponse);
    return true; // resposta assíncrona
  },
);
