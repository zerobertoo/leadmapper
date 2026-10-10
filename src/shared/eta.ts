const MIN_ITEMS_FOR_ESTIMATE = 10;

/**
 * Tempo restante (ms) pela média das empresas realmente visitadas. Os itens
 * pulados são quase instantâneos e ficam de fora da média. Antes de 10 itens
 * visitados, devolve null.
 */
export function estimateRemainingMs(input: {
  startedAt: number;
  now: number;
  found: number;
  processed: number;
  skipped: number;
}): number | null {
  const visited = input.processed - input.skipped;
  const remaining = input.found - input.processed;
  if (visited < MIN_ITEMS_FOR_ESTIMATE || remaining <= 0 || input.startedAt <= 0) return null;
  return Math.round(((input.now - input.startedAt) / visited) * remaining);
}

/** "menos de 1 min", "≈ 3 min", "≈ 1 h 5 min" */
export function formatRemaining(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes <= 1) return 'menos de 1 min';
  if (minutes < 60) return `≈ ${minutes} min`;
  return `≈ ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
