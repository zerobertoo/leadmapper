import { exportFileName, hasContact, leadsToCsv, selectLeadsForExport } from '../shared/csv';
import { clearAll, readDuplicates, readLeads, readProgress } from '../shared/storage';
import {
  DEFAULT_OPTIONS,
  MAX_LIMIT,
  OPTIONS_STORAGE_KEY,
  STORAGE_KEYS,
  type CollectionState,
  type PopupMessage,
  type PopupOptions,
  type SpeedMode,
  type StatusReply,
} from '../shared/types';

const statusElement = document.querySelector<HTMLParagraphElement>('#status')!;
const countersElement = document.querySelector<HTMLElement>('#counters')!;
const totalElement = document.querySelector<HTMLParagraphElement>('#total')!;
const exportSection = document.querySelector<HTMLElement>('#export-section')!;
const exportScope = document.querySelector<HTMLSelectElement>('#export-scope')!;
const discardNoContact = document.querySelector<HTMLInputElement>('#discard-no-contact')!;
const enrichSites = document.querySelector<HTMLInputElement>('#enrich-sites')!;
const limitInput = document.querySelector<HTMLInputElement>('#limit')!;
const speedSelect = document.querySelector<HTMLSelectElement>('#speed')!;
const optionsSection = document.querySelector<HTMLElement>('#options')!;
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

// limite válido: inteiro entre 1 e MAX_LIMIT (valor inválido volta ao padrão)
function readLimit(): number {
  const value = Math.floor(Number(limitInput.value));
  return Number.isFinite(value) && value >= 1
    ? Math.min(value, MAX_LIMIT)
    : DEFAULT_OPTIONS.limit;
}

function currentOptions(): PopupOptions {
  return {
    limit: readLimit(),
    speed: speedSelect.value as SpeedMode,
    enrichSites: enrichSites.checked,
    discardWithoutContact: discardNoContact.checked,
    exportScope: exportScope.value === 'current' ? 'current' : 'all',
  };
}

async function loadOptions(): Promise<void> {
  const stored = await chrome.storage.local.get(OPTIONS_STORAGE_KEY);
  const options = { ...DEFAULT_OPTIONS, ...(stored[OPTIONS_STORAGE_KEY] as Partial<PopupOptions>) };
  limitInput.value = String(options.limit);
  speedSelect.value = options.speed;
  enrichSites.checked = options.enrichSites;
  discardNoContact.checked = options.discardWithoutContact;
  exportScope.value = options.exportScope;
}

function saveOptions(): void {
  void chrome.storage.local.set({ [OPTIONS_STORAGE_KEY]: currentOptions() });
}

// exportar e limpar só aparecem fora da coleta e com leads salvos
function updateExportSection(): void {
  const collecting =
    currentState === 'running' || currentState === 'enriching' || currentState === 'paused';
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

  // opções de coleta não mudam no meio de uma coleta
  const collecting = ['running', 'enriching', 'paused'].includes(currentState);
  optionsSection.classList.toggle('locked', collecting);
  for (const field of [limitInput, speedSelect, enrichSites]) field.disabled = collecting;

  if (reply.kind === 'outside_maps') {
    statusElement.textContent = 'Abra uma busca no Google Maps para começar.';
    return;
  }
  if (reply.kind === 'error') {
    statusElement.textContent = `Não consegui falar com a aba do Maps (${reply.message}). Recarregue a aba e tente de novo.`;
    start.textContent = 'Tentar de novo';
    start.disabled = false;
    start.dataset.retry = 'status';
    return;
  }
  delete start.dataset.retry;

  switch (reply.state) {
    case 'running':
      statusElement.textContent = 'Coletando…';
      start.hidden = true;
      pause.hidden = cancel.hidden = false;
      countersElement.hidden = false;
      break;
    case 'enriching':
      statusElement.textContent = 'Buscando e-mails e WhatsApp nos sites…';
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
    case 'error':
      statusElement.textContent =
        reply.errorMessage ?? 'A coleta falhou. Tente de novo.';
      start.textContent = 'Tentar de novo';
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
  document.querySelector('#count-skipped')!.textContent = String(progress.skipped);
  document.querySelector('#count-duplicates')!.textContent = String(duplicates);
  document.querySelector('#count-found')!.textContent = String(progress.found);
  document.querySelector('#count-processed')!.textContent = String(progress.processed);
  document.querySelector('#count-phone')!.textContent = String(progress.withPhone);
  const withSite = leads.filter((lead) => lead.site);
  const visited = withSite.filter((lead) => lead.status_enriquecimento !== 'pendente').length;
  const siteErrors = leads.filter((lead) => lead.status_enriquecimento === 'erro').length;
  document.querySelector('#count-email')!.textContent = String(
    leads.filter((lead) => lead.emails.length > 0).length,
  );
  document.querySelector('#count-whatsapp')!.textContent = String(
    leads.filter((lead) => lead.whatsapp.length > 0).length,
  );
  document.querySelector('#count-sites')!.textContent = `${visited}/${withSite.length}`;
  document.querySelector('#count-failures')!.textContent = String(progress.failures + siteErrors);
  totalElement.textContent = `Leads salvos: ${leads.length}`;
  const withoutContact = leads.filter((lead) => !hasContact(lead)).length;
  document.querySelector('#no-contact-count')!.textContent = `(${withoutContact} na lista)`;
}

async function exportCsv(): Promise<void> {
  const leads = selectLeadsForExport(await readLeads(), {
    scope: currentOptions().exportScope,
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
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
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

buttons.start.addEventListener('click', () => {
  // falha de comunicação: só repete a leitura do estado
  if (buttons.start.dataset.retry === 'status') return void run({ type: 'GET_STATUS' });
  const { limit, speed, enrichSites: enrich } = currentOptions();
  limitInput.value = String(limit);
  void run({ type: 'START', settings: { limit, speed, enrichSites: enrich } });
});
for (const field of [limitInput, speedSelect, enrichSites, discardNoContact, exportScope]) {
  field.addEventListener('change', saveOptions);
}
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

void loadOptions().then(() => {
  void renderCounters();
  void run({ type: 'GET_STATUS' });
});
