# Revisão das Ondas 1 a 3 do LeadMapper

Escopo: `c05f4f2..HEAD` na `main` (18 commits, 47 arquivos, +3578/−279). Revisão somente de leitura: nenhum código foi alterado.
Data: 2026-10-10. Método: leitura integral de `src/`, `manifest.json`, `vite.config.ts`, `tests/` e dos documentos; execução das quatro verificações; sondas descartáveis (fora do repositório) para provar cada achado marcado como **reproduzido**.

Legenda de evidência: **reproduzido** (rodei um script e vi a saída errada), **por leitura** (o código prova, sem execução), **depende do Maps real** (não verificável sem o navegador).

## 0. Status das correções (2026-10-10)

Aplicadas depois da revisão; testes 114 passam (eram 93), typecheck, lint (sem avisos) e build verdes. Nada foi commitado.

| Achado | Situação |
| --- | --- |
| P1-1 cadeia envenenada | Corrigido: `enqueueWrite` captura a falha, registra no log e devolve o lote ao buffer (com `clearEpoch` para não ressuscitar após CLEAR). `logChain` com `.catch`. Teste novo em `background.test.ts`. |
| P1-2 seleção escondida | Corrigido: remover, aplicar status e exportar usam `selectedVisibleIds()`. Teste novo em `tests/sidepanel.test.ts`. |
| P2-1 CLEAR fora da fila | Corrigido: `clearAll` entra em `writeChain`. |
| P2-2 janela de crédito | Corrigido: "feito/criado por" exige "site/loja/página/portal" antes; a janela para no próximo fecho de tag. |
| P2-3 TLDs | Corrigido ampliando a lista (`pet`, `vet`, `law`, `fit`, `studio`, `design`, `saude` e outros). A lista continua fechada; ver pergunta 5. |
| P2-4 provedores | Corrigido: `hotmail.com.br`, `outlook.com.br`, `live.com.br`, `globo.com`, `globomail.com`, `r7.com`, `zipmail.com.br`, `pop.com.br`. |
| P2-5 regex quadrático | Corrigido com limites de 64 e 63 caracteres; 300 mil caracteres em menos de 1 s (teste). |
| P2-6 falhas seguidas | Corrigido: 5 falhas seguidas interrompem a coleta com `MAPS_CHANGED_MESSAGE`. Sem teste automatizado (o laço de `maps.ts` não tem harness). |
| P2-7 `sameAddress` | Corrigido: inclusão só por palavras inteiras. |
| P2-8 `indexByKey` | Corrigido: lista de unidades por chave. |
| P2-9 LGPD no painel | Corrigido: o painel lê `genericEmailsOnly` e `discardWithoutContact` das opções do popup. Ver pergunta 4 (onde ficam as opções). |
| P2-10 concorrência | Corrigido: até 3 faixas que retiram o próximo pendente; leads novos entram sem esperar a rodada. Teste de 3 simultâneos. |
| P3-1 | Corrigido (`decodeURIComponent` protegido). |
| P3-2 | `expectedName` (campo morto) removido; a guarda por id + assinatura segue como estava. |
| P3-3, P3-4, P3-5, P3-6, P3-7 | Corrigidos, com testes. |
| P3-8 | Corrigido para o endereço da ficha (`isPrivateHost`). Redirecionamentos do servidor para IP privado não são bloqueados. |
| P3-9 | Não alterado: depende de medir o `chrome.storage` no navegador. |
| P3-10 | Corrigido: erro de envio vira mensagem no resumo; leituras fora de ordem descartadas; render duplicado removido. |
| P3-11, P3-12, P3-13, P3-16 | Corrigidos (texto do diagnóstico, README/PRD, `minimum_chrome_version` 118, lint). |
| P3-14 | Parcial: eventos de coleta exigem `sender.tab` e formato mínimo do lead. |
| P3-15 | Não alterado: depende da pergunta 2. |

Perguntas 1 a 8 continuam abertas; as correções acima não decidem nenhuma delas.

### Validação no Maps real (2026-10-10, Chrome, busca "veterinário em Santos")

Feita lendo o DOM da página com o navegador, sem a extensão carregada (não dá para instalar uma extensão descompactada por aqui).

| Item | Resultado |
| --- | --- |
| URL do Maps após o clique traz `!1s0x…:0x…` e coincide com o do cartão | Confirmado (cartão e URL com o mesmo id). A URL atualiza em 300 a 700 ms; o nome do painel às vezes muda antes do id, então exigir os dois (`isPanelForCard`) é correto. |
| Cliques seguidos com `scrollIntoView` | Funcionam (4 de 4). Sem `scrollIntoView`, 2 de 4 cliques não navegaram: manter o `scrollIntoView` em `collectCard`. |
| Seletores de endereço, telefone, site, categoria e nota (`div.F7nice` = "4,8(178)") | Confirmados. |
| Seletor de horário | **Defeito encontrado e corrigido**: `[aria-label*="orário" i]` casava o ícone e gravava o texto "Horário de funcionamento". O resumo real está no `div[role="button"][aria-expanded]` que contém o ícone ("Aberto 24 horas"). |
| `#searchboxinput` | Não existe mais; o campo é `input[name="q"]`. O fallback pela URL cobria, e o seletor novo foi acrescentado. |
| `span.HlvSq` (fim da lista) | **Não confirmado**: 110 cartões em 10 rolagens sem chegar ao fim; as 3 rolagens ociosas continuam sendo o plano B. |
| Falso positivo de `detectBlock` (recaptcha) | Não ocorreu na página normal. |
| Mesmo id de lugar em dois cartões | Visto (109 ids em 110 cartões): `listCards` dedupe por `href`; a fusão por telefone/endereço cobre. |

## 1. Resumo e resultado das verificações

O núcleo está sólido: confirmação do painel por id, gravação por lead, escape de CSV, dedupe por endereço, filtro de e-mail por domínio e painel lateral sem `innerHTML`. Não há P0. Há dois P1: **uma única gravação que falha derruba todas as seguintes até o service worker reiniciar** (inclusive depois de "Limpar lista") e **o painel lateral remove/altera leads que estão selecionados mas escondidos pelo filtro**. Os P2 se concentram em perda silenciosa de e-mails (janela de crédito, TLDs, `hotmail.com.br`), em um regex de e-mail de custo quadrático que pode congelar o service worker, e em dedupe por substring. Os testes cobrem bem os módulos puros e quase nada do ciclo de vida (falha de gravação, corrida com CLEAR, painel lateral, popup, laço de coleta).

| Verificação | Resultado |
| --- | --- |
| `npm test` | 11 arquivos, 93 testes, todos passam |
| `npm run typecheck` | sem erros |
| `npm run lint` | exit 0; 2 avisos (`noDescendingSpecificity` em `sidepanel.css:215` e `:220`) e 1 info (`useTemplate` em `export.ts:34`) |
| `npm run build` | 4 passes ok; `dist/` com `background.js`, `content.js`, `manifest.json`, `popup.html`, `sidepanel.html` e `assets/`; sem script inline |

Observação: a saída do lint condensada pelo RTK veio ilegível ("ESLint output (JSON parse failed)", sendo que o projeto usa Biome). Usei `rtk proxy` e `RTK_DISABLED=1` conforme a orientação; o exit 0 foi confirmado sem o RTK.

## 2. Achados

### P0

Nenhum.

### P1

**P1-1. Uma gravação que falha envenena `writeChain` e todas as gravações seguintes somem em silêncio**
- Onde: `src/background/index.ts:47`, `:55`, `:127`, `:190`, `:199`, `:270` (`logChain` tem o mesmo padrão).
- O que está errado: `writeChain = writeChain.then(() => upsertLeads(leads))`. Se `upsertLeads` rejeitar uma vez, `writeChain` fica rejeitada para sempre; todo `.then(...)` encadeado depois é pulado. `CLEAR` só faz `.catch(() => undefined)` num ramo local (`:190`) e **não reatribui** a cadeia, então ela continua rejeitada. `pendingBatch` já foi esvaziado em `:53`, então o lead perdido não volta.
- Cenário (reproduzido, armazenamento simulado): `storage.local.set` rejeita uma vez ("QUOTA_BYTES"); chegam `LEAD_FOUND` L1 (falha), L2, L3. Leads gravados: `[]`. Depois `CLEAR` e `LEAD_FOUND` L4: leads gravados `[]`. Cada falha ainda gera `unhandledRejection` (`void handleContentEvent`, `:314`; `void writeChain.then(processPending)`, `:57`).
- Impacto: a coleta continua "andando", o contador `withPhone` (vem de `progress`) sobe, e nada é salvo até o service worker reiniciar. Com `unlimitedStorage` a falha é rara (disco cheio, corrupção do IndexedDB do Chrome), mas o efeito é perda total e silenciosa.
- Correção: isolar a falha de cada passo. Por exemplo, `const run = (job) => (writeChain = writeChain.catch(() => undefined).then(job))` e registrar o erro em `appendLog`/`ERROR`. Reaproveitar `run` em `flushBatch`, `enrichLead`, `UPDATE/DELETE_LEADS`, `CLEAR` e `logChain`. Se o lote falhar, devolver os leads a `pendingBatch` ou avisar o popup.

**P1-2. Remover e "Aplicar status" agem sobre a seleção inteira, inclusive linhas escondidas pelo filtro**
- Onde: `src/sidepanel/sidepanel.ts:272-282` (usa `[...selected]`), contra `:173-183` (`updateBulk` conta só `visibleIds`) e `:221-224` (exportar usa a interseção com o filtro).
- Cenário (por leitura): o usuário marca 3 leads, digita um termo que deixa só 1 deles visível. O texto mostra "1 selecionados", mas "Remover selecionados" envia `DELETE_LEADS` com os 3 ids e `applyStatus` muda os 3. `selected` só é limpo de ids que **não existem mais** (`:188-189`), nunca dos filtrados.
- Impacto: remoção irreversível (o diálogo diz "Isso não pode ser desfeito") de leads que o usuário não vê. O diálogo mostra a contagem real (3), o que ameniza, mas contradiz o rótulo "1 selecionados".
- Correção: em `removeButton`, `applyStatus` e `exportLeads`, usar `filteredLeads().filter(l => selected.has(l.id))`; ou limpar `selected` dos ids fora do filtro a cada mudança de filtro. Escolher uma regra só e aplicá-la nos três.

### P2

**P2-1. `CLEAR` não passa pela fila de gravações e pode ser desfeito por um `patchLead` em voo**
- Onde: `src/background/index.ts:187-195` (`clearAll()` em `:191` fora de `writeChain`).
- Cenário (reproduzido, janela de ~3 ms no armazenamento simulado; 3 de 10 tentativas): 3 sites terminam quase juntos; `CLEAR` chega com o primeiro `patchLead` em voo. `CLEAR` capturou o fim da cadeia; o segundo patch se encadeia depois e lê o array antes do `remove` e grava depois. Resultado: 3 leads reaparecem após "Limpar lista".
- Impacto: baixo na prática (o botão fica escondido durante a coleta, e a janela é de milissegundos), mas "limpar" que não limpa quebra a promessa do RF4.3.
- Correção: `writeChain = writeChain.then(() => clearAll())` e só então responder; limpar `pendingBatch` antes, como já faz.

**P2-2. `CREDIT_REGEX` apaga 300 caracteres depois de qualquer "feito por", "criado por", "site by"…**
- Onde: `src/shared/extract.ts:55-57`, aplicado em `:62`.
- Cenário (reproduzido): `<p>Tudo é feito por artesãos locais. Fale: <a href="mailto:contato@loja.com.br">…` devolve `[]`; `<footer>Desenvolvido por Agência X</footer><p>Contato: vendas@clinica.com.br</p>` devolve `[]`. Só o caso "e-mail antes do crédito" sobrevive.
- Impacto: falso negativo silencioso de e-mail legítimo, que é o dado de maior valor do produto. A janela é medida em caracteres de HTML, não de texto, então muda com o markup.
- Correção: parar a janela no fim do elemento (próximo `</footer>`, `</p>`, `</li>` ou `\n\n`), ou exigir que o e-mail tenha domínio diferente do site (a classificação por marca em `keepOwnEmails` já faz isso depois). Remover o crédito pelo domínio é mais seguro que pela posição.

**P2-3. Lista fechada de TLDs rejeita domínios reais do público-alvo**
- Onde: `src/shared/extract.ts:29-33` e `:41`.
- Cenário (reproduzido): `ab@clinica.vet`, `ab@loja.pet`, `ab@x.law`, `ab@x.fit`, `ab@x.studio`, `ab@x.design`, `ab@x.saude` retornam `[]`. A coleta de referência do projeto é do nicho pet.
- Impacto: leads de `.pet`/`.vet` ficam sem e-mail e com status `ok`, sem aviso.
- Correção: inverter a lógica. Aceitar qualquer TLD alfabético e rejeitar só os de lixo conhecido (extensões de arquivo, que já estão em `FILE_EXTENSIONS`, e o caso "n@crisvet.taki" pelo comprimento da parte local). Se manter a lista, acrescentar `pet`, `vet`, `law`, `fit`, `studio`, `design`, `saude`, `bio`.

**P2-4. `hotmail.com.br` e variantes comuns não estão em `PERSONAL_PROVIDERS`**
- Onde: `src/shared/extract.ts:167-170`.
- Cenário (reproduzido): `keepOwnEmails(['joao@hotmail.com.br','a@gmail.com'], 'clinica.com.br')` devolve só o Gmail. Para a decisão 4 de `docs/melhorias.md` (§8) "hotmail" deve ficar.
- Impacto: pequenas empresas que usam `@hotmail.com.br`, `@outlook.com.br`, `@globo.com`, `@yahoo.com`, `@bol.com.br` perdem o contato.
- Correção: incluir `hotmail.com.br`, `outlook.com.br`, `globo.com`, `globomail.com`, `r7.com`, `zipmail.com.br`, `pop.com.br`. Ver pergunta aberta 3.

**P2-5. `EMAIL_PATTERN` tem custo quadrático em sequências longas sem `@`**
- Onde: `src/shared/extract.ts:3` e `:67` (`html.match(EMAIL_PATTERN)`); o limite é `MAX_HTML_LENGTH = 1_500_000` em `src/background/enrich.ts:13`.
- Cenário (reproduzido): `extractEmails('a'.repeat(N))` leva 130 ms (N=20 mil), 3,3 s (N=100 mil) e 25,6 s (N=200 mil). Cada posição varre até o fim da sequência de `[a-z0-9._%+-]`. Um blob hexadecimal ou base64url em um site pode chegar a isso.
- Impacto: o service worker fica sem responder (sem badge, sem mensagens, sem alarme) durante a análise de uma única página; o site vem de uma ficha do Maps, ou seja, o dono do negócio controla a entrada.
- Correção: limitar a parte local, `[a-z0-9._%+-]{1,64}@`, e os rótulos do domínio, `[a-z0-9-]{1,63}`. Isso torna o custo linear. Teste: `extractEmails('a'.repeat(300_000))` abaixo de 100 ms.

**P2-6. Coleta com seletores quebrados só avisa depois do último cartão**
- Onde: `src/content/maps.ts:164-191` (2 tentativas × 8 s, `:28`) e `:254-256` (a checagem de "todos falharam" fica depois do laço).
- Cenário (por leitura): se o Maps mudar o painel, cada cartão custa 2 × 8 s + pausa (0,8 a 2 s), cerca de 17 s. Com 120 cartões, cerca de 34 minutos clicando sem parar antes de aparecer `MAPS_CHANGED_MESSAGE`. O aviso `fieldWarnings` (`:237`) só dispara a partir de leads coletados; se nenhum painel carrega, não há lead.
- Impacto: 30+ minutos de automação inútil contra o Maps (risco de verificação do Google) e usuário esperando.
- Correção: abortar após N falhas consecutivas (por exemplo 5) com a mesma mensagem. Teste sugerido na seção 3.

**P2-7. `sameAddress` usa `includes` em texto normalizado: "Av. Paulista, 1" casa com "Av. Paulista, 150"**
- Onde: `src/shared/dedupe.ts:78`.
- Cenário (reproduzido): `sameAddress('Av. Paulista, 1','Av. Paulista, 150')` e `sameAddress('Rua A, 10','Rua A, 100 - Centro')` retornam `true`. Com mesmo telefone ou domínio (redes de lojas), duas unidades viram uma e `mergeIntoList` conta um "duplicado".
- Impacto: perda de uma unidade. Exige mesmo telefone/domínio e um número que seja prefixo textual do outro, então é raro, mas é exatamente o caso que a Onda 1 quis proteger.
- Correção: comparar por tokens (`includes` só quando um dos lados não tem número) e exigir `sameNumbers` também no atalho de inclusão.

**P2-8. `indexByKey` aponta sempre para a última unidade; duplicata de unidade que não é a última não funde**
- Onde: `src/shared/dedupe.ts:117` (`new Map(leads.map(...))` com chaves repetidas: vence a última) e `:124-129` (unidade distinta é empurrada sem registrar no mapa).
- Cenário (reproduzido): três unidades A, B, C com o mesmo telefone ficam `[A,B,C]`; ao reentrar A com outro id, o resultado é `[A,B,C,A2]` com `duplicates = 0`. Reentrar B depois de `[A,B]` funde (a última). No lote `A, B, B3` não funde `B3`.
- Impacto: duplicatas de redes com 3+ unidades. Só ocorre quando o mesmo estabelecimento chega com **outra URL do Maps** (a repetição pela mesma URL é pulada por `knownPlaces`, `maps.ts:222`).
- Correção: indexar por `chave + endereço normalizado` ou guardar `Map<chave, índices[]>` e procurar entre eles o primeiro com `sameAddress`.

**P2-9. A exportação do painel lateral ignora as opções de LGPD do popup**
- Onde: `src/sidepanel/sidepanel.ts:233-247` (`leadsToCsv`, `leadsToJson`, `leadsToVcard` direto), contra `src/popup/popup.ts:264-270` (`selectLeadsForExport` com `genericEmailsOnly` e `discardWithoutContact`).
- Cenário (por leitura): o usuário marca "Só e-mails genéricos" no popup e exporta pela lista: os e-mails pessoais saem em CSV, JSON e vCard.
- Impacto: regressão frente ao princípio de `PRODUCT.md` ("e-mails de aparência pessoal... podem ficar fora da exportação"). O painel é a tela de exportação principal da Onda 3.
- Correção: aplicar `genericEmailsOnly` (e `discardWithoutContact`) também no painel, lendo `OPTIONS_STORAGE_KEY`, ou mover as duas opções para o painel. Ver pergunta aberta 4.

**P2-10. A fila de enriquecimento não chega a 3 sites em paralelo durante a coleta**
- Onde: `src/background/index.ts:131-142` (`drainQueue` processa um *snapshot* de `pending` e só relê depois que todo ele termina) com `:57` (cada lead dispara `processPending`).
- Cenário (reproduzido): dois leads com site chegam em 68 ms. O primeiro termina em 3,1 s; o segundo só **começa** aí e termina em 6,2 s. O segundo estava `pendente` desde 68 ms.
- Impacto: desempenho, não correção. Durante a coleta o paralelismo real tende a 1; só o acúmulo no fim chega a 3. O RF2.4 pede "no máximo 3", então não viola, mas desperdiça o tempo de coleta.
- Correção: trocar o snapshot por faixas que, ao esvaziar, releem os pendentes (`while (next = takePending()) await enrichLead(next)`), mantendo o `attempted`.

### P3

- **P3-1. `readSearchQuery()` fica fora do `try`** (`maps.ts:195`; `decodeURIComponent` em `:91` pode lançar em `%` malformado quando o campo de busca está vazio). A exceção deixa `state = 'running'` no content script sem `DONE`; `START` passa a ser ignorado (`:288`) até recarregar a aba. Mover a chamada para dentro do `try` (ou `try/catch` em `readSearchQuery`). Por leitura.
- **P3-2. `isPanelForCard` não usa `expectedName`** (`parse.ts:73` declara; `:88-105` ignora). Com id da URL batendo, só o par nome+assinatura iguais ao **último sucesso** conta como obsoleto. Reproduzido: `shownName:'outra empresa'`, `previousName:'zzz'`, ids iguais → `true`. Se um cartão falha, `previous` continua no último sucesso, e um painel tardio do cartão que falhou passaria. Usar `expectedName` como segunda guarda (aviso, não bloqueio, já que o nome do cartão pode divergir) ou remover o campo morto.
- **P3-3. `PHONE_LIKE` aceita `+5-3`** (`csv.ts:22`): vira fórmula aritmética no Excel (`=+5-3` → 2). Reproduzido. Sem função, então sem execução de comando; ainda assim aperte para `^\+?\d[\d\s()]*(?:-\d+)?…` ou exija o formato `\d{4,5}-\d{4}`.
- **P3-4. vCard**: `\r` solto não é escapado (`export.ts:11` só trata `\r?\n`); reproduzido: nome `A\rEND:VCARD\rBEGIN:VCARD…` injeta um cartão. A URL passa por `escapeVcard` (`:23`), o que insere `\,` em URLs com vírgula (reproduzido: `https://x.com/a\,b\;c`); valores `URI` não levam esse escape. Trocar por `.replace(/\r\n|\r|\n/g, '\\n')` e não escapar `URL:`.
- **P3-5. `extractEmails` corta em 5 antes de classificar** (`extract.ts:74` e `enrich.ts:105`): numa página com 6+ e-mails, os de terceiros que aparecem primeiro empurram o próprio para fora. Por leitura. Cortar só depois de `keepOwnEmails`.
- **P3-6. `brandOf` é frouxo**: reproduzido `casadosaber.com.br` "próprio" de `casa.com.br` (prefixo ≥ 4), `outra.odo.br` "próprio" de `clinicax.odo.br` (`SECOND_LEVEL` sem `odo`, `vet`, `arq`, `eng`…), `x.wixsite.com` "próprio" de qualquer `*.wixsite.com`. Erra para o lado de manter e-mail de terceiro. Completar `SECOND_LEVEL` e exigir prefixo seguido de fronteira de palavra.
- **P3-7. Fusão pode trocar o `id` do lead** (`dedupe.ts:91-92`, base = mais completo; reproduzido: existente `S` vira `BIG`). `patchLead(S)` em voo some (`storage.ts:46`) e o lead fundido volta a ser visitado. Seleção e status por id no painel mudam sem aviso. Manter sempre o `id` do existente.
- **P3-8. SSRF leve**: `enrichSite(lead.site)` busca qualquer `http(s)` vindo da ficha, inclusive `http://localhost`, `192.168.x.x`, `10.x.x.x` (`enrich.ts:94`, `domain.ts`). Só extrai e-mails da resposta, mas o conteúdo de uma página interna pode aparecer como e-mail do lead. Recusar IPs privados e `localhost` em `enrichLead`.
- **P3-9. Custo da gravação do array inteiro**: com 5.000 leads (alvo da decisão 8) o JSON tem cerca de 5,6 MB (medido em Node: `stringify` 11 ms, `parse` 14 ms). Cada lead gera uma gravação e cada site, outra; o painel e o popup releem tudo. O custo do `chrome.storage` em si (clonagem, IPC, disco) **não foi medido**; o gatilho R15 (>50 ms) deve ser medido no navegador.
- **P3-10. Painel lateral**: `edit()` e `DELETE_LEADS` sem tratamento de erro (`sidepanel.ts:216-218`, `:281`); `reload()` pode aplicar leitura fora de ordem (`:211-214`); `render` roda duas vezes na abertura (`:305`).
- **P3-11. Diagnóstico**: o texto promete "sem dados dos leads" (`popup.html:106`), mas o log inclui nomes de empresas (`maps.ts:246` → `popup.ts:306-322`). São dados públicos de PJ, mas a frase deve ser corrigida ou o nome omitido.
- **P3-12. Documentação desatualizada**: `README.md:96` ainda diz "em lotes"; `docs/prd-extensao-leads.md:247` e `:262` falam "salvar em lotes".
- **P3-13. Compatibilidade**: `<search>` (`sidepanel.html:16`) exige Chrome 118; `minimum_chrome_version` é 116. Subir para 118 ou trocar por `<div role="search">`.
- **P3-14. Sem validação de remetente nem de forma das mensagens** (`index.ts:304-322`). Só o próprio código da extensão chega ali, então é defesa em profundidade: aceitar `LEAD_FOUND` e afins apenas com `sender.tab` e validar `lead.emails` etc. antes de `deriveFields`.
- **P3-15. Leads `pendente` ficam parados com "Buscar e-mail nos sites" desligado** (`extractLead` marca `pendente` sempre que há site; `DONE` não os converte) e são visitados na próxima coleta com a opção ligada, mesmo os de coletas canceladas. Ver pergunta aberta 2.
- **P3-16. Lint**: 2 avisos de especificidade em `sidepanel.css:215/220` e o `useTemplate` em `export.ts:34`.

## 3. Lacunas de teste

| # | Lacuna | Teste sugerido |
| --- | --- | --- |
| 1 | Falha de gravação (P1-1) | Em `background.test.ts`, `storage.local.set` rejeita uma vez; enviar L1, L2; esperar que L2 seja gravado e que haja entrada no log. |
| 2 | `CLEAR` concorrente com `patchLead` (P2-1) | Armazenamento com latência; disparar `CLEAR` no meio de dois patches; esperar `leads` vazio. |
| 3 | `DELETE_LEADS` e `UPDATE_LEADS` com o enriquecimento em andamento | Lead pendente, `DELETE_LEADS` do id, patch chega; esperar que nada reapareça. |
| 4 | Painel lateral inteiro (`sidepanel.ts` sem teste) | happy-dom: selecionar 3, filtrar para 1, clicar em remover; esperar `ids.length === 1` (P1-2); `textContent` com `<img onerror>` no nome; `safeMapsUrl` com `javascript:` e `https://www.google.com.evil.com/maps/`. |
| 5 | Popup (`popup.ts` sem teste) | Estados de `render` por `StatusReply`; opção `exportScope`; botão "Abrir lista" chama `sidePanel.open` com `windowId`. |
| 6 | Laço de coleta (`maps.ts` sem teste, só `parse.ts`) | Fixtures com 5 cartões que nunca carregam painel; esperar `ERROR` depois de N falhas, sem 8 s × 2 por cartão (P2-6); `START` com `decodeURIComponent` inválido (P3-1). |
| 7 | `extractEmails` | `'a'.repeat(300_000)` em < 100 ms (P2-5); "feito por" antes de e-mail legítimo (P2-2); `.pet`, `.vet` (P2-3); 6 e-mails com o próprio por último (P3-5). |
| 8 | `classifyEmail` | `hotmail.com.br`, `outlook.com.br` (P2-4); `casa.com.br` × `casadosaber.com.br` (P3-6). |
| 9 | `sameAddress` e `mergeIntoList` | `'Av. Paulista, 1'` × `', 150'` → `false` (P2-7); `[A,B,C]` + `A2` → fundido (P2-8); `mergeLeads` preserva o `id` do existente (P3-7). |
| 10 | CSV | `escapeCell('+5-3')` com apóstrofo (P3-3); coluna "Site" vazia com `linktr.ee`; ordem das 20 colunas (as 15 primeiras iguais a `c05f4f2`). |
| 11 | vCard | `\r` solto não cria linha; URL com vírgula sem barra (P3-4). |
| 12 | Concorrência da fila (P2-10) | Três leads com sites e `fetch` controlado: os três começam antes de qualquer um terminar; um quarto lead chegando no meio entra assim que uma faixa libera. |
| 13 | `isPanelForCard` | Id igual, nome diferente do cartão e do anterior (P3-2); URL sem id nos dois lados com `previousUrl` igual; `timeout` com `checkpoint` em pausa. |
| 14 | Observação sobre os mocks | `tests/background.test.ts` devolve as mesmas referências do `store` (sem `structuredClone`), o que esconde mutação acidental de arrays lidos. Clonar em `get`/`set`. |

## 4. Itens que dependem de validação no navegador

Marcados "depende do Maps real"; não são defeitos comprovados.

1. **Formato da URL do Maps após o clique** (`parse.ts:88-105`, `domain.ts:32`). Passos: abrir uma busca, abrir o DevTools da aba, clicar num cartão, copiar `location.href` e conferir `!1s0x…:0x…` (também no `href` do cartão). Sem id nos dois lados, o plano B exige `placeKey` diferente; conferir que o `@lat,lng` muda.
2. **Seletores de nota, categoria e horário** (`selectors.ts:26-31`). Passos: rodar 15 itens de uma busca e olhar o popup: avisos `fieldWarnings` não devem aparecer; no painel lateral conferir categoria e nota; exportar JSON e ver `horario`.
3. **Fixtures sintéticas** (`tests/fixtures/*`). Salvar `outerHTML` do feed e do painel de 3 lugares reais (com e sem site) e trocar as fixtures.
4. **Abertura do side panel** (`popup.ts:352-356`). Passos: com leads salvos, clicar em "Abrir lista de leads"; deve abrir sem erro "may only be called in response to a user gesture". Se falhar por causa do `await chrome.windows.getCurrent()`, chamar `sidePanel.open` com o `windowId` pré-lido no carregamento.
5. **Service worker encerrado** (R3, vigia de 1 minuto). Passos: `chrome://serviceworker-internals`, "Stop" durante o enriquecimento com popup fechado; esperar até 1 min; conferir `Sites: n de N` avançando e badge `…`. Conferir também se três sites lentos (>30 s sem chamada de API) encerram o worker sozinho, já que `fetch` pendente não renova o temporizador.
6. **CSV no Excel pt-BR**. Passos: exportar, abrir com duplo clique; conferir acentos (BOM), colunas por `;`, WhatsApp como texto (`+55 (12) …`), célula com `'` em nomes que começam com `+`/`-`.
7. **vCard no Google Contatos**. Importar o `.vcf` com um lead de tags e endereço; conferir `CATEGORIES`, `ADR` (rua inteira em um campo) e telefone `CELL`.
8. **Detecção de verificação** (`detectBlock`, `parse.ts:150-153`). Conferir que `iframe[src*="recaptcha"]` não existe no Maps normal (falso positivo pausaria a coleta).
9. **Diálogos** (`closedby="any"`): Esc, clique no fundo, foco devolvido ao botão no popup e no painel (Chrome < 134 usa o fallback de clique).
10. **Leitor de tela** no popup e na tabela empilhada do painel (<560 px).

## 5. O que está bom e deve ser mantido

- **Isolamento de seletores** em listas com fallback (`selectors.ts`, `queryFirst`) e avisos de campo vazio.
- **Guarda do painel obsoleto** (`isPanelForCard`) com id do Maps e plano B por URL; o tempo em pausa não conta para o timeout (`maps.ts:135-160`).
- **Gravação por lead** (`BATCH_SIZE = 1`) e fila de enriquecimento reconstruída de `status_enriquecimento`, com vigia por `chrome.alarms` ligado só enquanto há sites (`setState`, `index.ts:82-87`).
- **Takeover do content script** (`maps.ts:44-46`, `:317-319`) contra injeção dupla.
- **Painel lateral sem `innerHTML`**: tudo por `textContent`/`append`; `safeMapsUrl` ancorado e correto (testado mentalmente contra `google.com.evil.com`); `rel="noopener noreferrer"`.
- **CSV**: BOM, `;`, CRLF, escape de fórmula com espaço/tab antes, WhatsApp como texto, novas colunas só no fim (as 15 primeiras idênticas às de `c05f4f2`, conferido por `git show`).
- **Manifest enxuto**: `activeTab` e `downloads` removidos; `storage`, `unlimitedStorage`, `alarms`, `scripting`, `sidePanel` têm uso real e estão justificados no README (`README.md:94-103`); `https://*/*` é a única permissão ampla e está assumida com a nota S3. O download é por `blob` no popup/painel, então `downloads` não faz falta.
- **Build**: 4 passes limpos, versão única do `package.json` no `dist/manifest.json`, `dist/` sem arquivo sobrando, páginas sem script inline (CSP padrão do MV3 basta).
- **Retry-After** com teto de 10 s, intervalo de 1 s por domínio reservado antes de esperar (`enrich.ts:37-42`), `credentials: 'omit'`.
- **Mensagens do popup**: mensagens de erro curtas, `<dialog>` nativo, `role="status"`, foco visível, tema claro/escuro, `prefers-reduced-motion`.
- **Documentos**: decisões registradas, status por onda e lista honesta do que falta validar no navegador.

### Réguas das skills

- `chrome-extensions` (carregada e aplicada): regra 7 (estado efêmero do service worker: `pendingBatch`, `writeChain`, `enrichmentRunning` são variáveis de módulo; o impacto é limitado por `BATCH_SIZE = 1`, mas a cadeia envenenada, P1-1, vive aí); regra 2 (side panel com gatilho explícito no popup, ok); regra 12 (`activeTab` removido, ok); regra 4 (`tab.url` do Maps funciona por `host_permissions`, validar no navegador); regra 5 (uso de `.then()` em `writeChain` é estilo, mas é onde nasce o P1-1); "host_permissions escopado" (`https://*/*` é necessária para o `fetch`, ok com a nota S3).
- `modern-web-guidance` e a rubrica de `audit` do `impeccable`: **não executei a auditoria visual nem o detector**; fiz uma passada estática do HTML/CSS: `<dialog>` com `closedby` e fallback, `<search>`, `@container`, rótulos em todos os campos, `scope` em `th`, foco visível, `prefers-color-scheme`. Pontos que vi e não medi: alvos de toque de 18 px nos checkboxes (`popup.css:173`, `sidepanel.css:100`), abaixo dos 24 px do WCAG 2.2 AA (2.5.8) sem espaçamento compensador; textos de 11 a 12 px; `role="alert"` em `<ul id="warnings">`, que sobrescreve a semântica de lista. Contraste não foi medido.

## 6. Perguntas abertas

1. **"Só a busca atual" omite leads já conhecidos?** Cartões já salvos são pulados (`maps.ts:222-228`) e mantêm a `busca_origem` antiga; `selectLeadsForExport` com `current` (`csv.ts:116-119`) exporta só leads da busca mais recente. Numa busca sobreposta, o usuário recebe só os leads novos. É a intenção (RF5.4) ou o pulo deveria atualizar `busca_origem`/adicionar uma lista de buscas?
2. **Leads `pendente` de coleta cancelada ou sem enriquecimento**: devem ser visitados na próxima coleta com enriquecimento ligado, ou só os da coleta atual? (P3-15)
3. **Lista de provedores pessoais**: a decisão 4 cita gmail, hotmail, outlook, yahoo, uol, bol, terra. Autoriza `hotmail.com.br`, `outlook.com.br`, `globo.com` e afins? (P2-4)
4. **Opções de LGPD no painel lateral**: mover "Só e-mails genéricos" e "Descartar sem contato" para o painel, ou o painel passa a ler as opções do popup? (P2-9)
5. **TLDs**: preferem lista aberta (rejeitar só o lixo conhecido) ou lista fechada ampliada? (P2-3)
6. **Unidades**: para redes com várias unidades, o número da rua deve decidir sozinho entre "mesma" e "outra" unidade, mesmo quando o texto restante é igual? (P2-7)
7. **Bloqueio de IPs privados** no `fetch` dos sites: aceitar a restrição (P3-8) mesmo que quebre quem usa intranet de propósito?
8. **Meta de 5 mil leads**: o gatilho R15 (>50 ms por escrita) deve ser medido antes da v1, ou só quando houver reclamação?
