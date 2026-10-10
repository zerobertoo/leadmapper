import { exportFileName, leadsToCsv, selectLeadsForExport } from '../shared/csv';
import { clearAll, readDuplicates, readLeads, readProgress } from '../shared/storage';
import {
  STORAGE_KEYS,
  type CollectionState,
  type PopupMessage,
  type StatusReply,
} from '../shared/types';

const statusElement = document.querySelector<HTMLParagraphElement>('#status')!;
const countersElement = document.querySelector<HTMLElement>('#counters')!;
const totalElement = document.querySelector<HTMLParagraphElement>('#total')!;
const exportSection = document.querySelector<HTMLElement>('#export-section')!;
const exportScope = document.querySelector<HTMLSelectElement>('#export-scope')!;
const discardNoContact = document.querySelector<HTMLInputElement>('#discard-no-contact')!;
const exportButton = document.querySelector<HTMLButtonElement>('#export')!;
const clearButton = document.querySelector<HTMLButtonElement>('#clear')!;
const buttons = {
  start: document.querySelector<HTMLButtonElement>('#start')!,
  pause: document.querySelector<HTMLButtonElement>('#pause')!,
  resume: document.querySelector<HTMLButtonElement>('#resume')!,
  cancel: document.querySelector<HTMLButtonElement>('#cancel')!,
};

function send(message: PopupMessage): Promise<StatusReply> {
  return chrome.runtime.sendMessage<PopupMessage, StatusReply>(message);
}

let currentState: CollectionState = 'idle';
let totalLeads = 0;

// exportar e limpar só aparecem fora da coleta e com leads salvos
function updateExportSection(): void {
  const collecting = currentState === 'running' || currentState === 'paused';
  exportSection.hidden = collecting || totalLeads === 0;
}

// mostra apenas os botões válidos para o estado atual
function render(reply: StatusReply): void {
  const { start, pause, resume, cancel } = buttons;
  start.hidden = false;
  start.textContent = 'Iniciar coleta';
  pause.hidden = resume.hidden = cancel.hidden = true;
  start.disabled = true;
  countersElement.hidden = true;
  currentState = reply.kind === 'ready' ? reply.state : 'idle';
  updateExportSection();

  if (reply.kind === 'outside_maps') {
    statusElement.textContent = 'Abra uma busca no Google Maps para começar.';
    return;
  }
  if (reply.kind === 'error') {
    statusElement.textContent = `Algo deu errado: ${reply.message}. Recarregue a aba do Maps e tente de novo.`;
    return;
  }

  switch (reply.state) {
    case 'running':
      statusElement.textContent = 'Coletando…';
      start.hidden = true;
      pause.hidden = cancel.hidden = false;
      countersElement.hidden = false;
      break;
    case 'paused':
      statusElement.textContent = 'Coleta pausada.';
      start.hidden = true;
      resume.hidden = cancel.hidden = false;
      countersElement.hidden = false;
      break;
    case 'done':
    case 'cancelled':
      statusElement.textContent = reply.state === 'done' ? 'Coleta concluída.' : 'Coleta cancelada.';
      start.textContent = 'Nova coleta';
      start.disabled = !reply.hasResults;
      countersElement.hidden = false;
      break;
    default:
      if (reply.hasResults) {
        statusElement.textContent = 'Pronto para coletar.';
        start.disabled = false;
      } else {
        statusElement.textContent = 'Faça uma busca no Maps e espere a lista de resultados aparecer.';
      }
  }
}

async function renderCounters(): Promise<void> {
  const [progress, leads, duplicates] = await Promise.all([
    readProgress(),
    readLeads(),
    readDuplicates(),
  ]);
  totalLeads = leads.length;
  updateExportSection();
  document.querySelector('#count-duplicates')!.textContent = String(duplicates);
  document.querySelector('#count-found')!.textContent = String(progress.found);
  document.querySelector('#count-processed')!.textContent = String(progress.processed);
  document.querySelector('#count-phone')!.textContent = String(progress.withPhone);
  document.querySelector('#count-failures')!.textContent = String(progress.failures);
  totalElement.textContent = `Leads salvos: ${leads.length}`;
}

async function exportCsv(): Promise<void> {
  const leads = selectLeadsForExport(await readLeads(), {
    scope: exportScope.value === 'current' ? 'current' : 'all',
    discardWithoutContact: discardNoContact.checked,
  });
  if (leads.length === 0) {
    statusElement.textContent = 'Nenhum lead para exportar com essas opções.';
    return;
  }
  const url = URL.createObjectURL(new Blob([leadsToCsv(leads)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = exportFileName(new Date());
  link.click();
  URL.revokeObjectURL(url);
  statusElement.textContent = `${leads.length} leads exportados.`;
}

async function clearList(): Promise<void> {
  if (!confirm('Apagar todos os leads salvos? Essa ação não pode ser desfeita.')) return;
  await clearAll();
  await renderCounters();
  await run({ type: 'GET_STATUS' });
}

async function run(message: PopupMessage): Promise<void> {
  render(await send(message));
}

buttons.start.addEventListener('click', () => void run({ type: 'START' }));
buttons.pause.addEventListener('click', () => void run({ type: 'PAUSE' }));
buttons.resume.addEventListener('click', () => void run({ type: 'RESUME' }));
exportButton.addEventListener('click', () => void exportCsv());
clearButton.addEventListener('click', () => void clearList());
buttons.cancel.addEventListener('click', () => void run({ type: 'CANCEL' }));

// contadores ao vivo e mudanças de estado (ex.: coleta concluída com o popup aberto)
chrome.storage.onChanged.addListener((changes) => {
  if (STORAGE_KEYS.progress in changes || STORAGE_KEYS.leads in changes) void renderCounters();
  if (STORAGE_KEYS.state in changes) void run({ type: 'GET_STATUS' });
});

void renderCounters();
void run({ type: 'GET_STATUS' });
