import { describe, expect, it } from 'vitest';
import { dedupeKey, deriveFields, mergeIntoList, mergeLeads } from '../src/shared/dedupe';
import type { Lead } from '../src/shared/types';

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return deriveFields({
    id: crypto.randomUUID(),
    nome: 'Clínica Sorriso',
    categoria: '',
    nota: null,
    avaliacoes: null,
    endereco: '',
    telefone: '',
    telefone_e164: '',
    eh_celular: false,
    site: '',
    dominio: '',
    emails: [],
    whatsapp: [],
    redes_sociais: [],
    url_maps: '',
    busca_origem: 'dentista em Taubaté',
    coletado_em: '2026-10-09T12:00:00.000Z',
    status_enriquecimento: 'pendente',
    ...overrides,
  });
}

describe('deriveFields', () => {
  it('preenche telefone normalizado, celular e domínio', () => {
    const lead = makeLead({ telefone: '(12) 99168-9416', site: 'https://www.Exemplo.com.br/contato' });
    expect(lead.telefone_e164).toBe('+5512991689416');
    expect(lead.eh_celular).toBe(true);
    expect(lead.dominio).toBe('exemplo.com.br');
  });

  it('guarda site que é perfil de rede social em redes_sociais', () => {
    const lead = makeLead({ site: 'https://instagram.com/clinica' });
    expect(lead.redes_sociais).toEqual(['https://instagram.com/clinica']);
  });
});

describe('dedupeKey', () => {
  it('prioriza telefone, depois domínio, depois nome + endereço', () => {
    expect(dedupeKey(makeLead({ telefone: '(12) 3631-0000', site: 'https://a.com' }))).toBe('tel:+551236310000');
    expect(dedupeKey(makeLead({ site: 'https://www.a.com/x' }))).toBe('dom:a.com');
    expect(dedupeKey(makeLead({ nome: 'Clínica Sorriso!', endereco: 'Rua A, 10' }))).toBe(
      'nome:clinica sorriso|rua a 10',
    );
  });

  it('não usa rede social como domínio de deduplicação', () => {
    const key = dedupeKey(makeLead({ site: 'https://instagram.com/x', nome: 'X', endereco: 'Rua' }));
    expect(key.startsWith('nome:')).toBe(true);
  });
});

describe('mergeLeads', () => {
  it('mantém o mais completo e preenche campos vazios com o outro', () => {
    const poor = makeLead({ telefone: '(12) 3631-0000', categoria: 'Dentista' });
    const rich = makeLead({ telefone: '(12) 3631-0000', endereco: 'Rua A', site: 'https://a.com', nota: 4.8 });
    const merged = mergeLeads(poor, rich);
    expect(merged.id).toBe(rich.id);
    expect(merged.categoria).toBe('Dentista');
    expect(merged.endereco).toBe('Rua A');
  });

  it('une e-mails sem repetir', () => {
    const a = makeLead({ emails: ['a@x.com'] });
    const b = makeLead({ emails: ['a@x.com', 'b@x.com'] });
    expect(mergeLeads(a, b).emails).toEqual(['a@x.com', 'b@x.com']);
  });
});

describe('mergeIntoList', () => {
  it('não duplica leads de duas buscas sobrepostas', () => {
    const first = [
      makeLead({ nome: 'A', telefone: '(12) 3631-0000' }),
      makeLead({ nome: 'B', telefone: '(12) 3632-0000' }),
    ];
    const second = [
      makeLead({ nome: 'A Odonto', telefone: '12 3631-0000', busca_origem: 'outra busca' }),
      makeLead({ nome: 'C', telefone: '(12) 3633-0000' }),
    ];
    const { leads, duplicates } = mergeIntoList(first, second);
    expect(leads).toHaveLength(3);
    expect(duplicates).toBe(1);
  });

  it('deduplica dentro do próprio lote', () => {
    const lead = makeLead({ telefone: '(12) 3631-0000' });
    const { leads, duplicates } = mergeIntoList([], [lead, { ...lead, id: 'outro' }]);
    expect(leads).toHaveLength(1);
    expect(duplicates).toBe(1);
  });
});
