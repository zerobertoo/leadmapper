# LeadMapper: mapeamento de melhorias

Oct 10, 2026 · análise e planejamento (nada foi implementado) · base: commit `c05f4f2`

> **Aviso sobre o enunciado.** O texto recebido chegou truncado em três pontos: o início do item 1, o item 2 (só o final: "…painel de detalhes e os seletores em `selectors.ts`") e o item 9, que não aparece. Os itens 3 a 8 chegaram inteiros ou quase. Na seção 6 marquei o que é **hipótese minha** (itens 1 e 2) e o que ficou **sem conteúdo** (item 9). As perguntas abertas pedem a confirmação.

## 1. Resumo executivo

1. **Provar que o painel aberto é o da empresa clicada**, usando o id do Maps na URL em vez de comparar nomes, e repetir o item uma vez antes de contar falha. Hoje duas lojas seguidas com o mesmo nome passam com os dados da anterior.
2. **Limpar o contato exportado**: e-mail só do domínio da empresa ou de provedor pessoal (sem agência de rodapé); "Site" sem URL de rede social (16 de 97 linhas); WhatsApp sem apóstrofo nem notação científica no Excel.
3. **Não perder trabalho**: gravar cada lead na hora (hoje até 9 somem) e um vigia com `chrome.alarms` que retoma a fila de sites com o popup fechado.
4. **Sobreviver à mudança do Maps**: seletores com fallback, aviso quando um campo some em quase todos os itens e fixtures de HTML para testar o content script (hoje sem nenhum teste).
5. **Trabalhar a lista dentro da extensão** (side panel com busca, filtro, remoção e tags) e mostrar progresso com tempo estimado. É o maior ganho de uso, mas custa mais, por isso fica na Onda 3.

Atalho de 5 minutos: remover `activeTab` e `downloads` do manifest (sem uso). O armazenamento em uma chave só **não** precisa mudar agora (seção 6, item 4).

## 2. Como ler este documento

- **Impacto**: A (alto), M (médio), B (baixo). **Esforço**: P (até meio dia), M (1 a 2 dias), G (mais de 2 dias). Estimativas por leitura de código.
- **Evidências** usadas: o código em `src/`, o `manifest.json`, os 37 testes e o CSV real `leads_2026-10-09_2345.csv` (97 leads). Esse CSV é das 23:45; o fix `86d6036` (e-mails de script) saiu às 23:50, então parte dos e-mails ruins dele pode já estar corrigida. Revalidar com uma coleta nova.
- **O que não pude verificar**: nada foi executado no navegador. Tudo que depende do DOM real do Maps (seletores alternativos, formato da URL após o clique) está marcado como "validar em DOM real".
- **Os ids** (R1, D1, U1…) são usados nas ondas e na tabela.

Números do CSV de 23:45, que ancoram as prioridades:

| Métrica | Valor |
| --- | --- |
| Leads | 97 |
| Com telefone | 96 (99%) |
| Com site | 66, dos quais 16 são URL de Instagram/Facebook/Linktree |
| Com e-mail | 27 (54% dos 50 sites reais) |
| Com WhatsApp | 24 |
| E-mails fora do domínio do site | 18 ocorrências em 9 sites (agência, rede, modelo, lixo) |
| WhatsApp com apóstrofo inicial | todas as células com 2 ou mais números |

## 3. Tabela priorizada (impacto × esforço)

Ordenada, dentro de cada eixo, por retorno (impacto alto e esforço baixo primeiro).

### Robustez e desempenho

| Id | Melhoria | Imp. | Esf. | Onda |
| --- | --- | --- | --- | --- |
| R1 | Confirmar o painel pelo id do Maps (`placeKey(location.href)` contra `placeKey(card.url)`) e repetir o item uma vez antes de contar falha | A | P | 1 |
| R2 | Gravar cada lead na hora (ou espelhar o buffer em `chrome.storage.session`) e limpar o buffer junto com "Limpar lista" | A | P | 1 |
| R3 | Vigia do enriquecimento com `chrome.alarms` (retoma a fila se o service worker morreu e o popup está fechado) | A | P | 1 |
| R4 | `try/catch` no popup (`run`) e `.catch` no `handlePopupMessage`: hoje uma rejeição deixa o popup em "Carregando…" | M | P | 1 |
| R5 | Seletores como lista ordenada (principal + fallbacks) e remoção da dependência de `div.F7nice` e `span.HlvSq` | A | M | 1 |
| R6 | Autodiagnóstico por campo: aviso quando nota, telefone, endereço etc. ficam vazios em ≥80% de pelo menos 10 itens | A | M | 1 |
| R7 | Separar as funções puras do content script (`parse.ts`) e testá-las com fixtures de HTML do Maps | A | M | 1 |
| R8 | Dedup: não fundir leads de endereços divergentes só por telefone ou domínio compartilhado; guardar todos os `maps_ids` do lead mesclado | A | M | 1 |
| R9 | Fim da lista: esperar novos cartões por até N s (ou `MutationObserver`) em vez de 3 rolagens de ~1 s | M | P | 2 |
| R10 | Detectar `/sorry/` (captcha) e tela de consentimento do Google e pausar com mensagem clara | M | P | 2 |
| R11 | Fetch dos sites: tratar 429/503 com `Retry-After` e nova tentativa espaçada, hoje vira `erro` direto | M | P | 2 |
| R12 | Testes do service worker e do `storage.ts` com um `chrome.storage` falso (máquina de estados, retomada, buffer) | M | M | 2 |
| R13 | Log de diagnóstico local (anel de 200 eventos) e botão "Copiar diagnóstico" | M | M | 2 |
| R14 | Throttle da releitura do popup e do `patchLead` durante o enriquecimento | B | P | 2 |
| R15 | Armazenamento por lead (`lead:<id>` + índice), se o acúmulo esperado passar de ~5 mil | M | G | 3 (condicional) |

### Features de dados

| Id | Melhoria | Imp. | Esf. | Onda |
| --- | --- | --- | --- | --- |
| D1 | Classificar e-mail pelo domínio (próprio / provedor pessoal / terceiro), ignorar rodapé "desenvolvido por" e descartar ou marcar terceiros | A | M | 1 |
| D2 | Coluna "Site" vazia quando o site do Maps é rede social ou link de WhatsApp; ajustar contador de sites visitados | A | P | 1 |
| D3 | CSV: WhatsApp legível (`+55 12 99168-9416`), sem apóstrofo em células com várias linhas; teste cobrindo o caso | A | P | 1 |
| D4 | Validar e-mail: TLD existente, local com 2+ caracteres (`n@crisvet.taki`, `ncontato@`) | M | P | 2 |
| D5 | Fonte e data por campo (RF4.2 do PRD, hoje só `busca_origem` e `coletado_em`) | M | P | 2 |
| D6 | E-mail genérico × pessoal (LGPD): marcar `contato@`, `vendas@` como genéricos e `nome.sobrenome@` como pessoais; opção de exportar só genéricos | A | P | 2 |
| D7 | Exportar JSON e vCard (XLSX só se o dono aceitar dependência ou escrita à mão) | M | M | 3 |
| D8 | Tags e status de contato por lead (novo, ligou, sem interesse…) | M | M | 3 |
| D9 | Horário de funcionamento e redes extras (LinkedIn, YouTube, TikTok) | B | M | 3 |

### Interface e usabilidade

| Id | Melhoria | Imp. | Esf. | Onda |
| --- | --- | --- | --- | --- |
| U1 | Lista de leads no side panel: busca, filtro, ordenação, remover, editar, tags | A | G | 3 |
| U2 | Barra de progresso (`<progress>`), tempo estimado e nome da empresa atual | A | P | 2 |
| U3 | Badge no ícone com contagem enquanto coleta (o popup fecha ao perder o foco) | A | P | 2 |
| U4 | Hierarquia do popup: 3 números em destaque, o resto em `<details>` | M | P | 2 |
| U5 | Microcopy: separar "falhas de item" de "sites que não abriram"; trocar jargão ("pulados", "duplicados removidos") | M | P | 2 |
| U6 | `confirm()` nativo por `<dialog>` com contagem de leads e atalho para exportar antes | M | P | 2 |
| U7 | Acessibilidade: `aria-live` no status, `role="alert"` nos erros, `<main>`, alvos ≥24 px nos checkboxes | M | P | 2 |
| U8 | Estado vazio e primeiro uso (3 passos) | B | P | 2 |
| U9 | Escolher a busca a exportar a partir de uma lista de buscas (hoje "toda" ou "a mais recente") | M | M | 3 |

### Segurança, privacidade e conformidade

| Id | Melhoria | Imp. | Esf. | Onda |
| --- | --- | --- | --- | --- |
| S1 | Remover `activeTab` e `downloads`; decidir `unlimitedStorage` | M | P | 1 |
| S2 | Blindar o CSV contra fórmula: espaço inicial, e o caso do WhatsApp (D3) | M | P | 1 |
| S3 | `https://*/*` e `http://*/*` como `optional_host_permissions`, pedidos no clique de "Iniciar" | M | M | 3 (se publicar) |
| S4 | Aviso de LGPD e de termos do Google no primeiro uso, não só no README | M | P | 2 |
| S5 | Preparação para a Chrome Web Store: política de privacidade, justificativas, ícones 16/48/128, screenshots 1280×800, `CHROMEWEBSTORE.md` | M | M | 3 (se publicar) |

### Qualidade de engenharia

| Id | Melhoria | Imp. | Esf. | Onda |
| --- | --- | --- | --- | --- |
| E1 | CI (typecheck, test, build) | M | P | 2 |
| E2 | Lint e formatação (ESLint + Prettier, ou Biome) | B | P | 2 |
| E3 | Uma fonte de versão (`package.json` ↔ `manifest.json`) e `npm run package` que gera o zip de `dist/` | B | P | 3 |
| E4 | `minimum_chrome_version` no manifest | B | P | 1 |
| E5 | Decidir se `.agents/`, `.claude/` e `skills-lock.json` entram no git ou no `.gitignore` | B | P | 1 |

## 4. Plano em ondas

### Onda 1: correções e robustez

**Itens**: R1, R2, R3, R4, R5, R6, R7, R8, D1, D2, D3, S1, S2, E4, E5.
**Ordem sugerida**: R7 primeiro (fixtures dão rede de segurança para R1, R5 e R6), depois R1, R2+R3, D1+D2+D3, S1+S2, R8.

Critérios de aceite (todos verificáveis):

| Id | Critério | Como verificar |
| --- | --- | --- |
| R1 | Teste de unidade: dois cartões consecutivos com o **mesmo nome** e ids diferentes; o painel antigo não é aceito | `npm test` (teste falha antes do fix e passa depois) |
| R1 | Coleta real de uma rede (ex.: "drogaria em Taubaté"): 0 leads em que o nome diverge do trecho `/maps/place/<nome>/` do `url_maps` | script de auditoria sobre o CSV (a mesma checagem que deu 0 divergências em ~120 empresas) |
| R2 | Parar o service worker em `chrome://serviceworker-internals` com 7 leads fora de lote: ao retomar, `leads salvos` = `processados − falhas − pulados` | contagem no popup |
| R2 | "Limpar lista" com leads no buffer: a lista fica em 0 e continua em 0 após o próximo lote | manual |
| R3 | Parar o service worker durante o enriquecimento, com popup fechado: em até 1 min nenhum lead segue `pendente` com site | `chrome.storage.local` no DevTools do service worker |
| R4 | Forçar `getActiveMapsTab` a lançar (aba sem permissão): popup mostra erro e botão "Tentar de novo" em vez de "Carregando…" | manual |
| R5 | Cada seletor tem ao menos um fallback documentado; remover `div.F7nice` do DOM da fixture não zera nota e avaliações | teste com fixture |
| R6 | 10 itens seguidos com um campo vazio (categoria, endereço ou nota): aviso com o nome do campo no popup, sem derrubar a coleta. Telefone não entra, pois muitas empresas não têm | teste de unidade |
| R7 | `extractLead`, `parseRating`, `listCards`, `findDetailsPanel` e `waitForDetails` têm testes com ≥3 fixtures de HTML (empresa completa, sem site, sem telefone) | `npm test`; total de testes ≥ 50 |
| R8 | Dois estabelecimentos com o mesmo telefone e endereços diferentes ficam como 2 leads; mesma empresa em 2 buscas continua virando 1 | teste em `dedupe.test.ts` |
| D1 | Em coleta nova do mesmo nicho do CSV de referência: 0 e-mails com domínio ≠ site, exceto provedores pessoais e itens marcados "terceiro" | script sobre o CSV |
| D1 | Fixture com rodapé "Desenvolvido por Agência X (contato@agencia.com.br)": e-mail não extraído | `extract.test.ts` |
| D2 | 0 linhas do CSV com Instagram, Facebook, Linktree ou wa.me na coluna Site; a URL continua nas colunas Instagram/Facebook | script sobre o CSV |
| D3 | Nenhuma célula de WhatsApp começa com `'`; o CSV aberto no Excel pt-BR mostra o número completo, sem `E+12` | teste em `csv.test.ts` + abrir o arquivo |
| S1 | `manifest.json` sem `activeTab` e `downloads`; build carrega e coleta + exporta funcionam; README atualizado | build + manual |
| S2 | Teste com " =1+1", "\t=cmd" e "+Bem Estar" (nome) escapados | `csv.test.ts` |
| Geral | `npm run typecheck`, `npm test` e `npm run build` verdes | CLI |

### Onda 2: usabilidade e interface

**Itens**: R9–R14, D4–D6, U2–U8, S4, E1, E2.

| Id | Critério | Como verificar |
| --- | --- | --- |
| U2 | Tempo estimado exibido a partir do 10º item; erro médio ≤30% em 3 coletas | comparar com o tempo real |
| U3 | Com o popup fechado, o badge mostra o número de leads e vira "OK" ao concluir | manual |
| U4 | Em coleta, o popup mostra no máximo 3 números sem rolar; os demais ficam em `<details>` | manual, 360 px |
| U5 | "Erros" deixa de somar falhas de item e sites; cada contador tem um único significado | leitura do popup |
| U6 | `window.confirm` não existe mais no código; o `<dialog>` fecha com Esc e devolve o foco ao botão | `grep` + teclado |
| U7 | Navegação só por teclado alcança todos os botões e campos sem armadilha; status e erros são anunciados por leitor de tela; axe sem violações sérias; contraste ≥4,5:1 nos dois temas | Tab/Shift+Tab, NVDA ou Narrator, axe-core no DevTools |
| R9 | Em rede lenta (DevTools: Slow 3G), a lista chega ao mesmo total que em rede normal ±5% | comparar `found` |
| R10 | Página `/sorry/` simulada leva a estado `error` com texto "O Google pediu verificação; resolva e tente de novo" | teste com fixture |
| R11 | Servidor de teste devolvendo 429 com `Retry-After: 2`: o site é tentado de novo depois de 2 s | `enrich.test.ts` |
| D4/D6 | Fixtures com `n@crisvet.taki` e `contato@` / `joao.silva@`: o primeiro some, os outros dois recebem o tipo certo | `extract.test.ts` |
| D5 | Cada lead novo tem origem e data por campo; o CSV não muda | teste de tipo + leitura do storage |
| R12 | Testes cobrem START→DONE→enriching→done e PAUSE→flush, com `chrome.storage` falso | `npm test` |
| E1 | CI roda typecheck, test e build em cada push | execução do workflow |

### Onda 3: features

**Itens**: U1, U9, D7, D8, D9, R15 (condicional), S3 e S5 (condicionais a publicar), E3.
**Pré-requisito de interface**: U1 é uma superfície nova; antes dela, rodar `/impeccable init` (cria `PRODUCT.md`) e `/impeccable shape`.

| Id | Critério | Como verificar |
| --- | --- | --- |
| U1 | Com 1.000 leads, filtrar por texto atualiza a tabela em <100 ms e a lista rola sem travar | `performance.now()` e Performance do DevTools |
| U1 | Tabela navegável por teclado, com `<th scope>`, cabeçalho fixo e layout empilhado em largura estreita | axe + teclado |
| U1 | O botão do popup abre o side panel por gesto do usuário (`chrome.sidePanel.open`) | manual |
| D7 | JSON exportado reimporta sem perda; vCard abre no Google Contatos com nome, telefone e e-mail | manual |
| D8 | Tag ou status editados persistem após reiniciar o navegador e saem no CSV (se o dono quiser) | manual |
| R15 | Com 5.000 leads sintéticos, o ciclo de gravação por lead não passa de 50 ms por escrita | teste de carga com `chrome.storage` real |
| S3 | Instalação nova só pede Maps; ao clicar em "Iniciar" com busca de sites ligada, aparece o pedido dos demais hosts; recusar mantém a coleta só do Maps | manual |
| S5 | Checklist de `review-checklist.md` da skill sem itens abertos | revisão |

### Status da Onda 1 (2026-10-10)

Implementado e coberto por testes (63 passam; typecheck e build verdes): R1, R2, R3, R4, R5, R6, R7, R8, D1, D2, D3, S1, S2, E4, E5. Mudanças de interface mínimas: lista de avisos no popup (R6).

Pendente de validação **no navegador** (não dá para provar sem o Maps real):

- R1: confirmar que a URL do Maps muda e traz `!1s0x…:0x…` depois do clique no cartão. Se não trouxer, o código cai no plano B (URL mudou + assinatura endereço/telefone), sem travar.
- R5/R7: os fallbacks de seletor e as fixtures são **sintéticos**; trocar por capturas reais do Maps.
- R3: matar o service worker em `chrome://serviceworker-internals` durante o enriquecimento, com o popup fechado, e conferir a retomada em até 1 min.
- D3: abrir o CSV no Excel pt-BR e conferir a coluna WhatsApp.
- Revisitar a coleta de referência (nicho pet) e rodar o script de auditoria de e-mails e de nome × link.

### Status da Onda 2 (2026-10-10)

Implementado, com 82 testes passando, typecheck, lint e build verdes: R9, R10, R11, R12, R13, R14, D4, D5, D6, U2, U3, U4, U5, U6, U7, U8, S4, E1, E2.

Diferenças em relação ao plano:

- **R10**: detecta a verificação (URL `/sorry/` ou consentimento, `iframe` de recaptcha, formulário `/sorry/`) enquanto o content script ainda está na página do Maps. Se o Google redirecionar a aba inteira para `/sorry/`, o script é descarregado e o popup mostra "Abra uma busca no Google Maps".
- **R14**: só o popup foi suavizado (releitura agrupada a cada 250 ms). O `patchLead` continua gravando a cada site, pois o custo só importa acima de ~5 mil leads (ver R15).
- **D6**: a coluna "Tipo de e-mail" (genérico ou pessoal) vai no fim do CSV e há a opção de exportar só genéricos. A classificação é heurística: `clinicasorriso@gmail.com` conta como genérico e `petshop.pinheiros@gmail.com` como pessoal.
- **E1**: workflow em Node 24 com `actions/checkout@v5` e `actions/setup-node@v5`. O push continua só quando você pedir.
- **E2**: Biome só com o linter, sem formatador, para não reescrever o repositório inteiro.
- **U7**: `<main>`, checkboxes de 18 px, foco visível em campos, avisos como `role="alert"`; o status não anuncia mais "Carregando…".

Pendente de validação no navegador: dialog de "Limpar lista" (Esc, foco, "Exportar antes"), progresso com tempo estimado, badge com o popup fechado e leitura do popup com leitor de tela.

## 5. Recomendações das skills aplicadas

### `chrome-extensions`

| Recomendação da skill | Onde se aplica no LeadMapper |
| --- | --- |
| Regra 7: service worker efêmero, sem estado em variáveis, `chrome.alarms` em vez de timers | `pendingBatch`, `writeChain`, `enrichmentRunning` e `nextFreeSlot` vivem em memória. Fila e estado já são reconstruídos do storage (bom). O buffer de até 9 leads é a exceção → R2. Vigia por `alarms` → R3 |
| `service-worker.md`: registrar listeners no topo, de forma síncrona | Já cumprido em `background/index.ts`. Manter ao criar o vigia: o `onAlarm` deve ser registrado no topo |
| `storage.md`: `local` tem 10 MB; `session` sobrevive ao reinício do worker e serve para "operações em andamento" | Base da análise do item 4 e da alternativa de R2 (espelhar o buffer em `storage.session`) |
| Regra 12: `activeTab` só vale com gesto direto e é inútil quando há host permission | O acesso ao Maps já vem de `host_permissions`; `activeTab` não tem uso → S1 |
| Regra 4: `tab.url` exige `tabs` ou host permission | `getActiveMapsTab` lê `tab.url`; funciona porque o Maps está nos hosts. Se um dia os hosts do Maps virarem opcionais, isso quebra: por isso S3 só torna **opcionais os hosts dos sites**, não os do Maps |
| Regra 20: `permissions.request()` como primeira instrução, sem `await` antes | S3: o pedido tem de sair do clique em "Iniciar" no popup, não de um handler do service worker depois de ler storage |
| Regra 2: side panel precisa de gatilho explícito; com popup, usar botão que chama `chrome.sidePanel.open()`; `openPanelOnActionClick` (não `...IconClick`) e sem `default_popup` | U1: manter o popup e abrir o painel por botão |
| Regra 1: ícones só se os arquivos existirem; omitir é válido | Manifest sem `icons` hoje é válido. Para a loja, criar os três PNGs → S5 |
| Regra 15: notificações exigem `iconUrl` real | Razão para usar badge (U3) e não `chrome.notifications` |
| Regras 5 e 6: async/await, `return true`, não bloquear a thread | Cumpridas. Falta apenas tratar a rejeição do `handlePopupMessage` → R4 |
| `content-scripts.md`: usar `MutationObserver` em páginas dinâmicas | R9 (fim da lista) |
| `review-checklist.md`: permissão sem uso é causa de rejeição; hosts amplos precisam de justificativa; política de privacidade ativa | S1, S3, S5. A skill também manda criar `CHROMEWEBSTORE.md` quando se prepara para publicar; não criei agora por ser sessão de análise |

### `modern-web-guidance`

Buscas feitas com `npx modern-web-guidance search`; guias recuperados: `accessibility`, `light-dismiss-a-dialog` e `responsive-table`.

| Guia | Recomendação | Onde se aplica |
| --- | --- | --- |
| `accessibility` §8 | Uma região `polite` para status; `assertive` só para erro crítico; não anunciar estados intersticiais como "Carregando…" | U7: `#status` já tem `role="status"`; erros passam a `role="alert"`; remover "Carregando…" do anúncio |
| `accessibility` §2, §3 | Preferir HTML nativo; `disabled` retira do foco, `aria-disabled` mantém | U7/U8: "Iniciar coleta" desabilitado some do Tab sem explicar; usar `aria-disabled` com texto do motivo |
| `accessibility` §1 | Conteúdo dentro de landmarks e heading sequencial | U7: popup tem `h1`, mas não tem `<main>` |
| `accessibility` §5 | Foco com `:focus-visible` e `outline-offset`; alvos ≥24×24 px | Botões já cumprem; checkboxes (13 px) e `select` precisam de `min-block-size` → U7 |
| `accessibility` §12 e `light-dismiss-a-dialog` | `<dialog>` com `showModal()`, `aria-labelledby`, `closedby` | U6 (substituir `confirm()`); o guia pede fallback para navegadores sem `closedby`, desnecessário para "Chrome atual", mas barato |
| `responsive-table` | `<table>` semântica, cabeçalho `sticky`, layout empilhado por `@container` | U1 (lista de leads no side panel, largura variável) |

### `impeccable` (usada no lugar de `frontend-design`)

O popup é uma superfície **Operate** (tarefa, escaneabilidade, controles padrão). Não há `PRODUCT.md` nem `DESIGN.md`, então o carregador de contexto exige `init` antes de qualquer superfície nova (U1), mas permite refinamentos pontuais sem bloqueio. Rodei a leitura de código seguindo a rubrica de `audit` (estimativa, **sem executar o detector nem renderizar**):

| Dimensão | Nota | Achado principal |
| --- | --- | --- |
| Acessibilidade | 3/4 | Foco visível, rótulos e `lang` corretos; faltam `aria-live` de erro, `<main>`, alvos pequenos |
| Desempenho | 3/4 | Popup leve; releitura integral da lista a cada mudança (R14) |
| Tema | 3/4 | Tokens e `prefers-color-scheme` presentes; sem cores soltas |
| Responsivo | 3/4 | 360 px fixo é adequado ao popup; side panel pede layout fluido |
| Integridade | n/a | Detector não executado |

Comandos recomendados, na ordem: `distill` (U4, 9 contadores viram 3 + detalhes), `clarify` (U5, U8), `harden` (R4, R10, estados de erro), `onboard` (U8, S4), `adapt` (U1 no side panel) e `polish` ao final. Antes de U1, `/impeccable init`.

> Há uma versão mais nova do Impeccable (v4.5.2; instalada 4.5.0). Atualizar agora? Roda `npx impeccable update`. Não executei.

## 6. Pendências do estado atual (itens 1 a 9)

### Item 1 (texto truncado; hipótese: tempo de coleta e velocidade)

- **O que há de concreto**: 120 empresas em ~7 min são ~3,5 s por empresa, dentro da meta do PRD (<15 min).
- **Causa provável**: por empresa, pausa aleatória de 0,8 a 2 s (modo normal) + 200 ms de polling + carregamento do painel. As pausas são deliberadas (anti-bloqueio, RF1.2).
- **Correção sugerida**: não acelerar por padrão. Ganhos seguros: trocar o polling de 200 ms por `MutationObserver` (poucos centésimos por item) e mostrar tempo estimado (U2). Reduzir pausas ou abrir várias abas do Maps entra em "o que não fazer".
- **Confirmar** com o dono qual era o item.

### Item 2 (texto truncado; hipótese: dependência do DOM do Maps e seletores ofuscados)

- **Causa provável**: `selectors.ts` mistura estáveis (`role="feed"`, `data-item-id`) com classes geradas (`div.F7nice` para nota e avaliações, `span.HlvSq` para fim da lista) e `button[jsaction*="category"]`, que depende de string interna. Quando o Google trocar o hash, a nota some **sem erro**: o `ERROR` só dispara se *todos* os itens falharem, e campos opcionais ficam vazios por desenho (RF1.4).
- **Correção sugerida**:
  1. R5: cada chave vira lista ordenada; `queryFirst(root, SELECTORS.rating)`. Candidatos para validar em DOM real: elemento `[role="img"][aria-label]` com estrelas para a nota; texto do bloco da nota como fallback; categoria como o primeiro botão sob o título.
  2. R6: contar campos preenchidos por coleta e avisar quando um campo some em ≥80% de pelo menos 10 itens.
  3. R7: salvar 3 páginas de detalhes reais como fixtures e testá-las com `happy-dom` ou `jsdom`. Requer extrair as funções puras de `maps.ts`, que hoje registra listeners ao ser importado.

### Item 3: troca entre cartões só verificada parcialmente

- **Causa provável**: `waitForDetails` (`maps.ts:135`) aceita o painel quando `shownName === expectedName || shownName !== previousName`. Se duas empresas **consecutivas** têm o mesmo nome (redes: "Drogaria Pacheco", "Petz"), `expectedName === previousName`: o painel **antigo** satisfaz a primeira condição na hora, e o lead sai com os dados da anterior e o `url_maps` da nova. O teste real de 0 divergências não cobre esse caso porque nicho de pet shop raramente repete nome em sequência. Há ainda o risco de dois painéis `role="main"` no DOM durante a transição (`findDetailsPanel` devolve o primeiro com marcador).
- **Correção sugerida** (R1): depois do clique, esperar que `placeKey(location.href)` seja igual a `placeKey(card.url)` (o id `0x…:0x…` vem em `!1s…` nos dois) e só então ler o painel; manter a comparação de nome como segunda checagem. Uma nova tentativa (re-clicar) antes de contar falha. Validar em DOM real que a URL muda após o clique. Auditoria offline: comparar `nome` do CSV com o trecho `/maps/place/<nome>/` do link.
- **Observação**: `listCards()` guarda referências a elementos; se o Maps passar a virtualizar a lista, elas ficam obsoletas. Reconsultar o cartão pela URL na hora do clique é barato e cobre isso.

### Item 4: leads em uma única chave de `chrome.storage.local`

- **Como funciona**: `upsertLeads` (a cada lote) e `patchLead` (a cada site) leem e regravam o array inteiro. O popup, a cada mudança, também relê o array inteiro.
- **Custo estimado** (≈0,6 KB por lead; medir de fato):

| Leads salvos | Tamanho da chave | Escrita a cada site | Total reescrito numa coleta de 120 sobre essa base |
| --- | --- | --- | --- |
| 120 | ~70 KB | desprezível | ~5 MB |
| 1.000 | ~0,6 MB | alguns ms | ~70 MB |
| 5.000 | ~3 MB | dezenas de ms | ~0,4 GB |
| 10.000 | ~6 MB | perto da cota de 10 MB sem `unlimitedStorage` | ~0,7 GB |

- **Diagnóstico**: para o uso descrito (listas de 100 a 1.000, acumulando buscas) **não é problema**; o custo só aparece perto de 5 mil. Os riscos reais são outros: (a) leitura e escrita não atômicas entre quem escreve (o `writeChain` serializa o service worker, mas "Limpar lista" no popup escreve fora dele), (b) o buffer em memória (item 8), (c) a cota se `unlimitedStorage` for removida.
- **Correção sugerida**: agora, R14 (throttle) e R2. Armazenamento por lead (R15, `lead:<id>` + chave de índice por `dedupeKey`) **apenas** se o dono espera acumular mais de ~5 mil. Não usar IndexedDB: perderia `chrome.storage.onChanged` e o popup reativo, sem ganho para esse volume. Pergunta aberta 8.

### Item 5: `activeTab` e `downloads` sem uso; `https://*/*` amplo

- **Causa**: ficaram do PRD (que os listava de antemão). O CSV sai por link `blob` no popup e o acesso ao Maps vem de `host_permissions`.
- **Correção sugerida**: S1 remove `activeTab` e `downloads` e atualiza a tabela do README. `scripting` fica (reinjeção do content script). `unlimitedStorage`: decidir junto com o item 4. Hosts amplos: S3 move `https://*/*` e `http://*/*` para `optional_host_permissions` e pede no clique de "Iniciar", mantendo os hosts do Maps estáticos (assim `tab.url` continua funcionando). Só vale a pena se for publicar; para uso pessoal o custo de UX supera o ganho. Alternativa mais radical (sem host do Maps, só `activeTab` no clique do ícone) foi descartada: perde a injeção automática e a retomada.

### Item 6: e-mails de agências entram como contato da empresa

- **Evidência**: `villapetstore.com.br` → `suporte@liguesitesaobernardo.com.br`; `encrenquinhas.com.br` → `contato@consultoriaconsec.com.br`. Também aparecem lixo e modelos (`n@crisvet.taki`, `exemplo@exemplo.com`, `mail@exemplo.com.br`; vários já cobertos pelo fix `86d6036`).
- **Causa**: `extractEmails` tira todos os e-mails da página, só filtra por lista fixa de domínios e **não compara com o domínio do site** nem olha o contexto do rodapé.
- **Correção sugerida** (D1):
  1. Remover `<footer>` e linhas com "desenvolvido por / criado por / developed by / by" antes de extrair.
  2. Classificar cada e-mail: `proprio` (domínio registrável igual ao do site), `pessoal` (gmail, hotmail, outlook, yahoo, uol, bol, terra), `terceiro` (resto).
  3. Manter `proprio` e `pessoal`; `terceiro` fora do CSV por padrão (ou em coluna à parte, decisão do dono).
  4. Cuidado com marcas com variações (`petlandbrasil.com.br` × `petlandbr.com.br`, `zeedog.com.br` × `zee-dog.com`): comparar o "miolo" do domínio sem hífen e sem sufixo, em vez de igualdade estrita.
  5. D4 junto: rejeitar TLD inexistente e local com 1 caractere.

### Item 7: coluna "Site" repete a URL do Instagram/Facebook

- **Evidência**: 16 de 97 linhas do CSV; 44 leads com Instagram preenchido.
- **Causa**: `toRow` escreve `lead.site` sempre e `socialLink` repete a mesma URL em Instagram/Facebook (`deriveFields` copia o site social para `redes_sociais`, mas não esvazia `site`). O popup ainda conta esses leads em "Sites visitados".
- **Correção sugerida** (D2): na exportação, `site` vazio quando o domínio for social ou link `wa.me`/`api.whatsapp.com`; no popup, `withSite` ignora esses. Manter `lead.site` no storage, pois o status `sem_site` e o `dedupeKey` já dependem dele.

### Item 8: buffer de gravação, até 9 leads podem se perder

- **Causa**: `pendingBatch` é variável de módulo e só é gravada a cada 10 leads (RF4.1) ou em PAUSE, CANCEL, DONE e ERROR. Se o service worker morrer antes (inatividade, atualização da extensão, crash), os leads do buffer somem, e como o content script não reenvia, só reaparecem numa nova coleta. Além disso, "Limpar lista" não esvazia o buffer: o próximo flush reintroduz leads apagados.
- **Correção sugerida** (R2): a mais simples é `BATCH_SIZE = 1` (cada lead grava na hora; com a lista em uma chave é um `set` de poucos KB a dezenas de KB, aceitável até ~5 mil). Alternativa que mantém lotes: espelhar o buffer em `chrome.storage.session`. Em ambos os casos, a mensagem "CLEAR" do popup passa pelo service worker para zerar o buffer. **Muda o RF4.1 do PRD**; pergunta aberta 2.
- **Risco relacionado** (R3): o enriquecimento é retomado ao acordar o worker, mas nada o acorda se o popup está fechado. Um site lento (home 2×10 s + 3 páginas) pode passar de 30 s sem chamada de API de extensão e matar o worker. Confirmar com `chrome://serviceworker-internals`; o vigia com `alarms` cobre.

### Item 9 (não chegou)

O texto salta do item 8 para o eixo "Usabilidade". **Preciso do conteúdo para responder.** Achados que não encaixam nos itens acima e que anotei:

- `url_maps` do lead mesclado é descartado, então a retomada revisita o cartão e o conta de novo em "duplicados" (R8).
- O PRD (RF4.2) pede a fonte de cada dado; o modelo só guarda busca e data (D5).
- `toRow`/`escapeCell` põe apóstrofo visível nas células de WhatsApp com vários números (D3).
- `exportScope: 'current'` é "a busca do lead mais recente", não "a busca aberta no Maps" (U9).

## 7. Fora de escopo da v1 (v2+), separado do plano

Não entram nas ondas; só se o dono reabrir o PRD.

- Qualificação, pontuação de leads e qualquer uso de LLM.
- Outras fontes: LinkedIn, Instagram como fonte, base de CNPJ.
- Integração com CRM, envio de mensagens, e-mail marketing.
- Nuvem, login, multiusuário, sincronização (`storage.sync` também envia dados ao Google).
- Validação de e-mail por servidor externo (MX/SMTP): quebra o "nenhum dado sai do navegador".
- Firefox e Safari.
- XLSX com biblioteca de terceiros (decisão do dono: D7).

### O que NÃO fazer (mesmo dentro da v1)

- Não reduzir as pausas padrão nem abrir várias abas do Maps para "ganhar tempo": é o que sustenta o aviso de uso pessoal e o risco de captcha.
- Não contornar captcha, usar proxy ou disfarçar a origem (R10 só **detecta e pausa**).
- Não adicionar telemetria, nem "relatório de erro automático"; o diagnóstico (R13) é local e copiado à mão.
- Não usar `chrome.notifications` (pede ícone e permissão); o badge basta.
- Não introduzir framework de UI no popup. Reavaliar apenas se U1 passar de ~600 linhas.
- Não mexer em `enrich.ts`, `phone.ts` e `queue.ts` sem necessidade: estão cobertos por testes e não têm defeito conhecido.

## 8. Decisões (tomadas em 2026-10-10, a pedido do dono: "decide tudo por mim")

Todas as perguntas da versão anterior foram decididas; o plano acima já reflete isso. Cada decisão pode ser revertida pelo dono.

| # | Pergunta | Decisão | Efeito no plano |
| --- | --- | --- | --- |
| 1 | Itens 1, 2 e 9 truncados | Hipóteses mantidas (1 = tempo de coleta, 2 = seletores). O item 9 é considerado coberto pelos "achados adicionais" da seção 6 | Nenhum |
| 2 | Lote de gravação | Gravar **cada lead na hora** (`BATCH_SIZE = 1`). O RF4.1 do PRD passa a dizer "a cada registro" quando R2 for implementado | R2 como descrito |
| 3 | Publicar na Web Store | **Não na v1.** Continua extensão descompactada, como o PRD | S3 e S5 saem da Onda 3 e vão para o backlog v2+ |
| 4 | E-mail de domínio diferente | **Descartar** (terceiro não entra no CSV nem na coluna). Provedores pessoais (gmail, hotmail, outlook, yahoo, uol, bol, terra) **ficam** como válidos | D1 sem coluna extra de "terceiro" |
| 5 | Novas colunas no CSV | Pode, **só no fim**; as 15 colunas atuais não mudam de ordem nem de nome. Novas: "Tipo de e-mail", depois "Status" e "Tags" (quando D8 existir) | D6 e D8 |
| 6 | Lista de leads | **Side panel**, aberto por botão no popup (`chrome.sidePanel.open`), com busca, filtro, ordenação, remover, status/tag e exportar o que está filtrado. Editar campos livres fica de fora | U1 reduzido; permissão `sidePanel` só na Onda 3 |
| 7 | Formatos | CSV + **JSON + vCard**. **Sem XLSX** (o CSV com BOM já abre no Excel) | D7 sem XLSX; XLSX vai para v2+ |
| 8 | Volume | Alvo de até **5 mil** leads acumulados. `unlimitedStorage` **fica**. Armazenamento por lead (R15) só se uma escrita passar de 50 ms ou o alvo subir | R15 vai para o backlog, com esse gatilho |
| 9 | Tags e status | Status fixos: `novo`, `contatado`, `sem interesse`, `cliente`; tags livres. Ambos saem no CSV, no fim | D8 |
| 10 | Nome | Mantém **LeadMapper** até decidir publicar | Nenhum |
| 11 | `.agents/`, `.claude/`, `skills-lock.json` | `.agents/` e `.claude/` vão para o `.gitignore` (conteúdo de terceiros, regenerável); `skills-lock.json` é versionado | E5 |
| 12 | CI | Adicionar o workflow do GitHub Actions (typecheck, test, build). O push continua só quando você pedir | E1 |
| 13 | Domínios do Maps | Só `google.com/maps` e `google.com.br/maps` (uso no Brasil) | Nenhum |

### Consequências para a ordem de execução

1. Onda 1 sem mudança, com R2 = `BATCH_SIZE = 1` e D1 descartando terceiros.
2. Onda 2 sem mudança, com E1 como arquivo de workflow.
3. Onda 3 passa a ser: U1 (side panel), U9, D7 (JSON e vCard), D8, D9 e E3.
4. Backlog v2+ acrescentado de: S3, S5, R15 (gatilho acima) e XLSX.
