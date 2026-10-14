import { escapeCell } from './csv';
import { isNonWebsite } from './domain';
import { parseBrazilianPhone } from './phone';
import type { Lead } from './types';

const SEPARATOR = ',';
const BOM = '﻿';
const LINE_BREAK = '\r\n';

export interface ExportPreset {
  headers: string[];
  row: (lead: Lead) => string[];
}

// E.164 quando o número é brasileiro válido; senão, o texto original
const e164Of = (raw: string) => parseBrazilianPhone(raw)?.e164 ?? raw;

const socialLink = (lead: Lead, domain: string) =>
  lead.redes_sociais.find((url) => url.toLowerCase().includes(domain)) ?? '';

const siteOf = (lead: Lead) => (isNonWebsite(lead.site) ? '' : lead.site);

/** Dados limpos para qualquer CRM: nomes em inglês, telefone em E.164, nota com ponto, um e-mail por coluna. */
export const GENERIC_PRESET: ExportPreset = {
  headers: [
    'name', 'category', 'phone', 'is_mobile', 'whatsapp', 'email', 'email_2', 'website', 'address',
    'rating', 'reviews', 'instagram', 'facebook', 'source_search', 'maps_url', 'collected_at', 'status', 'tags',
  ],
  row: (lead) => [
    lead.nome,
    lead.categoria,
    lead.telefone ? e164Of(lead.telefone) : '',
    lead.eh_celular ? 'true' : 'false',
    lead.whatsapp[0] ?? '',
    lead.emails[0] ?? '',
    lead.emails[1] ?? '',
    siteOf(lead),
    lead.endereco,
    lead.nota === null ? '' : String(lead.nota),
    lead.avaliacoes === null ? '' : String(lead.avaliacoes),
    socialLink(lead, 'instagram.com'),
    socialLink(lead, 'facebook.com'),
    lead.busca_origem,
    lead.url_maps,
    lead.coletado_em,
    lead.status_contato ?? 'novo',
    (lead.tags ?? []).join(';'),
  ],
};

/** CSV no formato de exportação do Google Contatos (importa em contacts.google.com). */
export const GOOGLE_CONTACTS_PRESET: ExportPreset = {
  headers: [
    'First Name', 'Organization Name', 'Notes', 'Labels',
    'E-mail 1 - Label', 'E-mail 1 - Value', 'E-mail 2 - Label', 'E-mail 2 - Value',
    'Phone 1 - Label', 'Phone 1 - Value', 'Phone 2 - Label', 'Phone 2 - Value',
    'Address 1 - Formatted', 'Website 1 - Value',
  ],
  row: (lead) => {
    const phone = lead.telefone ? e164Of(lead.telefone) : '';
    // WhatsApp só entra como segundo telefone quando difere do principal
    const whatsapp = lead.whatsapp.find((number) => number !== phone) ?? '';
    return [
      lead.nome,
      lead.nome,
      lead.url_maps,
      [lead.busca_origem, ...(lead.tags ?? [])].filter(Boolean).join(' ::: '),
      lead.emails[0] ? 'Work' : '', lead.emails[0] ?? '',
      lead.emails[1] ? 'Work' : '', lead.emails[1] ?? '',
      phone ? (lead.eh_celular ? 'Mobile' : 'Work') : '', phone,
      whatsapp ? 'Mobile' : '', whatsapp,
      lead.endereco,
      siteOf(lead),
    ];
  },
};

/** CSV UTF-8 com BOM, separado por vírgula, no formato do preset. */
export function leadsToPresetCsv(leads: Lead[], preset: ExportPreset): string {
  const lines = [preset.headers, ...leads.map(preset.row)].map((row) =>
    row.map((cell) => escapeCell(cell, SEPARATOR)).join(SEPARATOR),
  );
  return BOM + lines.join(LINE_BREAK) + LINE_BREAK;
}
