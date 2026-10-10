import { describe, expect, it } from 'vitest';
import { leadsToJson, leadsToVcard } from '../src/shared/export';
import type { Lead } from '../src/shared/types';

const lead: Lead = {
  id: '1',
  nome: 'Clínica Sorriso; Taubaté',
  categoria: 'Dentista',
  nota: 4.8,
  avaliacoes: 132,
  endereco: 'Rua Exemplo, 100',
  telefone: '(12) 99168-9416',
  telefone_e164: '+5512991689416',
  eh_celular: true,
  site: 'https://clinicasorriso.com.br',
  dominio: 'clinicasorriso.com.br',
  emails: ['contato@clinicasorriso.com.br'],
  whatsapp: ['+5512991689416', '+5512981112222'],
  redes_sociais: [],
  url_maps: 'https://www.google.com/maps/place/x',
  busca_origem: 'dentista em Taubaté',
  coletado_em: '2026-10-09T12:00:00.000Z',
  status_enriquecimento: 'ok',
  tags: ['vip', 'centro'],
};

describe('leadsToVcard', () => {
  const card = leadsToVcard([lead]);

  it('gera um cartão vCard 3.0 com CRLF e escapa o ponto e vírgula', () => {
    expect(card.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n')).toBe(true);
    expect(card.trimEnd().endsWith('END:VCARD')).toBe(true);
    expect(card).toContain('FN:Clínica Sorriso\\; Taubaté');
  });

  it('inclui telefone, WhatsApp extra, e-mail, site, endereço e tags', () => {
    expect(card).toContain('TEL;TYPE=CELL:+5512991689416');
    expect(card).toContain('TEL;TYPE=CELL:+5512981112222');
    // o mesmo número do telefone não repete
    expect(card.match(/\+5512991689416/g)).toHaveLength(1);
    expect(card).toContain('EMAIL;TYPE=INTERNET,WORK:contato@clinicasorriso.com.br');
    expect(card).toContain('URL:https://clinicasorriso.com.br');
    expect(card).toContain('ADR;TYPE=WORK:;;Rua Exemplo\\, 100;;;;');
    expect(card).toContain('CATEGORIES:vip,centro');
  });
});

describe('leadsToJson', () => {
  it('leva o total e os leads completos', () => {
    const data = JSON.parse(leadsToJson([lead], new Date('2026-10-10T10:00:00.000Z')));
    expect(data).toMatchObject({ exportado_em: '2026-10-10T10:00:00.000Z', total: 1 });
    expect(data.leads[0].tags).toEqual(['vip', 'centro']);
  });
});

describe('revisão: vCard', () => {
  it('quebra de linha solta não injeta propriedades e a URL não leva barras', () => {
    const text = leadsToVcard([{ ...lead, nome: 'A\rEND:VCARD\rBEGIN:VCARD', site: 'https://x.com/a,b;c' }]);
    expect(text.split('\r\n').filter((line) => line.startsWith('BEGIN:VCARD'))).toHaveLength(1);
    expect(text).not.toMatch(/[^\n]\r[^\n]/);
    expect(text).toContain('URL:https://x.com/a,b;c');
  });
});
