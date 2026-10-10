import { describe, expect, it } from 'vitest';
import {
  CSV_HEADERS,
  escapeCell,
  exportFileName,
  formatCollectedAt,
  leadsToCsv,
  selectLeadsForExport,
} from '../src/shared/csv';
import { deriveFields } from '../src/shared/dedupe';
import type { Lead } from '../src/shared/types';

const LINE_BREAK = String.fromCharCode(13, 10);

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return deriveFields({
    id: '1',
    nome: 'Clínica Sorriso',
    categoria: 'Dentista',
    nota: 4.8,
    avaliacoes: 132,
    endereco: 'Rua Exemplo 100, Taubaté, SP',
    telefone: '(12) 3631-0000',
    telefone_e164: '',
    eh_celular: false,
    site: 'https://clinicasorriso.com.br',
    dominio: '',
    emails: ['contato@clinicasorriso.com.br'],
    whatsapp: [],
    redes_sociais: [],
    url_maps: 'https://maps.google.com/?cid=000',
    busca_origem: 'clínica odontológica em Taubaté',
    coletado_em: new Date(2026, 9, 9, 22, 50).toISOString(),
    status_enriquecimento: 'ok',
    ...overrides,
  });
}

describe('escapeCell', () => {
  it('escapa aspas, quebras de linha e o separador', () => {
    expect(escapeCell('a;b')).toBe('"a;b"');
    expect(escapeCell('diz "oi"')).toBe('"diz ""oi"""');
    expect(escapeCell('linha1\nlinha2')).toBe('"linha1\nlinha2"');
    expect(escapeCell('simples')).toBe('simples');
  });

  it('neutraliza fórmulas mas preserva telefones', () => {
    expect(escapeCell('=SOMA(A1)')).toBe("'=SOMA(A1)");
    expect(escapeCell('@usuario')).toBe("'@usuario");
    expect(escapeCell('+5512991689416')).toBe('+5512991689416');
    expect(escapeCell('(12) 3631-0000')).toBe('(12) 3631-0000');
  });
});

describe('leadsToCsv', () => {
  it('gera BOM, cabeçalho em português e a linha do exemplo do PRD', () => {
    const csv = leadsToCsv([makeLead()]);
    expect(csv.startsWith('﻿')).toBe(true);
    const [header, row] = csv.slice(1).split('\r\n');
    expect(header).toBe(CSV_HEADERS.join(';'));
    expect(row).toBe(
      'Clínica Sorriso;Dentista;(12) 3631-0000;não;;contato@clinicasorriso.com.br;https://clinicasorriso.com.br;' +
        'Rua Exemplo 100, Taubaté, SP;4,8;132;;;clínica odontológica em Taubaté;https://maps.google.com/?cid=000;2026-10-09 22:50;genérico;Novo;;;',
    );
  });

  it('junta vários e-mails em uma célula e separa Instagram e Facebook', () => {
    const lead = makeLead({
      emails: ['a@x.com', 'b@x.com'],
      redes_sociais: ['https://instagram.com/clinica', 'https://facebook.com/clinica'],
    });
    const cells = leadsToCsv([lead]).slice(1).split('\r\n')[1];
    expect(cells).toContain('a@x.com, b@x.com');
    expect(cells).toContain('https://instagram.com/clinica;https://facebook.com/clinica');
  });
});

describe('formatCollectedAt e exportFileName', () => {
  it('formata a data no horário local', () => {
    const date = new Date(2026, 9, 9, 8, 5);
    expect(formatCollectedAt(date.toISOString())).toBe('2026-10-09 08:05');
    expect(exportFileName(date)).toBe('leads_2026-10-09_0805.csv');
  });
});

describe('selectLeadsForExport', () => {
  const old = makeLead({ id: 'old', busca_origem: 'busca antiga', coletado_em: '2026-10-01T10:00:00.000Z' });
  const recent = makeLead({ id: 'recent', busca_origem: 'busca nova', coletado_em: '2026-10-09T10:00:00.000Z' });
  const noContact = makeLead({
    id: 'none',
    busca_origem: 'busca nova',
    coletado_em: '2026-10-09T10:05:00.000Z',
    telefone: '',
    emails: [],
    whatsapp: [],
  });

  it('exporta só a busca mais recente quando pedido', () => {
    const ids = selectLeadsForExport([old, recent, noContact], { scope: 'current', discardWithoutContact: false })
      .map((lead) => lead.id);
    expect(ids).toEqual(['recent', 'none']);
  });

  it('descarta leads sem nenhum contato', () => {
    const ids = selectLeadsForExport([old, recent, noContact], { scope: 'all', discardWithoutContact: true })
      .map((lead) => lead.id);
    expect(ids).toEqual(['old', 'recent']);
  });
});

describe('colunas Site e WhatsApp', () => {
  const row = (lead: Lead) => leadsToCsv([lead]).split('\r\n')[1].split(';');

  it('deixa o Site vazio quando é perfil de rede social e mantém o Instagram', () => {
    const lead = makeLead({ site: 'https://www.instagram.com/clinicasorriso' });
    const cells = row(lead);
    expect(cells[CSV_HEADERS.indexOf('Site')]).toBe('');
    expect(cells[CSV_HEADERS.indexOf('Instagram')]).toBe('https://www.instagram.com/clinicasorriso');
  });

  it('formata o WhatsApp como texto, sem apóstrofo, também com vários números', () => {
    const lead = makeLead({ whatsapp: ['+5512991689416', '+5511930641548'] });
    const cell = row(lead)[CSV_HEADERS.indexOf('WhatsApp')];
    expect(cell).toBe('"+55 (12) 99168-9416, +55 (11) 93064-1548"'.replace(/"/g, ''));
    expect(cell.startsWith("'")).toBe(false);
  });

  it('escapa fórmula mesmo com espaço antes, mas não telefones', () => {
    expect(escapeCell(' =1+1')).toBe("' =1+1");
    expect(escapeCell('+1+1')).toBe("'+1+1");
    expect(escapeCell('\t=cmd')).toBe("'\t=cmd");
    expect(escapeCell('+Bem Estar')).toBe("'+Bem Estar");
    expect(escapeCell('+55 (12) 99168-9416, +55 (11) 93064-1548')).toBe('+55 (12) 99168-9416, +55 (11) 93064-1548');
  });
});

describe('e-mails e LGPD no CSV', () => {
  const leads = [makeLead({ emails: ['joao.silva@clinica.com.br', 'contato@clinica.com.br'] })];

  it('preenche a coluna Tipo de e-mail na ordem dos e-mails', () => {
    const cells = leadsToCsv(leads).split(LINE_BREAK)[1].split(';');
    expect(cells[CSV_HEADERS.indexOf('Tipo de e-mail')]).toBe('pessoal, genérico');
  });

  it('exporta só e-mails genéricos sem descartar o lead', () => {
    const [lead] = selectLeadsForExport(leads, {
      scope: 'all',
      discardWithoutContact: false,
      genericEmailsOnly: true,
    });
    expect(lead.emails).toEqual(['contato@clinica.com.br']);
  });
});
