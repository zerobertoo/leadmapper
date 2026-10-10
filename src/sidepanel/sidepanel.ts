import { exportFileName, leadsToCsv, selectLeadsForExport } from '../shared/csv';
import { leadsToJson, leadsToVcard } from '../shared/export';
import {
  EMPTY_FILTER,
  filterLeads,
  searchesOf,
  sortLeads,
  statusOf,
  type ListFilter,
  type SortKey,
} from '../shared/leadList';
import { parseBrazilianPhone } from '../shared/phone';
import { readLeads } from '../shared/storage';
import {
  CONTACT_STATUS_LABELS,
  DEFAULT_OPTIONS,
  OPTIONS_STORAGE_KEY,
  STORAGE_KEYS,
  type ContactStatus,
  type Lead,
  type LeadEdit,
  type PopupMessage,
  type PopupOptions,
} from '../shared/types';

const PAGE_SIZE = 50;
const RENDER_THROTTLE_MS = 250;

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

const summary = $<HTMLParagraphElement>('#summary');
const textInput = $<HTMLInputElement>('#text');
const searchSelect = $<HTMLSelectElement>('#search');
const statusSelect = $<HTMLSelectElement>('#status');
const sortSelect = $<HTMLSelectElement>('#sort');
const onlyContact = $<HTMLInputElement>('#only-contact');
const selectAll = $<HTMLInputElement>('#select-all');
const selectAllLabel = $<HTMLSpanElement>('#select-all-label');
const bulkStatus = $<HTMLSelectElement>('#bulk-status');
const applyStatus = $<HTMLButtonElement>('#apply-status');
const exportFormat = $<HTMLSelectElement>('#export-format');
const exportButton = $<HTMLButtonElement>('#export');
const removeButton = $<HTMLButtonElement>('#remove');
const rows = $<HTMLTableSectionElement>('#rows');
const empty = $<HTMLParagraphElement>('#empty');
const moreButton = $<HTMLButtonElement>('#more');
const removeDialog = $<HTMLDialogElement>('#confirm-remove');

let allLeads: Lead[] = [];
let visibleCount = PAGE_SIZE;
let renderTimer: ReturnType<typeof setTimeout> | undefined;
// mudança chegou enquanto o usuário editava uma linha: renderiza depois, sem roubar o foco
let renderPending = false;
const selected = new Set<string>();

const filter = (): ListFilter => ({
  ...EMPTY_FILTER,
  text: textInput.value,
  search: searchSelect.value,
  status: statusSelect.value as ContactStatus | '',
  onlyWithContact: onlyContact.checked,
});

const filteredLeads = () => sortLeads(filterLeads(allLeads, filter()), sortSelect.value as SortKey);

async function send(message: PopupMessage): Promise<void> {
  try {
    await chrome.runtime.sendMessage(message);
  } catch (error) {
    summary.textContent = `Não consegui salvar a alteração (${error instanceof Error ? error.message : String(error)}). Tente de novo.`;
  }
}

// selecionados que o filtro atual mostra: ações em lote nunca atingem linhas que o usuário não vê
function selectedVisibleIds(): string[] {
  return filteredLeads()
    .filter((lead) => selected.has(lead.id))
    .map((lead) => lead.id);
}

function option(value: string, label: string): HTMLOptionElement {
  return Object.assign(document.createElement('option'), { value, textContent: label });
}

function fillStatusOptions(select: HTMLSelectElement, firstLabel?: string): void {
  const previous = select.value;
  select.replaceChildren(
    ...(firstLabel ? [option('', firstLabel)] : []),
    ...(Object.keys(CONTACT_STATUS_LABELS) as ContactStatus[]).map((status) =>
      option(status, CONTACT_STATUS_LABELS[status]),
    ),
  );
  select.value = previous;
}

function fillSearchOptions(): void {
  const previous = searchSelect.value;
  searchSelect.replaceChildren(
    option('', `Todas (${allLeads.length})`),
    ...searchesOf(allLeads).map(({ busca, total }) => option(busca, `${busca || '(sem busca)'} (${total})`)),
  );
  searchSelect.value = [...searchSelect.options].some((item) => item.value === previous) ? previous : '';
}

// só https do Google: o link vem de dados raspados, então não abre qualquer esquema
function safeMapsUrl(url: string): string | null {
  return /^https:\/\/(www\.)?google\.com(\.br)?\/maps\//.test(url) ? url : null;
}

function cell(label: string, ...children: (Node | string)[]): HTMLTableCellElement {
  const td = document.createElement('td');
  td.dataset.label = label;
  td.append(...children);
  return td;
}

function buildRow(lead: Lead): HTMLTableRowElement {
  const row = document.createElement('tr');

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = selected.has(lead.id);
  checkbox.setAttribute('aria-label', `Selecionar ${lead.nome}`);
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) selected.add(lead.id);
    else selected.delete(lead.id);
    updateBulk();
  });

  const name = document.createElement('strong');
  name.textContent = lead.nome;
  const details = document.createElement('small');
  details.textContent = [lead.categoria, lead.endereco].filter(Boolean).join(' · ');
  const mapsUrl = safeMapsUrl(lead.url_maps);
  const company = document.createElement('div');
  company.className = 'company';
  const text = document.createElement('div');
  text.append(name, details);
  if (mapsUrl) {
    const link = Object.assign(document.createElement('a'), {
      href: mapsUrl,
      target: '_blank',
      rel: 'noopener noreferrer',
      textContent: 'Abrir no Maps',
    });
    const linkLine = document.createElement('small');
    linkLine.append(link);
    text.append(linkLine);
  }
  company.append(checkbox, text);
  const header = document.createElement('th');
  header.scope = 'row';
  header.append(company);

  const phone = parseBrazilianPhone(lead.telefone)?.formatted ?? lead.telefone;
  const whatsapp = lead.whatsapp.length > 0 ? `WhatsApp: ${lead.whatsapp.join(', ')}` : '';
  const phoneCell = cell('Telefone', phone || '—');
  if (whatsapp) phoneCell.append(Object.assign(document.createElement('small'), { textContent: whatsapp }));

  const statusField = document.createElement('select');
  statusField.setAttribute('aria-label', `Status de ${lead.nome}`);
  fillStatusOptions(statusField);
  statusField.value = statusOf(lead);
  statusField.addEventListener('change', () => {
    void edit([lead.id], { status_contato: statusField.value as ContactStatus });
  });

  const tagsField = document.createElement('input');
  tagsField.type = 'text';
  tagsField.value = (lead.tags ?? []).join(', ');
  tagsField.placeholder = 'tag, outra tag';
  tagsField.setAttribute('aria-label', `Tags de ${lead.nome}`);
  tagsField.addEventListener('change', () => {
    void edit([lead.id], { tags: tagsField.value.split(',') });
  });

  row.append(
    header,
    phoneCell,
    cell('E-mail', lead.emails.join(', ') || '—'),
    cell('Status', statusField),
    cell('Tags', tagsField),
  );
  return row;
}

function updateBulk(): void {
  const visibleIds = filteredLeads().map((lead) => lead.id);
  const chosen = selectedVisibleIds().length;
  selectAll.checked = visibleIds.length > 0 && chosen === visibleIds.length;
  selectAll.indeterminate = chosen > 0 && chosen < visibleIds.length;
  selectAllLabel.textContent =
    chosen > 0 ? `${chosen} selecionados` : `Selecionar os ${visibleIds.length} filtrados`;
  applyStatus.disabled = removeButton.disabled = chosen === 0;
  exportButton.textContent = chosen > 0 ? `Exportar ${chosen}` : `Exportar ${visibleIds.length}`;
  exportButton.disabled = visibleIds.length === 0;
}

function render(): void {
  renderPending = false;
  // ids de leads removidos saem da seleção
  const ids = new Set(allLeads.map((lead) => lead.id));
  for (const id of [...selected]) if (!ids.has(id)) selected.delete(id);

  fillSearchOptions();
  const leads = filteredLeads();
  summary.textContent = `${leads.length} de ${allLeads.length} leads`;
  rows.replaceChildren(...leads.slice(0, visibleCount).map(buildRow));
  empty.hidden = leads.length > 0;
  moreButton.hidden = leads.length <= visibleCount;
  moreButton.textContent = `Mostrar mais (${leads.length - visibleCount})`;
  updateBulk();
}

function scheduleRender(): void {
  if (renderTimer !== undefined) return;
  renderTimer = setTimeout(() => {
    renderTimer = undefined;
    // não troca as linhas debaixo de quem está digitando uma tag
    if (rows.contains(document.activeElement)) renderPending = true;
    else render();
  }, RENDER_THROTTLE_MS);
}

// leituras terminam fora de ordem: só a mais recente vale
let reloadSequence = 0;

async function reload(): Promise<boolean> {
  const sequence = ++reloadSequence;
  const leads = await readLeads();
  if (sequence !== reloadSequence) return false;
  allLeads = leads;
  return true;
}

async function edit(ids: string[], change: LeadEdit): Promise<void> {
  await send({ type: 'UPDATE_LEADS', ids, edit: change });
}

// quando há seleção, exporta só ela; senão, tudo que o filtro mostra. As opções de LGPD do popup valem aqui também
async function leadsToExport(): Promise<Lead[]> {
  const leads = filteredLeads();
  const chosen = selectedVisibleIds();
  const stored = await chrome.storage.local.get(OPTIONS_STORAGE_KEY);
  const options = { ...DEFAULT_OPTIONS, ...(stored[OPTIONS_STORAGE_KEY] as Partial<PopupOptions> | undefined) };
  return selectLeadsForExport(chosen.length > 0 ? leads.filter((lead) => chosen.includes(lead.id)) : leads, {
    scope: 'all',
    discardWithoutContact: options.discardWithoutContact,
    genericEmailsOnly: options.genericEmailsOnly,
  });
}

function download(name: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function exportLeads(): Promise<void> {
  const leads = await leadsToExport();
  if (leads.length === 0) {
    summary.textContent = 'Nenhum lead para exportar com essas opções.';
    return;
  }
  const now = new Date();
  switch (exportFormat.value) {
    case 'json':
      download(exportFileName(now, 'json'), leadsToJson(leads, now), 'application/json');
      break;
    case 'vcf':
      download(exportFileName(now, 'vcf'), leadsToVcard(leads), 'text/vcard');
      break;
    default:
      download(exportFileName(now), leadsToCsv(leads), 'text/csv');
  }
  summary.textContent = `${leads.length} leads exportados.`;
}

function askBeforeRemoving(count: number): Promise<boolean> {
  $('#confirm-remove-text').textContent =
    `${count} ${count === 1 ? 'lead será removido' : 'leads serão removidos'} da lista. Isso não pode ser desfeito.`;
  return new Promise((resolve) => {
    removeDialog.addEventListener('close', () => resolve(removeDialog.returnValue === 'remove'), { once: true });
    removeDialog.returnValue = 'cancel';
    removeDialog.showModal();
  });
}

for (const control of [textInput, searchSelect, statusSelect, sortSelect, onlyContact]) {
  control.addEventListener(control === textInput ? 'input' : 'change', () => {
    visibleCount = PAGE_SIZE;
    render();
  });
}
selectAll.addEventListener('change', () => {
  for (const lead of filteredLeads()) {
    if (selectAll.checked) selected.add(lead.id);
    else selected.delete(lead.id);
  }
  render();
});
applyStatus.addEventListener('click', () => {
  if (!bulkStatus.value) return;
  void edit(selectedVisibleIds(), { status_contato: bulkStatus.value as ContactStatus });
});
exportButton.addEventListener('click', () => void exportLeads());
removeButton.addEventListener('click', async () => {
  const ids = selectedVisibleIds();
  if (ids.length === 0 || !(await askBeforeRemoving(ids.length))) return;
  for (const id of ids) selected.delete(id);
  await send({ type: 'DELETE_LEADS', ids });
});
moreButton.addEventListener('click', () => {
  visibleCount += PAGE_SIZE;
  render();
});
// editar uma linha e sair do campo aplica a atualização que ficou esperando
rows.addEventListener('focusout', () => {
  if (renderPending) setTimeout(() => !rows.contains(document.activeElement) && render(), 0);
});

// navegadores sem `closedby`: clicar no fundo fecha o diálogo
if (!('closedBy' in HTMLDialogElement.prototype)) {
  removeDialog.addEventListener('click', (event) => {
    if (event.target === removeDialog) removeDialog.close('cancel');
  });
}

chrome.storage.onChanged.addListener((changes) => {
  if (STORAGE_KEYS.leads in changes) void reload().then((fresh) => fresh && scheduleRender());
});

fillStatusOptions(statusSelect, 'Todos');
fillStatusOptions(bulkStatus);
void reload().then((fresh) => fresh && render());
