import { describe, expect, it } from 'vitest';
import { deriveFields } from '../src/shared/dedupe';
import { GENERIC_PRESET, GOOGLE_CONTACTS_PRESET, leadsToPresetCsv } from '../src/shared/presets';
import type { Lead } from '../src/shared/types';

const lead: Lead = deriveFields({
  id: '1',
  nome: 'Clínica "Sorriso", Taubaté',
  categoria: 'Dentista',
  nota: 4.8,
  avaliacoes: 132,
  endereco: 'Rua Exemplo 100, Taubaté, SP',
  telefone: '(12) 99168-9416',
  telefone_e164: '',
  eh_celular: true,
  site: 'https://clinicasorriso.com.br',
  dominio: '',
  emails: ['contato@clinicasorriso.com.br', 'vendas@clinicasorriso.com.br'],
  whatsapp: ['+5512991689416', '+5512936310000'],
  redes_sociais: ['https://instagram.com/sorriso'],
  url_maps: 'https://maps.google.com/?cid=000',
  busca_origem: 'dentista em Taubaté',
  coletado_em: '2026-10-09T22:50:00.000Z',
  status_enriquecimento: 'ok',
  tags: ['quente'],
});

describe('presets de exportação', () => {
  it('genérico: telefone E.164, nota com ponto, vírgula como separador e células escapadas', () => {
    const [header, row] = leadsToPresetCsv([lead], GENERIC_PRESET).slice(1).split('\r\n');
    expect(header.startsWith('name,category,phone')).toBe(true);
    expect(row).toContain('"Clínica ""Sorriso"", Taubaté",Dentista,+5512991689416,true,+5512991689416,contato@');
    expect(row).toContain(',4.8,132,');
    expect(GENERIC_PRESET.row(lead)).toHaveLength(GENERIC_PRESET.headers.length);
  });

  it('Google Contatos: segundo telefone só quando difere e rótulos juntos por :::', () => {
    const row = GOOGLE_CONTACTS_PRESET.row(lead);
    const get = (name: string) => row[GOOGLE_CONTACTS_PRESET.headers.indexOf(name)];
    expect(row).toHaveLength(GOOGLE_CONTACTS_PRESET.headers.length);
    expect(get('Phone 1 - Value')).toBe('+5512991689416');
    expect(get('Phone 2 - Value')).toBe('+5512936310000');
    expect(get('Labels')).toBe('dentista em Taubaté ::: quente');
    expect(get('E-mail 2 - Value')).toBe('vendas@clinicasorriso.com.br');
  });
});
