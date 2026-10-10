/**
 * Todos os seletores do DOM do Google Maps ficam aqui. Quando o Google mudar
 * o HTML, o ajuste é feito apenas neste arquivo. Preferir atributos estáveis
 * (role, aria-label, data-item-id) a textos, pois o Maps pode estar em outro idioma.
 *
 * Cada chave é uma lista em ordem de preferência: o primeiro seletor que achar
 * algo vence (ver `queryFirst` em parse.ts). Os fallbacks marcados com "validar"
 * ainda não foram conferidos no DOM real do Maps.
 */
export const SELECTORS = {
  // painel rolável com a lista de resultados da busca
  resultsFeed: ['div[role="feed"]'],
  // link que cobre cada cartão da lista; aria-label é o nome da empresa
  resultCard: ['a[href*="/maps/place/"]'],
  // mensagem de fim da lista (classe ofuscada, melhor esforço; há o fallback das 3 rolagens)
  endOfList: ['span.HlvSq'],
  // campo de busca, usado para descobrir o termo pesquisado
  searchInput: ['#searchboxinput'],

  // painel de detalhes: o que contém o endereço e tem aria-label com o nome
  detailsPanel: ['div[role="main"][aria-label]'],
  detailsLoadedMarker: ['[data-item-id="address"], button[data-item-id^="phone"], a[data-item-id="authority"]'],
  address: ['button[data-item-id="address"]'],
  phone: ['button[data-item-id^="phone"]'],
  website: ['a[data-item-id="authority"]'],
  category: ['button[jsaction*="category"]', '[jsaction*="category"]'],
  // horário de funcionamento; validar no DOM real (o texto vem do aria-label ou do bloco)
  hours: ['[data-item-id="oh"]', '[aria-label*="orário" i]', '[aria-label*="hours" i]'],
  // bloco com nota e total de avaliações (ex.: "5,0 (14)"); a classe é ofuscada.
  // validar: o fallback usa o aria-label do ícone de estrelas (ex.: "5,0 estrelas 14 avaliações")
  ratingBlock: ['div.F7nice', '[role="img"][aria-label*="estrela" i]', '[role="img"][aria-label*="star" i]'],
} as const;
