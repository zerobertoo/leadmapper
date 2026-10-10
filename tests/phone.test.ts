import { describe, expect, it } from 'vitest';
import { parseBrazilianPhone } from '../src/shared/phone';

describe('parseBrazilianPhone', () => {
  it('normaliza celular no formato exibido no Maps', () => {
    expect(parseBrazilianPhone('(12) 99168-9416')).toEqual({
      e164: '+5512991689416',
      formatted: '(12) 99168-9416',
      isMobile: true,
    });
  });

  it('normaliza telefone fixo e não o marca como celular', () => {
    expect(parseBrazilianPhone('(12) 3631-0000')).toEqual({
      e164: '+551236310000',
      formatted: '(12) 3631-0000',
      isMobile: false,
    });
  });

  it('aceita +55 e zero de operadora', () => {
    expect(parseBrazilianPhone('+55 12 3631-0000')?.e164).toBe('+551236310000');
    expect(parseBrazilianPhone('012991689416')?.e164).toBe('+5512991689416');
    expect(parseBrazilianPhone('5512991689416')?.e164).toBe('+5512991689416');
  });

  it('não confunde DDD 55 com código do país', () => {
    expect(parseBrazilianPhone('(55) 3212-3456')?.e164).toBe('+555532123456');
  });

  it('rejeita números sem DDD, 0800 e lixo', () => {
    expect(parseBrazilianPhone('4004-1234')).toBeNull();
    expect(parseBrazilianPhone('0800 123 4567')).toBeNull();
    expect(parseBrazilianPhone('(12) 88168-9416')).toBeNull(); // 9 dígitos sem 9 inicial
    expect(parseBrazilianPhone('(10) 3631-0000')).toBeNull(); // DDD inexistente
    expect(parseBrazilianPhone('')).toBeNull();
    expect(parseBrazilianPhone('abc')).toBeNull();
  });
});
