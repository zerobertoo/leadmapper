/**
 * Todos os seletores do DOM do Google Maps ficam aqui. Quando o Google mudar
 * o HTML, o ajuste é feito apenas neste arquivo. Preferir atributos estáveis
 * (role, aria-label, data-item-id) a textos, pois o Maps pode estar em outro idioma.
 */
export const SELECTORS = {
  // painel rolável com a lista de resultados da busca
  resultsFeed: 'div[role="feed"]',
} as const;
