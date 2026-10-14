import { exportFileName, hasContact, leadsToCsv, selectLeadsForExport } from '../shared/csv';
import { readLog } from '../shared/diagnostic';
import { applyI18n, t } from '../shared/i18n';
import { isNonWebsite } from '../shared/domain';
import { estimateRemainingMs, formatRemaining } from '../shared/eta';
import { readDuplicates, readLeads, readProgress } from '../shared/storage';
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

applyI18n();

const LGPD_ACK_KEY = 'lgpdAck';
const RENDER_THROTTLE_MS = 250;

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

const statusElement = $<HTMLParagraphElement>('#status');
const warningsElement = $<HTMLUListElement>('#warnings');
const countersElement = $<HTMLElement>('#counters');
const moreCountersElement = $<HTMLElement>('#more-counters');
const progressBlock = $<HTMLElement>('#progress-block');
const progressBar = $<HTMLProgressElement>('#progress');
const progressText = $<HTMLParagraphElement>('#progress-text');
const firstSteps = $<HTMLElement>('#first-steps');
const lgpdNotice = $<HTMLElement>('#lgpd-notice');
const totalElement = $<HTMLParagraphElement>('#total');
const exportSection = $<HTMLElement>('#export-section');
const exportScope = $<HTMLSelectElement>('#export-scope');
const discardNoContact = $<HTMLInputElement>('#discard-no-contact');
const genericEmailsOnly = $<HTMLInputElement>('#generic-emails-only');
const enrichSites = $<HTMLInputElement>('#enrich-sites');
const limitInput = $<HTMLInputElement>('#limit');
const speedSelect = $<HTMLSelectElement>('#speed');
const optionsSection = $<HTMLElement>('#options');
const exportButton = $<HTMLButtonElement>('#export');
const openListButton = $<HTMLButtonElement>('#open-list');
const clearButton = $<HTMLButtonElement>('#clear');
const confirmDialog = $<HTMLDialogElement>('#confirm-clear');
const buttons = {
  start: $<HTMLButtonElement>('#start'),
  pause: $<HTMLButtonElement>('#pause'),
  resume: $<HTMLButtonElement>('#resume'),
  cancel: $<HTMLButtonElement>('#cancel'),
};

function send(message: PopupMessage): Promise<StatusReply> {
  return chrome.runtime.sendMessage<PopupMessage, StatusReply>(message);
}

let currentState: CollectionState = 'idle';
let totalLeads = 0;
let hasResults = false;
let outsideMaps = false;

const setText = (selector: string, value: string | number) => {
  $(selector).textContent = String(value);
};

// limite válido: inteiro entre 1 e MAX_LIMIT (valor inválido volta ao padrão)
function readLimit(): number {
  const value = Math.floor(Number(limitInput.value));
  return Number.isFinite(value) && value >= 1 ? Math.min(value, MAX_LIMIT) : DEFAULT_OPTIONS.limit;
}

function currentOptions(): PopupOptions {
  return {
    limit: readLimit(),
    speed: speedSelect.value as SpeedMode,
    enrichSites: enrichSites.checked,
    discardWithoutContact: discardNoContact.checked,
    exportScope: exportScope.value === 'current' ? 'current' : 'all',
    genericEmailsOnly: genericEmailsOnly.checked,
  };
}

async function loadOptions(): Promise<void> {
  const stored = await chrome.storage.local.get([OPTIONS_STORAGE_KEY, LGPD_ACK_KEY]);
  const options = { ...DEFAULT_OPTIONS, ...(stored[OPTIONS_STORAGE_KEY] as Partial<PopupOptions>) };
  limitInput.value = String(options.limit);
  speedSelect.value = options.speed;
  enrichSites.checked = options.enrichSites;
  discardNoContact.checked = options.discardWithoutContact;
  genericEmailsOnly.checked = options.genericEmailsOnly;
  exportScope.value = options.exportScope;
  lgpdNotice.hidden = stored[LGPD_ACK_KEY] === true;
}

function saveOptions(): void {
  void chrome.storage.local.set({ [OPTIONS_STORAGE_KEY]: currentOptions() });
}

// exportar aparece fora da coleta e também pausado (parcial); limpar só com a coleta parada
function updateExportSection(): void {
  const working = currentState === 'running' || currentState === 'enriching';
  exportSection.hidden = working || totalLeads === 0;
  clearButton.disabled = currentState === 'paused';
  // primeiros passos só quando não há nada para mostrar
  firstSteps.hidden = !(totalLeads === 0 && (outsideMaps || !hasResults) && currentState === 'idle');
}

// mostra apenas os botões válidos para o estado atual
function render(reply: StatusReply): void {
  const { start, pause, resume, cancel } = buttons;
  start.hidden = false;
  start.textContent = t('start');
  pause.hidden = resume.hidden = cancel.hidden = true;
  start.disabled = true;
  countersElement.hidden = true;
  moreCountersElement.hidden = true;
  progressBlock.hidden = true;
  currentState = reply.kind === 'ready' ? reply.state : 'idle';
  outsideMaps = reply.kind === 'outside_maps';
  hasResults = reply.kind === 'ready' && reply.hasResults;
  updateExportSection();

  // opções de coleta não mudam no meio de uma coleta
  const collecting = ['running', 'enriching', 'paused'].includes(currentState);
  optionsSection.classList.toggle('locked', collecting);
  for (const field of [limitInput, speedSelect, enrichSites]) field.disabled = collecting;
  const showCounters = () => {
    countersElement.hidden = false;
    moreCountersElement.hidden = false;
  };

  if (reply.kind === 'outside_maps') {
    statusElement.textContent = t('statusOutsideMaps');
    return;
  }
  if (reply.kind === 'error') {
    statusElement.textContent = t('statusCommError', { message: reply.message });
    start.textContent = t('retry');
    start.disabled = false;
    start.dataset.retry = 'status';
    return;
  }
  delete start.dataset.retry;

  switch (reply.state) {
    case 'running':
      statusElement.textContent = t('statusRunning');
      start.hidden = true;
      pause.hidden = cancel.hidden = false;
      progressBlock.hidden = false;
      showCounters();
      break;
    case 'enriching':
      statusElement.textContent = t('statusEnriching');
      start.hidden = true;
      pause.hidden = cancel.hidden = false;
      progressBlock.hidden = false;
      showCounters();
      break;
    case 'paused':
      statusElement.textContent = t('statusPaused');
      start.hidden = true;
      resume.hidden = cancel.hidden = false;
      progressBlock.hidden = false;
      showCounters();
      break;
    case 'done':
    case 'cancelled':
      statusElement.textContent = reply.state === 'done' ? t('statusDone') : t('statusCancelled');
      start.textContent = t('newCollection');
      start.disabled = !reply.hasResults;
      showCounters();
      break;
    case 'error':
      statusElement.textContent = reply.errorMessage ?? t('statusFailed');
      start.textContent = t('retry');
      start.disabled = !reply.hasResults;
      showCounters();
      break;
    default:
      if (reply.hasResults) {
        statusElement.textContent = t('statusReady');
        start.disabled = false;
      } else {
        statusElement.textContent = t('statusSearchFirst');
      }
  }
  void renderCounters();
}

async function renderCounters(): Promise<void> {
  const [progress, leads, duplicates, stored] = await Promise.all([
    readProgress(),
    readLeads(),
    readDuplicates(),
    chrome.storage.local.get([STORAGE_KEYS.warnings, STORAGE_KEYS.startedAt]),
  ]);
  totalLeads = leads.length;
  updateExportSection();
  openListButton.hidden = totalLeads === 0;

  const withSite = leads.filter((lead) => lead.site && !isNonWebsite(lead.site));
  const visited = withSite.filter((lead) => lead.status_enriquecimento !== 'pendente').length;
  const siteErrors = leads.filter((lead) => lead.status_enriquecimento === 'erro').length;
  const withEmail = leads.filter((lead) => lead.emails.length > 0).length;
  const withWhatsapp = leads.filter((lead) => lead.whatsapp.length > 0).length;
  const withEmailOrWhatsapp = leads.filter((lead) => lead.emails.length > 0 || lead.whatsapp.length > 0).length;

  setText('#count-progress', `${progress.processed}/${progress.found}`);
  setText('#count-phone', progress.withPhone);
  setText('#count-contact', withEmailOrWhatsapp);
  setText('#count-found', progress.found);
  setText('#count-email', withEmail);
  setText('#count-whatsapp', withWhatsapp);
  setText('#count-sites', `${visited}/${withSite.length}`);
  setText('#count-site-errors', siteErrors);
  setText('#count-failures', progress.failures);
  setText('#count-skipped', progress.skipped);
  setText('#count-duplicates', duplicates);
  totalElement.textContent = t('totalSaved', { n: leads.length });
  setText('#no-contact-count', t('noContactCount', { n: leads.filter((lead) => !hasContact(lead)).length }));

  renderProgress(progress, visited, withSite.length, (stored[STORAGE_KEYS.startedAt] as number | undefined) ?? 0);

  const warnings = (stored[STORAGE_KEYS.warnings] as string[] | undefined) ?? [];
  warningsElement.replaceChildren(
    ...warnings.map((text) => Object.assign(document.createElement('li'), { textContent: text })),
  );
  warningsElement.hidden = warnings.length === 0;
}

// barra e texto de progresso: itens do Maps enquanto coleta, sites depois
function renderProgress(
  progress: Awaited<ReturnType<typeof readProgress>>,
  visitedSites: number,
  totalSites: number,
  startedAt: number,
): void {
  if (progressBlock.hidden) return;
  if (currentState === 'enriching') {
    progressBar.max = Math.max(totalSites, 1);
    progressBar.value = visitedSites;
    progressText.textContent = t('sitesProgress', { visited: visitedSites, total: totalSites });
    return;
  }
  progressBar.max = Math.max(progress.found, 1);
  progressBar.value = progress.processed;
  const remaining = estimateRemainingMs({ ...progress, startedAt, now: Date.now() });
  const parts = [t('itemsProgress', { done: progress.processed, found: progress.found })];
  if (progress.current) parts.push(progress.current);
  if (remaining !== null && currentState === 'running') parts.push(t('remaining', { time: formatRemaining(remaining) }));
  progressText.textContent = parts.join(' · ');
}

// a lista de leads é relida inteira; junta rajadas de mudanças (enriquecimento) em uma releitura
let renderTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleRenderCounters(): void {
  if (renderTimer !== undefined) return;
  renderTimer = setTimeout(() => {
    renderTimer = undefined;
    void renderCounters();
  }, RENDER_THROTTLE_MS);
}

async function exportCsv(): Promise<void> {
  const options = currentOptions();
  const leads = selectLeadsForExport(await readLeads(), {
    scope: options.exportScope,
    discardWithoutContact: options.discardWithoutContact,
    genericEmailsOnly: options.genericEmailsOnly,
  });
  if (leads.length === 0) {
    statusElement.textContent = t('nothingToExport');
    return;
  }
  const url = URL.createObjectURL(new Blob([leadsToCsv(leads)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = exportFileName(new Date());
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  statusElement.textContent = t('exported', { n: leads.length });
}

// diálogo nativo no lugar de confirm(): foco devolvido ao botão e Esc fecham sozinhos
function askBeforeClearing(): Promise<string> {
  $('#confirm-clear-text').textContent =
    t('clearText', { n: totalLeads });
  return new Promise((resolve) => {
    confirmDialog.addEventListener('close', () => resolve(confirmDialog.returnValue), { once: true });
    confirmDialog.returnValue = 'cancel';
    confirmDialog.showModal();
  });
}

async function clearList(): Promise<void> {
  const answer = await askBeforeClearing();
  if (answer === 'export') return void (await exportCsv());
  if (answer !== 'clear') return;
  // o service worker esvazia o buffer e apaga o storage
  await send({ type: 'CLEAR' });
  await renderCounters();
  await run({ type: 'GET_STATUS' });
}

async function copyDiagnostic(): Promise<void> {
  const [progress, leads, log, stored] = await Promise.all([
    readProgress(),
    readLeads(),
    readLog(),
    chrome.storage.local.get([STORAGE_KEYS.state, STORAGE_KEYS.warnings, STORAGE_KEYS.errorMessage]),
  ]);
  // sem dados de leads: só contagens e o log técnico
  const report = {
    versao: chrome.runtime.getManifest().version,
    navegador: navigator.userAgent,
    estado: stored[STORAGE_KEYS.state] ?? 'idle',
    erro: stored[STORAGE_KEYS.errorMessage] ?? null,
    avisos: stored[STORAGE_KEYS.warnings] ?? [],
    progresso: progress,
    leads: leads.length,
    log,
  };
  await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
  statusElement.textContent = t('diagnosticCopied');
}

async function run(message: PopupMessage): Promise<void> {
  try {
    render(await send(message));
  } catch (error) {
    // service worker não respondeu: mostra o erro e deixa tentar de novo
    render({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
  }
}

buttons.start.addEventListener('click', () => {
  // falha de comunicação: só repete a leitura do estado
  if (buttons.start.dataset.retry === 'status') return void run({ type: 'GET_STATUS' });
  const { limit, speed, enrichSites: enrich } = currentOptions();
  limitInput.value = String(limit);
  void run({ type: 'START', settings: { limit, speed, enrichSites: enrich } });
});
for (const field of [limitInput, speedSelect, enrichSites, discardNoContact, genericEmailsOnly, exportScope]) {
  field.addEventListener('change', saveOptions);
}
buttons.pause.addEventListener('click', () => void run({ type: 'PAUSE' }));
buttons.resume.addEventListener('click', () => void run({ type: 'RESUME' }));
exportButton.addEventListener('click', () => void exportCsv());
clearButton.addEventListener('click', () => void clearList());
buttons.cancel.addEventListener('click', () => void run({ type: 'CANCEL' }));
// o painel lateral só abre a partir de um gesto do usuário, como este clique
openListButton.addEventListener('click', async () => {
  const { id: windowId } = await chrome.windows.getCurrent();
  if (windowId !== undefined) await chrome.sidePanel.open({ windowId });
  window.close();
});
$('#copy-diagnostic').addEventListener('click', () => void copyDiagnostic());
$('#lgpd-ack').addEventListener('click', () => {
  lgpdNotice.hidden = true;
  void chrome.storage.local.set({ [LGPD_ACK_KEY]: true });
});

// navegadores sem `closedby`: clicar no fundo fecha o diálogo
if (!('closedBy' in HTMLDialogElement.prototype)) {
  confirmDialog.addEventListener('click', (event) => {
    if (event.target === confirmDialog) confirmDialog.close('cancel');
  });
}

// contadores ao vivo e mudanças de estado (ex.: coleta concluída com o popup aberto)
chrome.storage.onChanged.addListener((changes) => {
  if (STORAGE_KEYS.progress in changes || STORAGE_KEYS.leads in changes || STORAGE_KEYS.warnings in changes) {
    scheduleRenderCounters();
  }
  if (STORAGE_KEYS.state in changes) void run({ type: 'GET_STATUS' });
});

void loadOptions().then(() => {
  void renderCounters();
  void run({ type: 'GET_STATUS' });
});
