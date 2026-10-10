import { hasContact } from './csv';
import type { ContactStatus, Lead } from './types';

export type SortKey = 'recentes' | 'nome' | 'nota' | 'avaliacoes';

export interface ListFilter {
  /** Texto livre: nome, categoria, endereço, telefone, e-mails e tags. */
  text: string;
  /** Busca de origem exata; vazio = todas. */
  search: string;
  /** Vazio = todos os status. */
  status: ContactStatus | '';
  onlyWithContact: boolean;
}

export const EMPTY_FILTER: ListFilter = { text: '', search: '', status: '', onlyWithContact: false };

export const statusOf = (lead: Lead): ContactStatus => lead.status_contato ?? 'novo';

// minúsculas e sem acentos, para "clinica" achar "Clínica"
const fold = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function haystack(lead: Lead): string {
  return fold(
    [lead.nome, lead.categoria, lead.endereco, lead.telefone, ...lead.emails, ...(lead.tags ?? [])].join(' '),
  );
}

/** Leads que passam por todos os filtros ativos. */
export function filterLeads(leads: Lead[], filter: ListFilter): Lead[] {
  const terms = fold(filter.text).split(/\s+/).filter(Boolean);
  return leads.filter((lead) => {
    if (filter.search && lead.busca_origem !== filter.search) return false;
    if (filter.status && statusOf(lead) !== filter.status) return false;
    if (filter.onlyWithContact && !hasContact(lead)) return false;
    if (terms.length === 0) return true;
    const text = haystack(lead);
    return terms.every((term) => text.includes(term));
  });
}

/** Cópia ordenada; nota e avaliações ausentes ficam no fim. */
export function sortLeads(leads: Lead[], key: SortKey): Lead[] {
  const sorted = [...leads];
  const numeric = (value: number | null) => value ?? Number.NEGATIVE_INFINITY;
  switch (key) {
    case 'nome':
      return sorted.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    case 'nota':
      return sorted.sort((a, b) => numeric(b.nota) - numeric(a.nota));
    case 'avaliacoes':
      return sorted.sort((a, b) => numeric(b.avaliacoes) - numeric(a.avaliacoes));
    default:
      return sorted.sort((a, b) => b.coletado_em.localeCompare(a.coletado_em));
  }
}

/** Buscas de origem com a quantidade de leads de cada uma, das maiores para as menores. */
export function searchesOf(leads: Lead[]): { busca: string; total: number }[] {
  const totals = new Map<string, number>();
  for (const lead of leads) totals.set(lead.busca_origem, (totals.get(lead.busca_origem) ?? 0) + 1);
  return [...totals.entries()]
    .map(([busca, total]) => ({ busca, total }))
    .sort((a, b) => b.total - a.total || a.busca.localeCompare(b.busca, 'pt-BR'));
}
