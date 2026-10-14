import { describe, expect, it, vi } from 'vitest';
import { en } from '../src/shared/i18n/en';
import { pt } from '../src/shared/i18n/pt';
import { t } from '../src/shared/i18n';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe('dicionários de interface', () => {
  it('pt e en têm as mesmas chaves', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
  });

  it('cada chave usa os mesmos {valores} nos dois idiomas e nenhuma está vazia', () => {
    for (const key of Object.keys(pt) as (keyof typeof pt)[]) {
      expect(en[key].trim(), key).not.toBe('');
      expect(placeholders(en[key]), key).toEqual(placeholders(pt[key]));
    }
  });
});

describe('navegador em inglês', () => {
  it('traduz a interface e o CSV usa vírgula e ponto decimal', async () => {
    vi.resetModules();
    vi.stubGlobal('chrome', { i18n: { getUILanguage: () => 'en-US' } });
    const { t: tEn } = await import('../src/shared/i18n');
    const { CSV_HEADERS, escapeCell, leadsToCsv } = await import('../src/shared/csv');
    vi.unstubAllGlobals();

    expect(tEn('exported', { n: 2 })).toBe('2 leads exported.');
    expect(CSV_HEADERS.slice(0, 3)).toEqual(['Name', 'Category', 'Phone']);
    expect(escapeCell('a,b')).toBe('"a,b"');
    expect(leadsToCsv([]).split('\r\n')[0]).toContain('Name,Category,Phone');
  });
});

describe('t', () => {
  it('troca {valores} e cai para pt fora do navegador', () => {
    expect(t('exported', { n: 3 })).toBe('3 leads exportados.');
    expect(t('statusCommError', { message: 'x' })).toContain('(x)');
  });
});
