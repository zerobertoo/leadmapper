import { describe, expect, it } from 'vitest';
import { estimateRemainingMs, formatRemaining } from '../src/shared/eta';

describe('estimateRemainingMs', () => {
  const base = { startedAt: 1_000, now: 101_000, found: 120, processed: 20, skipped: 0 };

  it('usa a média das empresas visitadas', () => {
    // 20 itens em 100 s = 5 s por item; faltam 100
    expect(estimateRemainingMs(base)).toBe(500_000);
  });

  it('ignora itens pulados na média', () => {
    expect(estimateRemainingMs({ ...base, processed: 30, skipped: 10 })).toBe(450_000);
  });

  it('não estima antes de 10 itens visitados ou sem horário de início', () => {
    expect(estimateRemainingMs({ ...base, processed: 9 })).toBeNull();
    expect(estimateRemainingMs({ ...base, processed: 20, skipped: 15 })).toBeNull();
    expect(estimateRemainingMs({ ...base, found: 20 })).toBeNull();
  });
});

describe('formatRemaining', () => {
  it('formata minutos e horas', () => {
    expect(formatRemaining(30_000)).toBe('menos de 1 min');
    expect(formatRemaining(180_000)).toBe('≈ 3 min');
    expect(formatRemaining(3_900_000)).toBe('≈ 1 h 5 min');
  });
});
