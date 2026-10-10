# LeadMapper

Extensão de Chrome (Manifest V3) que transforma uma busca no Google Maps em uma lista de leads em CSV: nome, categoria, telefone, WhatsApp, e-mail, site, endereço, nota e redes sociais. Roda inteira no seu navegador, sem servidor, sem conta e sem API paga.

> O nome do produto é provisório. A v1 roda como extensão descompactada e não está publicada na Chrome Web Store.

## ⚠️ Avisos importantes

**Termos de uso do Google.** Os termos do Google Maps proíbem a coleta automatizada de dados. Esta ferramenta é de **uso pessoal**: ela age na sua sessão, no seu navegador e em ritmo parecido com o de uma pessoa (pausas aleatórias, limite padrão de 120 empresas por coleta). Você é responsável pelo uso. Não é recomendável distribuí-la em larga escala sem avaliação jurídica.

**LGPD.**

- Priorize dados de pessoa jurídica (telefone comercial, e-mails genéricos como `contato@`). Evite coletar e-mails pessoais de pessoas físicas identificadas.
- Cada lead guarda a busca de origem e a data da coleta (colunas "Busca de origem" e "Data da coleta" do CSV), para atender pedidos de titulares.
- Telefones e e-mails podem estar desatualizados. A v1 não valida os contatos.
- Se for abordar os contatos, respeite a LGPD e as regras de cada canal (e-mail, WhatsApp, telefone).

**O que a extensão não faz:** não contorna captcha, não usa proxy e não coleta em ritmo que uma pessoa não faria. Se o Google pedir verificação, resolva-a você mesmo e tente de novo mais tarde.

## Instalação

Requisitos: Node.js 20+ e Chrome (ou Edge/Brave).

```bash
npm install
npm run build
```

1. Abra `chrome://extensions`.
2. Ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha a pasta `dist/`.

Depois de qualquer alteração no código, rode `npm run build` e clique em recarregar na extensão (e recarregue a aba do Maps).

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

### Várias buscas na mesma lista

Faça uma busca por bairro ou variação de termo e inicie outra coleta: os leads se somam à lista e os duplicados são mesclados automaticamente (por telefone, depois por domínio do site, depois por nome e endereço). Empresas já salvas são puladas, sem abrir o cartão de novo.

### Retomar uma coleta interrompida

Se a aba ou o navegador fechou no meio, os leads já salvos continuam na lista. Refaça a mesma busca e clique em **Iniciar coleta**: as empresas já salvas são puladas e a coleta segue do ponto em que parou. Sites que ficaram pendentes continuam sendo visitados.

### O CSV

UTF-8 com BOM, separador `;`, cabeçalho em português, pronto para o Excel e para o Google Sheets. Colunas: Nome, Categoria, Telefone, Celular, WhatsApp, E-mail, Site, Endereço, Nota, Avaliações, Instagram, Facebook, Busca de origem, Link do Maps, Data da coleta. Telefones e WhatsApp saem normalizados (`+55DDDNÚMERO` internamente; legível no CSV).

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
| `storage` e `unlimitedStorage` | Guardar a lista de leads, o progresso e as opções no navegador, em lotes, para permitir retomada. Listas grandes podem passar da cota padrão. |
| `scripting` | Injetar o script de coleta na aba do Maps que já estava aberta antes da extensão ser instalada ou recarregada. |
| `activeTab` | Reservada para o acesso à aba ativa a partir do popup. Hoje o acesso à aba do Maps já vem das permissões de host. |
| `downloads` | Reservada para exportação. A v1 baixa o CSV por um link `blob` criado no popup. |
| `https://www.google.com/maps/*` e `https://www.google.com.br/maps/*` | Rodar o script de coleta nas páginas do Maps. |
| `https://*/*` e `http://*/*` | Permitir que o service worker faça `fetch` aos sites das empresas sem bloqueio de CORS. Sem isso não há e-mail nem WhatsApp. Sites antigos ainda usam `http://`. |

> Antes de uma eventual publicação na Chrome Web Store, vale remover `activeTab` e `downloads` (hoje sem uso) e reavaliar o `https://*/*`, que é uma permissão ampla.

## Privacidade

Todos os dados ficam no navegador. Não há telemetria nem envio a servidores próprios ou de terceiros. As únicas requisições de rede feitas pela extensão são as que visitam os sites das empresas.

## Desenvolvimento

```bash
npm run build      # gera dist/ (service worker, content script e popup)
npm run typecheck  # tsc --noEmit
npm test           # testes unitários (Vitest)
```

Estrutura:

```text
manifest.json
vite.config.ts            build por entrypoint (variável ENTRY)
src/
  content/
    maps.ts               rola a lista, abre os cartões e extrai os campos
    selectors.ts          todos os seletores do Maps
  background/
    index.ts              orquestra a coleta, persiste e dispara o enriquecimento
    queue.ts              fila com limite de concorrência
    enrich.ts             visita os sites e extrai contatos
  popup/                  interface (HTML, CSS e TypeScript puros)
  shared/
    types.ts              tipos, mensagens e chaves de storage
    phone.ts              normalização de telefone
    dedupe.ts             deduplicação e mesclagem
    extract.ts            e-mail, WhatsApp, redes sociais e páginas de contato
    csv.ts                geração do CSV e filtros de exportação
    domain.ts             domínio, redes sociais e identificador da empresa
    storage.ts            leitura e escrita em chrome.storage.local
tests/                    testes unitários das funções puras
```

Como o service worker do MV3 pode ser encerrado a qualquer momento, todo estado necessário para retomar fica em `chrome.storage.local`, e a fila de sites é reconstruída a partir dos leads com `status_enriquecimento: pendente`. Leads ainda no buffer de gravação (no máximo 9) podem se perder se o service worker for encerrado antes do próximo lote.
