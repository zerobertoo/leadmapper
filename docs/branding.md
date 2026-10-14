# Identidade visual do LeadMapper

Simples de propósito: uma marca, uma cor, uma fonte do sistema. Tudo que é fonte da verdade fica em `brand/`.

## Marca

Um pin de mapa com três linhas dentro: **mapa** (de onde vêm os dados) + **lista** (o que o usuário leva).

| Arquivo | Uso |
|---|---|
| `brand/logo.svg` | Fonte única da marca (128×128). Edite só este arquivo. |
| `brand/icon-{16,32,48,128}.png` | Gerados do SVG. Copiados para `dist/icons/` no build e ligados no `manifest.json`. |

Regras: não distorcer, não trocar a cor do quadrado, não adicionar sombra ou gradiente. Em fundo escuro, usar o ícone como está (o quadrado azul já tem contraste).

## Nome

**LeadMapper**, uma palavra, L e M maiúsculos. Nunca "Lead Mapper", "leadmapper" ou "LM" na interface.

Descrição curta: *Transforma buscas do Google Maps em listas de leads.*

## Cor

Uma cor de marca, a mesma já usada como `--accent` nas telas:

| Papel | Claro | Escuro |
|---|---|---|
| Marca / ação | `#0b57d0` | `#8ab4f8` |
| Texto sobre a marca | `#ffffff` | `#0b1a33` |
| Texto | `#1f2328` | `#e6e8eb` |
| Fundo | `#ffffff` | `#1f2125` |
| Borda | `#c4c7ce` | `#4a4e57` |
| Perigo | `#d93025` | `#f28b82` |

Azul é a única cor de destaque. Vermelho só para erro. Sem cor decorativa.

## Tipografia

`system-ui, sans-serif` em tudo. Sem fonte customizada: a extensão carrega rápido e parece nativa do Chrome. Corpo 14 px, títulos em peso 600.

## Tom de voz

Português do Brasil, frases curtas, sem jargão. Erro diz o que houve e o que fazer. Detalhes em `PRODUCT.md`.

## Regenerar os ícones

Depois de mexer em `brand/logo.svg`, exporte de novo os PNGs 16, 32, 48 e 128 px (fundo transparente) com os mesmos nomes.
