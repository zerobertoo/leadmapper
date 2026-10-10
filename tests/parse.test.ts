// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  detectBlock,
  extractLead,
  fieldWarnings,
  findDetailsPanel,
  isPanelForCard,
  listCards,
  panelSignature,
  parseRating,
  type PanelCheck,
} from '../src/content/parse';
import type { Lead } from '../src/shared/types';

const fixture = (name: string) => readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('parseRating', () => {
  it('lê nota e avaliações dos dois formatos', () => {
    expect(parseRating('4,8(1.234)')).toEqual({ rating: 4.8, reviews: 1234 });
    expect(parseRating('5,0 estrelas 14 avaliações')).toEqual({ rating: 5, reviews: 14 });
    expect(parseRating('')).toEqual({ rating: null, reviews: null });
  });
});

describe('listCards', () => {
  it('lista os cartões sem repetir o mesmo link', () => {
    document.body.innerHTML = fixture('maps-feed.html');
    const cards = listCards();
    expect(cards.map((card) => card.name)).toEqual(['Drogaria Pacheco', 'Drogaria Pacheco', 'Clínica Sorriso']);
  });

  it('devolve lista vazia quando o feed some', () => {
    document.body.innerHTML = '<div>nada</div>';
    expect(listCards()).toEqual([]);
  });
});

describe('extractLead', () => {
  const card = { name: 'Clínica Sorriso', url: 'https://www.google.com/maps/place/x', element: null as never };

  it('extrai todos os campos do painel completo', () => {
    document.body.innerHTML = fixture('maps-panel-full.html');
    const lead = extractLead(findDetailsPanel()!, card, 'dentista em Taubaté');
    expect(lead).toMatchObject({
      nome: 'Clínica Sorriso',
      categoria: 'Dentista',
      nota: 4.8,
      avaliacoes: 1234,
      endereco: 'Rua Exemplo, 100 - Centro, Taubaté - SP, 12000-000',
      telefone: '(12) 3631-0000',
      site: 'https://clinicasorriso.com.br/',
      status_enriquecimento: 'pendente',
    });
  });

  it('tolera painel sem site e sem telefone e usa o aria-label das estrelas', () => {
    document.body.innerHTML = fixture('maps-panel-no-site.html');
    const lead = extractLead(findDetailsPanel()!, card, 'q');
    expect(lead).toMatchObject({
      nome: 'Consultório Dra. Ana',
      nota: 5,
      avaliacoes: 14,
      telefone: '',
      site: '',
      status_enriquecimento: 'sem_site',
    });
  });

  it('segue lendo a nota quando a classe ofuscada some', () => {
    document.body.innerHTML = fixture('maps-panel-full.html').replace(
      '<div class="F7nice"><span>4,8</span><span>(1.234)</span></div>',
      '<span role="img" aria-label="4,8 estrelas 1.234 avaliações"></span>',
    );
    const lead = extractLead(findDetailsPanel()!, card, 'q');
    expect(lead).toMatchObject({ nota: 4.8, avaliacoes: 1234 });
  });
});

describe('isPanelForCard', () => {
  const drogariaA = 'https://www.google.com/maps/place/Drogaria+Pacheco/data=!4m7!3m6!1s0x94cc1:0xaaa!8m2';
  const drogariaB = 'https://www.google.com/maps/place/Drogaria+Pacheco/data=!4m7!3m6!1s0x94cc2:0xbbb!8m2';
  const base: PanelCheck = {
    shownName: 'Drogaria Pacheco',
    expectedName: 'Drogaria Pacheco',
    previousName: 'Drogaria Pacheco',
    signature: 'Rua A, 10|(12) 3000-0001',
    previousSignature: 'Rua A, 10|(12) 3000-0001',
    currentUrl: drogariaA,
    cardUrl: drogariaB,
    previousUrl: drogariaA,
  };

  it('rejeita o painel antigo quando duas lojas seguidas têm o mesmo nome', () => {
    expect(isPanelForCard(base)).toBe(false);
    // a URL já mudou para a nova loja, mas o painel ainda é o da anterior
    expect(isPanelForCard({ ...base, currentUrl: drogariaB })).toBe(false);
  });

  it('aceita quando URL e assinatura são da nova loja', () => {
    expect(isPanelForCard({ ...base, currentUrl: drogariaB, signature: 'Rua B, 20|(12) 3000-0002' })).toBe(true);
  });

  it('rejeita painel de outra empresa quando o id da URL não bate', () => {
    expect(
      isPanelForCard({
        ...base,
        shownName: 'Outra',
        previousName: 'Drogaria Pacheco',
        signature: 'x|y',
        currentUrl: drogariaA,
        cardUrl: drogariaB,
        previousUrl: 'https://www.google.com/maps/search/farmacia',
      }),
    ).toBe(false);
  });

  it('sem id na URL, exige que a URL tenha mudado desde a empresa anterior', () => {
    const noId = { ...base, cardUrl: 'https://www.google.com/maps/place/Foo', currentUrl: 'https://www.google.com/maps/place/Foo' };
    expect(isPanelForCard({ ...noId, previousUrl: noId.currentUrl })).toBe(false);
    expect(isPanelForCard({ ...noId, previousUrl: 'https://www.google.com/maps/place/Bar', signature: 'novo|novo' })).toBe(true);
  });

  it('rejeita painel sem nome', () => {
    expect(isPanelForCard({ ...base, shownName: '' })).toBe(false);
  });
});

describe('panelSignature', () => {
  it('junta endereço e telefone', () => {
    document.body.innerHTML = fixture('maps-panel-full.html');
    expect(panelSignature(findDetailsPanel()!)).toBe('Rua Exemplo, 100 - Centro, Taubaté - SP, 12000-000|(12) 3631-0000');
  });
});

describe('fieldWarnings', () => {
  const lead = (overrides: Partial<Lead>) => ({ categoria: 'Dentista', endereco: 'Rua A', nota: 4, ...overrides }) as Lead;

  it('não avisa antes de 10 itens', () => {
    expect(fieldWarnings(Array.from({ length: 9 }, () => lead({ nota: null })))).toEqual([]);
  });

  it('avisa o campo vazio em 80% ou mais dos itens', () => {
    const leads = Array.from({ length: 10 }, () => lead({ nota: null }));
    const warnings = fieldWarnings(leads);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('nota');
  });
});

describe('detectBlock', () => {
  it('reconhece a página de verificação do Google', () => {
    expect(detectBlock(document, 'https://www.google.com/sorry/index?continue=x')).toBe(true);
    expect(detectBlock(document, 'https://consent.google.com/m?continue=x')).toBe(true);
    document.body.innerHTML = '<form action="/sorry/index"></form>';
    expect(detectBlock(document, 'https://www.google.com/maps/search/x')).toBe(true);
  });

  it('não confunde o Maps normal com bloqueio', () => {
    document.body.innerHTML = fixture('maps-feed.html');
    expect(detectBlock(document, 'https://www.google.com/maps/search/x')).toBe(false);
  });
});

describe('fontes por campo', () => {
  it('registra origem e data dos dados vindos do Maps', () => {
    document.body.innerHTML = fixture('maps-panel-full.html');
    const lead = extractLead(findDetailsPanel()!, { name: 'x', url: 'u', element: null as never }, 'q');
    expect(lead.fontes?.telefone).toEqual({ origem: 'maps', em: lead.coletado_em });
    expect(lead.fontes?.site?.origem).toBe('maps');
    expect(lead.fontes?.emails).toBeUndefined();
  });
});
