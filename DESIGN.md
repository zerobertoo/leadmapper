---
name: LeadMapper
description: Landing do LeadMapper como folha de guia de ruas, onde uma busca vira lista.
colors:
  paper: "#f4f7fb"
  sheet: "#ffffff"
  ink-navy: "#10213a"
  muted-slate: "#475872"
  rule: "#c3cfdf"
  rule-strong: "#7388a6"
  brand-blue: "#0b57d0"
  highlight-blue: "#e1ecfc"
  route-yellow: "#f6c744"
  paper-dark: "#0b1524"
  sheet-dark: "#101d31"
  ink-dark: "#e8eef8"
  brand-blue-dark: "#8ab4f8"
  band-dark: "#1648a6"
  cover-navy: "#0a2350"
  cover-muted: "#c4d3ee"
  muted-slate-dark: "#a3b3cb"
  rule-dark: "#2b4166"
  rule-strong-dark: "#5f7aa3"
  highlight-blue-dark: "#1b2f52"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(3.5rem, 10vw, 6rem)"
    fontWeight: 700
    lineHeight: 0.92
  headline:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(2.25rem, 5.5vw, 3.5rem)"
    fontWeight: 700
    lineHeight: 1
  title:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.1
  code:
    fontFamily: "ui-monospace, Cascadia Code, Consolas, monospace"
    fontSize: "0.9em"
    fontWeight: 400
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.55
rounded:
  xs: "4px"
  sm: "8px"
  control: "10px"
  md: "12px"
  lg: "16px"
  pill: "999px"
spacing:
  gutter: "24px"
  gutter-mobile: "16px"
  section: "96px"
components:
  button-primary:
    backgroundColor: "{colors.brand-blue}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.md}"
    height: "52px"
    padding: "0 24px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.brand-blue}"
    rounded: "{rounded.md}"
    height: "52px"
  button-quiet:
    textColor: "{colors.ink-navy}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 14px"
---

# Design System: LeadMapper

## Overview

**Creative North Star: "A folha de guia de ruas"**

A página é uma folha de atlas rodoviário: índice de colunas e linhas, legenda numerada, rota em três paradas. A busca vira lista dentro desse mapa, e o produto nunca flutua como mockup. O tom é técnico e honesto, com letras de placa de via em Barlow Condensed e corpo calmo em Barlow.

A interface recusa o hero de SaaS (popup flutuante, gradientes, vidro). Azul de marca aparece só em ação e pinos; amarelo de rota só no percurso.

**Key Characteristics:**
- Grade de coordenadas e filetes tracejados como motivo de página inteira.
- Maiúsculas condensadas para títulos, corpo em caixa mista.
- Uma única cena animada (a coleta), uma vez por carregamento.
- Claro e escuro completos, seguindo o sistema com chave manual.

## Colors

Azul-carta e branco de via sobre tinta marinho, com um único amarelo.

### Primary
- **Azul de marca** (#0b57d0, dark #8ab4f8): botões, links, pinos e números.

### Secondary
- **Amarelo de rota** (#f6c744, dark #c99a1c): via principal do mapa e a linha da rota.

### Neutral
- **Papel** (#f4f7fb / #0b1524): fundo da página.
- **Folha** (#ffffff / #101d31): superfícies como a folha do mapa e a tabela.
- **Tinta marinho** (#10213a / #e8eef8): texto e filetes fortes.
- **Ardósia** (#475872 / #a3b3cb): texto secundário.
- **Filete** (#c3cfdf / #2b4166) para divisórias; **filete forte** (#7388a6 / #5f7aa3) para contornos de controles (3:1).
- **Faixa** (#0b57d0 / #1648a6): a faixa de privacidade.
- **Capa** (#0a2350, texto #ffffff e #c4d3ee): fundo do hero em ambos os temas, com grade branca a 6% e a via em amarelo de rota.

### Named Rules
**A Regra do Amarelo.** Amarelo só desenha o percurso (via principal e rota). Nunca vira fundo, botão nem destaque.

## Typography

**Display Font:** Barlow Condensed (700, 600), fallback Arial Narrow
**Body Font:** Barlow (400, 600), fallback system-ui

**Character:** letras de placa de via contra texto de leitura simples.

### Hierarchy
- **Display** (700, 3.5–6rem, 0.92): título do hero, em maiúsculas.
- **Headline** (700, 2.25–3.5rem, 1): títulos de seção, em maiúsculas.
- **Title** (600, 1.5rem, 1.1): paradas da rota, em maiúsculas.
- **Body** (400, 1.125rem, 1.55): texto corrido, medida até 62ch.
- **Label** (600, 0.9375rem): controles, legenda, tabelas.

## Layout

Contêiner de 76rem com gutter de 24px (16px no celular). Seções separadas por 96px (64px no celular) e abertas por um filete tracejado com a referência de grade no canto direito (B1, C2, D3, F4). Duas colunas a partir de 62rem; abaixo disso, tudo empilha.

## Elevation & Depth

Plano por padrão: a profundidade vem de filetes e do contraste papel/folha, como numa folha impressa. Botões primários têm só uma sombra curta e neutra.

### Named Rules
**A Regra da Folha Impressa.** Superfícies não têm sombra difusa. Borda de 1px define o limite.

## Shapes

Cantos de 8–16px, pílula só para a busca e o tema. Pinos de mapa em gota; passos da rota em círculo.

## Components

### Buttons
- **Shape:** 12px de raio, 52px de altura (44px no formato pequeno).
- **Primary:** azul de marca, texto branco; um por seção de ação.
- **Ghost:** transparente com contorno azul.
- **Quiet (repetir demonstração):** contorno forte, texto em tinta.
- **Hover / Focus:** sobe 2px; foco com anel de 3px na cor de marca.

### Folha de mapa (signature)
SVG com moldura, índice de colunas A–F e linhas 1–4, ruas e pinos numerados; a legenda abaixo liga cada linha ao pino por número.

### Navigation
Três links em texto e o botão de tema; alvos de 44px.

## Do's and Don'ts

### Do:
- **Do** usar azul de marca só em ação e pinos.
- **Do** manter uma única cena animada e respeitar `prefers-reduced-motion`.
- **Do** usar `--line-strong` em contornos de controle.

### Don't:
- **Don't** usar mockup de popup flutuando, gradientes ou vidro.
- **Don't** usar amarelo fora do percurso.
- **Don't** usar borda lateral colorida ou sombra difusa em superfícies.
