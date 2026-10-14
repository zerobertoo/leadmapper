# LeadMapper

[![Apresentação do LeadMapper: da busca no Maps ao CSV (vídeo de 30 s)](docs/media/apresentacao.jpg)](docs/media/apresentacao.mp4)

*Apresentação em vídeo (30 s). Clique na imagem para assistir.*

Extensão de Chrome (Manifest V3) que transforma uma busca no Google Maps em uma lista de leads em CSV: nome, categoria, telefone, WhatsApp, e-mail, site, endereço, nota e redes sociais. Roda inteira no seu navegador, sem servidor, sem conta e sem API paga.

> A extensão roda descompactada e não está publicada na Chrome Web Store.

## ⚠️ Avisos importantes

**Termos de uso do Google.** Os termos do Google Maps proíbem a coleta automatizada de dados. Esta ferramenta é de **uso pessoal**: ela age na sua sessão, no seu navegador e em ritmo parecido com o de uma pessoa (pausas aleatórias, limite padrão de 120 empresas por coleta). Você é responsável pelo uso. Não é recomendável distribuí-la em larga escala sem avaliação jurídica.

**LGPD.**

- Priorize dados de pessoa jurídica (telefone comercial, e-mails genéricos como `contato@`). Evite coletar e-mails pessoais de pessoas físicas identificadas.
- Cada lead guarda a busca de origem e a data da coleta (colunas "Busca de origem" e "Data da coleta" do CSV), para atender pedidos de titulares.
- Telefones e e-mails podem estar desatualizados. A v1 não valida os contatos.
- Se for abordar os contatos, respeite a LGPD e as regras de cada canal (e-mail, WhatsApp, telefone).

**O que a extensão não faz:** não contorna captcha, não usa proxy e não coleta em ritmo que uma pessoa não faria. Se o Google pedir verificação, resolva-a você mesmo e tente de novo mais tarde.

## Instalação

[![Como instalar o LeadMapper, passo a passo (vídeo de 42 s)](docs/media/instalacao.jpg)](docs/media/instalacao.mp4)

*Instalação em vídeo (42 s). Clique na imagem para assistir.*

### Pelo .zip da release (sem precisar de Node)

1. Baixe o `leadmapper.zip` mais recente na aba **Releases** do repositório e descompacte em uma pasta fixa (o Chrome lê a extensão dessa pasta, então não a apague).
2. Abra `chrome://extensions` e ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha a pasta descompactada.

Para atualizar, substitua os arquivos da pasta pelos da nova versão e clique em recarregar na extensão. O aviso de "extensões do modo desenvolvedor" ao abrir o Chrome é esperado para extensões fora da loja.

### Pelo código-fonte

Requisitos: Node.js 22+ (o CI usa o 24) e Chrome (ou Edge/Brave).

```bash
npm install
npm run build
```

1. Abra `chrome://extensions`.
2. Ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha a pasta `dist/`.

Depois de qualquer alteração no código, rode `npm run build` e clique em recarregar na extensão (e recarregue a aba do Maps).

## Idioma

A interface segue o idioma do navegador: português do Brasil quando ele está em `pt-*` e inglês nos demais. Não há seletor manual. Em inglês, o CSV usa cabeçalhos em inglês, vírgula como separador e ponto decimal.

Limites da versão atual:

- A normalização de telefone e o cálculo de WhatsApp são só para números brasileiros (+55 e DDD).
- A coleta com o Google Maps em inglês usa seletores estáveis (`data-item-id`) e tem fallbacks para textos em inglês, mas ainda não foi validada no Maps real nesse idioma.

Para adicionar ou ajustar textos, edite `src/shared/i18n/pt.ts` e `src/shared/i18n/en.ts`; o teste `tests/i18n.test.ts` garante que os dois têm as mesmas chaves.

## Como usar

1. Abra o Google Maps e pesquise, por exemplo, "clínica odontológica em Taubaté". Espere a lista de resultados aparecer.
2. Abra o popup da extensão, ajuste as opções e clique em **Iniciar coleta**.
3. Acompanhe os contadores. Você pode **Pausar**, **Retomar** ou **Cancelar** a qualquer momento (cancelar mantém o que já foi coletado).
4. Ao terminar, clique em **Exportar CSV**.

### Opções

| Opção | O que faz |
| --- | --- |
| Máximo de empresas por coleta | Limite de 1 a 500 (padrão 120). O Maps costuma mostrar cerca de 120 resultados por busca. |
| Velocidade | Lenta, normal ou rápida: ajusta as pausas entre ações. Use "lenta" se o Google reclamar. |
| Buscar e-mail e WhatsApp nos sites | Visita o site de cada empresa. Desligue para uma coleta só do Maps. |
| Exportar: toda a lista / só a busca atual | Exporta tudo o que está salvo ou só os leads da busca mais recente. |
| Descartar leads sem nenhum contato | Na exportação, omite quem não tem telefone, e-mail nem WhatsApp. Não apaga nada. |
| Só e-mails genéricos | Na exportação, tira os e-mails com cara de pessoa (`joao.silva@`) e mantém `contato@`, `vendas@` etc. O lead continua no arquivo. |

### Várias buscas na mesma lista

Faça uma busca por bairro ou variação de termo e inicie outra coleta: os leads se somam à lista e os duplicados são mesclados automaticamente (por telefone, depois por domínio do site, depois por nome e endereço). Empresas já salvas são puladas, sem abrir o cartão de novo.

### Retomar uma coleta interrompida

Se a aba ou o navegador fechou no meio, os leads já salvos continuam na lista. Refaça a mesma busca e clique em **Iniciar coleta**: as empresas já salvas são puladas e a coleta segue do ponto em que parou. Sites que ficaram pendentes continuam sendo visitados.

### O CSV

UTF-8 com BOM, separador `;`, cabeçalho em português, pronto para o Excel e para o Google Sheets. Colunas: Nome, Categoria, Telefone, Celular, WhatsApp, E-mail, Site, Endereço, Nota, Avaliações, Instagram, Facebook, Busca de origem, Link do Maps, Data da coleta e, no fim, Tipo de e-mail (genérico ou pessoal, por e-mail), Status, Tags, Horário (quando o Maps mostra) e Outras redes (LinkedIn da empresa, YouTube, TikTok). Telefones e WhatsApp saem normalizados (`+55DDDNÚMERO` internamente; no CSV, `+55 (12) 99168-9416`). A coluna Site fica vazia quando o site do Maps é uma rede social ou um link de WhatsApp. E-mails de outro domínio (agência, modelo de formulário) são descartados; ficam os do domínio da empresa e de provedores pessoais (Gmail, Hotmail etc.).

### Lista de leads (painel lateral)

Com ao menos um lead salvo, o popup mostra **Abrir lista de leads**. O painel lateral permite:

- buscar por nome, categoria, endereço, telefone, e-mail e tag (sem diferenciar acentos);
- filtrar por busca de origem, por status e só com contato, e ordenar por data, nome, nota ou avaliações;
- marcar o status do contato (Novo, Contatado, Sem interesse, Cliente) e escrever tags, um lead por vez ou em lote;
- remover leads selecionados (com confirmação);
- exportar o que está filtrado, ou só a seleção, em **CSV**, **JSON** (todos os campos, inclusive fonte e data de cada dado) ou **vCard** (importa no Google Contatos e no Outlook).

### Acompanhar e diagnosticar

- **Ícone da extensão:** mostra a quantidade processada durante a coleta, `…` ao visitar sites, `||` pausado, `OK` ao concluir e `!` em erro. O popup pode ficar fechado.
- **Aviso de campo vazio:** se categoria, endereço ou nota vierem vazios em 80% ou mais dos itens (a partir de 10), o popup avisa que o Maps pode ter mudado.
- **Verificação do Google:** se o Maps pedir captcha ou consentimento, a coleta para com uma mensagem. Resolva na aba e inicie de novo.
- **Diagnóstico:** o botão "Copiar diagnóstico" copia versão, estado, contadores e um log técnico local (últimos 200 eventos), sem dados dos leads.

## Limitações

- **Seletores do Maps.** O Google muda o HTML do Maps de tempos em tempos. Se a coleta falhar com a mensagem "O Google mudou a página do Maps", ajuste os seletores em `src/content/selectors.ts`, que é o único lugar com seletores do Maps.
- **Sites que exigem JavaScript ou bloqueiam o `fetch`** ficam sem e-mail ou com status `erro`. Não há tentativa de contornar bloqueios.
- **E-mails ofuscados** (por exemplo, proteção de e-mail do Cloudflare) não são lidos.
- **Números sem DDD, 0800 e 4004** não são normalizados nem usados na deduplicação por telefone.
- **O Maps limita a lista** a cerca de 120 resultados por busca. Para cidades grandes, acumule várias buscas.
- **Só Chrome e navegadores baseados em Chromium.** Firefox e Safari não são suportados.
- **Sem validação de contatos, sem pontuação de leads e sem integração com CRM** na v1.

## Permissões do manifest

| Permissão | Para que serve |
| --- | --- |
| `storage` e `unlimitedStorage` | Guardar a lista de leads, o progresso e as opções no navegador, um lead por vez, para permitir retomada. Listas grandes podem passar da cota padrão. |
| `sidePanel` | Abrir a lista de leads no painel lateral do navegador. |
| `scripting` | Injetar o script de coleta na aba do Maps que já estava aberta antes da extensão ser instalada ou recarregada. |
| `alarms` | Acordar o service worker a cada minuto **só enquanto há sites a visitar**, para retomar a fila se ele tiver sido encerrado com o popup fechado. |
| `https://www.google.com/maps/*` e `https://www.google.com.br/maps/*` | Rodar o script de coleta nas páginas do Maps. |
| `https://*/*` e `http://*/*` (opcionais) | Pedidas só quando você ativa "Buscar e-mail e WhatsApp nos sites": permitem que o service worker faça `fetch` aos sites das empresas sem bloqueio de CORS. Sem elas a coleta roda só com os dados do Maps. Sites antigos ainda usam `http://`. |

## Privacidade

Todos os dados ficam no navegador. Não há telemetria nem envio a servidores próprios ou de terceiros. As únicas requisições de rede feitas pela extensão são as que visitam os sites das empresas.

## Desenvolvimento

```bash
npm run build      # gera dist/ (service worker, content script e popup)
npm run typecheck  # tsc --noEmit
npm test           # testes unitários (Vitest)
npm run lint       # Biome (regras de correção; sem formatador)
```

Estrutura:

```text
manifest.json
vite.config.ts            build por entrypoint (variável ENTRY)
src/
  content/
    maps.ts               rola a lista, abre os cartões e extrai os campos
    selectors.ts          todos os seletores do Maps (lista com fallbacks)
    parse.ts              extração do painel e conferência da empresa (funções puras, testadas com fixtures)
  background/
    index.ts              orquestra a coleta, persiste e dispara o enriquecimento
    queue.ts              fila com limite de concorrência
    enrich.ts             visita os sites e extrai contatos
  popup/                  coleta, progresso e exportação (HTML, CSS e TypeScript puros)
  sidepanel/              lista de leads: busca, filtros, status, tags, remoção e exportação
  shared/
    types.ts              tipos, mensagens e chaves de storage
    phone.ts              normalização de telefone
    dedupe.ts             deduplicação e mesclagem
    extract.ts            e-mail, WhatsApp, redes sociais e páginas de contato
    csv.ts                geração do CSV e filtros de exportação
    domain.ts             domínio, redes sociais e identificador da empresa
    storage.ts            leitura e escrita em chrome.storage.local
    diagnostic.ts         log de diagnóstico local (anel de 200 eventos)
    leadList.ts           filtros, ordenação e buscas da lista de leads
    export.ts             JSON e vCard
    eta.ts                tempo estimado restante
tests/                    testes unitários das funções puras
```

Como o service worker do MV3 pode ser encerrado a qualquer momento, todo estado necessário para retomar fica em `chrome.storage.local`, e a fila de sites é reconstruída a partir dos leads com `status_enriquecimento: pendente`. Cada lead é gravado assim que é coletado; um alarme (`alarms`) retoma a fila de sites se o service worker for encerrado no meio do enriquecimento.
