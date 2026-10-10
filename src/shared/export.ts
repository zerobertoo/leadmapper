import { parseBrazilianPhone } from './phone';
import type { Lead } from './types';

/** JSON legível com todos os campos do lead, inclusive a fonte de cada dado. */
export function leadsToJson(leads: Lead[], now: Date = new Date()): string {
  return JSON.stringify({ exportado_em: now.toISOString(), total: leads.length, leads }, null, 2);
}

// vCard 3.0: barra, ponto e vírgula, vírgula e quebra de linha precisam de escape
const escapeVcard = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

function vcardOf(lead: Lead): string[] {
  const phone = parseBrazilianPhone(lead.telefone);
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escapeVcard(lead.nome)}`, `ORG:${escapeVcard(lead.nome)}`];

  if (phone) lines.push(`TEL;TYPE=${phone.isMobile ? 'CELL' : 'WORK,VOICE'}:${phone.e164}`);
  else if (lead.telefone) lines.push(`TEL;TYPE=WORK,VOICE:${escapeVcard(lead.telefone)}`);
  for (const number of lead.whatsapp) {
    if (number !== phone?.e164) lines.push(`TEL;TYPE=CELL:${number}`);
  }
  for (const email of lead.emails) lines.push(`EMAIL;TYPE=INTERNET,WORK:${escapeVcard(email)}`);
  if (lead.site && /^https?:\/\//i.test(lead.site)) lines.push(`URL:${escapeVcard(lead.site)}`);
  if (lead.endereco) lines.push(`ADR;TYPE=WORK:;;${escapeVcard(lead.endereco)};;;;`);
  if (lead.categoria) lines.push(`TITLE:${escapeVcard(lead.categoria)}`);
  if (lead.tags?.length) lines.push(`CATEGORIES:${lead.tags.map(escapeVcard).join(',')}`);
  lines.push(`NOTE:${escapeVcard(`Busca: ${lead.busca_origem}`)}`);
  lines.push('END:VCARD');
  return lines;
}

/** Um cartão vCard 3.0 por lead, com CRLF entre as linhas; importa no Google Contatos e no Outlook. */
export function leadsToVcard(leads: Lead[]): string {
  return leads.map((lead) => vcardOf(lead).join('\r\n')).join('\r\n') + '\r\n';
}
