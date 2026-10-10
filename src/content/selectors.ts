/**
 * Todos os seletores do DOM do Google Maps ficam aqui. Quando o Google mudar
 * o HTML, o ajuste é feito apenas neste arquivo. Preferir atributos estáveis
 * (role, aria-label, data-item-id) a textos, pois o Maps pode estar em outro idioma.
 */
export const SELECTORS = {
  // painel rolável com a lista de resultados da busca
  resultsFeed: 'div[role="feed"]',
  // link que cobre cada cartão da lista; aria-label é o nome da empresa
  resultCard: 'a[href*="/maps/place/"]',
  // mensagem de fim da lista (classe ofuscada, melhor esforço; há o fallback das 3 rolagens)
  endOfList: 'span.HlvSq',
  // campo de busca, usado para descobrir o termo pesquisado
  searchInput: '#searchboxinput',

  // painel de detalhes: o que contém o endereço e tem aria-label com o nome
  detailsPanel: 'div[role="main"][aria-label]',
  detailsLoadedMarker: '[data-item-id="address"], button[data-item-id^="phone"], a[data-item-id="authority"]',
  address: 'button[data-item-id="address"]',
  phone: 'button[data-item-id^="phone"]',
  website: 'a[data-item-id="authority"]',
  category: 'button[jsaction*="category"]',
  // bloco com nota e total de avaliações (ex.: "5,0 (14)"; classe ofuscada)
  ratingBlock: 'div.F7nice',
} as const;
