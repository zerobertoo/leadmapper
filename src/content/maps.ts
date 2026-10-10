import type { ContentMessage, ContentReply } from '../shared/types';
import { SELECTORS } from './selectors';

// detecta se há uma lista de resultados de busca na página (RF1.1)
function hasResultsList(): boolean {
  return document.querySelector(SELECTORS.resultsFeed) !== null;
}

chrome.runtime.onMessage.addListener(
  (message: ContentMessage, _sender, sendResponse: (reply: ContentReply) => void) => {
    // Fase 1: apenas confirma o recebimento; a coleta real vem na Fase 2
    console.debug('[LeadMapper] mensagem recebida:', message.type);
    sendResponse({ ok: true, hasResults: hasResultsList() });
  },
);
