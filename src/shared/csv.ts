import { parseBrazilianPhone } from './phone';
import type { Lead } from './types';

const BOM = '﻿';
const SEPARATOR = ';';
const LINE_BREAK = '\r\n';

export const CSV_HEADERS = [
  'Nome', 'Categoria', 'Telefone', 'Celular', 'WhatsApp', 'E-mail', 'Site', 'Endereço',
  'Nota', 'Avaliações', 'Instagram', 'Facebook', 'Busca de origem', 'Link do Maps', 'Data da coleta',
];

// números como +5512991234567 ou (12) 3631-0000 não são tratados como fórmula
const PHONE_LIKE = /^\+?\d[\d\s()-]*$/;

/**
 * Escapa uma célula: aspas, quebras de linha e separador (RF5.2). Textos que
 * começam com =, +, - ou @ ganham um apóstrofo, para o Excel não os executar
 * como fórmula.
 */
export function escapeCell(value: string): string {
  let text = value;
  if (/^[=+\-@\t\r]/.test(text) && !PHONE_LIKE.test(text)) text = `'${text}`;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** ISO 8601 -> `AAAA-MM-DD HH:MM` no horário local. */
export function formatCollectedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `leads_AAAA-MM-DD_HHMM.csv` */
export function exportFileName(date: Date): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `leads_${day}_${pad(date.getHours())}${pad(date.getMinutes())}.csv`;
}

const formatNumber = (value: number | null) => (value === null ? '' : String(value).replace('.', ','));

function socialLink(lead: Lead, domain: string): string {
  return lead.redes_sociais.find((url) => url.toLowerCase().includes(domain)) ?? '';
}

function toRow(lead: Lead): string[] {
  const phone = parseBrazilianPhone(lead.telefone);
  return [
    lead.nome,
    lead.categoria,
    phone?.formatted ?? lead.telefone,
    lead.eh_celular ? 'sim' : 'não',
    lead.whatsapp.join(', '),
    lead.emails.join(', '),
    lead.site,
    lead.endereco,
    formatNumber(lead.nota),
    formatNumber(lead.avaliacoes),
    socialLink(lead, 'instagram.com'),
    socialLink(lead, 'facebook.com'),
    lead.busca_origem,
    lead.url_maps,
    formatCollectedAt(lead.coletado_em),
  ];
}

/** CSV em UTF-8 com BOM, separado por `;`, pronto para o Excel em pt-BR (RF5.1). */
export function leadsToCsv(leads: Lead[]): string {
  const lines = [CSV_HEADERS, ...leads.map(toRow)].map((row) =>
    row.map(escapeCell).join(SEPARATOR),
  );
  return BOM + lines.join(LINE_BREAK) + LINE_BREAK;
}

export function hasContact(lead: Lead): boolean {
  return Boolean(lead.telefone || lead.telefone_e164 || lead.emails.length || lead.whatsapp.length);
}

export interface ExportOptions {
  /** `current` exporta só os leads da busca mais recente (RF5.4). */
  scope: 'all' | 'current';
  discardWithoutContact: boolean;
}

/** Aplica as opções de exportação do popup (RF3.5 e RF5.4). */
export function selectLeadsForExport(leads: Lead[], options: ExportOptions): Lead[] {
  let selected = leads;
  if (options.scope === 'current' && leads.length > 0) {
    const latest = leads.reduce((a, b) => (b.coletado_em > a.coletado_em ? b : a));
    selected = leads.filter((lead) => lead.busca_origem === latest.busca_origem);
  }
  return options.discardWithoutContact ? selected.filter(hasContact) : selected;
}
