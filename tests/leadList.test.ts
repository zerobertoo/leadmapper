import { describe, expect, it } from 'vitest';
import { EMPTY_FILTER, filterLeads, searchesOf, sortLeads, statusOf } from '../src/shared/leadList';
import type { Lead } from '../src/shared/types';

const lead = (overrides: Partial<Lead>): Lead => ({
  id: crypto.randomUUID(),
  nome: 'Clínica Sorriso',
  categoria: 'Dentista',
  nota: 4.5,
  avaliacoes: 100,
  endereco: 'Rua A, 10 - Centro, Taubaté',
  telefone: '(12) 3631-0000',
  telefone_e164: '+551236310000',
  eh_celular: false,
  site: '',
  dominio: '',
  emails: [],
  whatsapp: [],
  redes_sociais: [],
  url_maps: '',
  busca_origem: 'dentista em Taubaté',
  coletado_em: '2026-10-09T12:00:00.000Z',
  status_enriquecimento: 'sem_site',
  ...overrides,
});

const leads = [
  lead({ nome: 'Clínica Sorriso', nota: 4.5, avaliacoes: 100 }),
  lead({
    nome: 'Ótica Visão',
    categoria: 'Ótica',
    nota: null,
    avaliacoes: null,
    busca_origem: 'ótica em Taubaté',
    status_contato: 'cliente',
    tags: ['vip'],
    telefone: '',
    telefone_e164: '',
    coletado_em: '2026-10-10T12:00:00.000Z',
  }),
  lead({
    nome: 'Barbearia Z',
    categoria: 'Barbearia',
    nota: 5,
    avaliacoes: 10,
    busca_origem: 'ótica em Taubaté',
    emails: ['contato@z.com.br'],
  }),
];

describe('filterLeads', () => {
  it('busca sem acento e em vários campos', () => {
    expect(filterLeads(leads, { ...EMPTY_FILTER, text: 'clinica' }).map((l) => l.nome)).toEqual(['Clínica Sorriso']);
    expect(filterLeads(leads, { ...EMPTY_FILTER, text: 'vip' }).map((l) => l.nome)).toEqual(['Ótica Visão']);
    expect(filterLeads(leads, { ...EMPTY_FILTER, text: 'contato@z' }).map((l) => l.nome)).toEqual(['Barbearia Z']);
  });

  it('exige todas as palavras e combina com os outros filtros', () => {
    expect(filterLeads(leads, { ...EMPTY_FILTER, text: 'taubate dentista' })).toHaveLength(1);
    expect(filterLeads(leads, { ...EMPTY_FILTER, search: 'ótica em Taubaté' })).toHaveLength(2);
    expect(filterLeads(leads, { ...EMPTY_FILTER, status: 'cliente' })).toHaveLength(1);
    expect(filterLeads(leads, { ...EMPTY_FILTER, status: 'novo' })).toHaveLength(2);
  });

  it('filtra só com contato', () => {
    expect(filterLeads(leads, { ...EMPTY_FILTER, onlyWithContact: true }).map((l) => l.nome)).toEqual([
      'Clínica Sorriso',
      'Barbearia Z',
    ]);
  });
});

describe('sortLeads', () => {
  it('ordena por nome, nota e recentes sem alterar a lista original', () => {
    expect(sortLeads(leads, 'nome').map((l) => l.nome)).toEqual(['Barbearia Z', 'Clínica Sorriso', 'Ótica Visão']);
    expect(sortLeads(leads, 'nota').map((l) => l.nota)).toEqual([5, 4.5, null]);
    expect(sortLeads(leads, 'recentes')[0].nome).toBe('Ótica Visão');
    expect(leads[0].nome).toBe('Clínica Sorriso');
  });
});

describe('searchesOf e statusOf', () => {
  it('conta leads por busca de origem', () => {
    expect(searchesOf(leads)).toEqual([
      { busca: 'ótica em Taubaté', total: 2 },
      { busca: 'dentista em Taubaté', total: 1 },
    ]);
  });

  it('trata status ausente como novo', () => {
    expect(statusOf(leads[0])).toBe('novo');
    expect(statusOf(leads[1])).toBe('cliente');
  });
});
