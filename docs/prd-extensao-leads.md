# PRD: Extensão de extração de leads

Oct 9, 2026 · @José Roberto

## Visão geral

Extensão de navegador (Chrome, Manifest V3) que transforma uma busca no Google Maps em uma lista de leads em CSV, com nome, endereço, telefone, site, e-mail e WhatsApp, sem servidor, sem banco externo e sem API paga.

**Problema:** montar listas de prospecção à mão é lento, e as soluções prontas são caras, fechadas ou entregam dados sujos. A primeira versão resolve só a etapa de montar a lista. Qualificação, pontuação e enriquecimento com IA ficam para depois.

**Solução:** a extensão roda no navegador do próprio usuário, já logado e com o IP dele. Ela lê os resultados do Maps, abre cada empresa para capturar os detalhes, visita o site de cada uma para achar e-mail e WhatsApp, deduplica e exporta.

**Contexto de uso:** uso pessoal e profissional de prospecção B2B local no Brasil (clínicas, escritórios, comércios, condomínios, escolas). O usuário digita um nicho e uma cidade no próprio Maps e aciona a extensão.

## Objetivos e fora de escopo

**Objetivos da v1**

- Gerar uma lista de 100 a 120 empresas de uma busca do Maps em menos de 15 minutos, com um clique para iniciar.
- Capturar telefone em pelo menos 80% das empresas que o exibem no Maps.
- Encontrar e-mail ou WhatsApp no site em pelo menos 40% das empresas que têm site.
- Entregar um CSV limpo: telefones normalizados, sem duplicados, abrindo direto no Excel e no Google Sheets.
- Funcionar sem conta, sem backend e sem custo recorrente.

**Fora de escopo da v1**

- Qualificação, pontuação de leads e uso de LLM.
- Outras fontes (LinkedIn, Instagram, base de CNPJ). Ficam para versões futuras.
- Envio de mensagens, e-mail marketing ou integração com CRM.
- Sincronização na nuvem, login e multiusuário.
- Publicação na Chrome Web Store (a v1 roda carregada como extensão descompactada).
- Suporte a Firefox e Safari.

## Usuário e fluxos de uso

**Usuário principal:** profissional de vendas, freelancer ou dono de pequena agência que prospecta empresas locais e precisa de listas rápidas, sem aprender uma ferramenta complexa.

**Fluxo principal**

1. O usuário abre o Google Maps e pesquisa, por exemplo, "clínica odontológica em Taubaté".
2. Abre o popup da extensão e clica em "Iniciar coleta".
3. A extensão rola a lista de resultados até o fim, coletando os cartões visíveis.
4. Para cada empresa, abre o painel de detalhes e captura telefone, site e demais campos.
5. Em segundo plano, visita o site de cada empresa e extrai e-mails e links de WhatsApp.
6. O popup mostra o progresso em tempo real e permite pausar, retomar ou cancelar.
7. Ao terminar, o usuário clica em "Exportar CSV" e baixa o arquivo.

**Fluxos secundários**

- Acumular várias buscas na mesma lista (por bairro ou variação de termo), com deduplicação automática entre elas.
- Limpar a lista e começar uma nova coleta.
- Retomar uma coleta interrompida (fechamento da aba ou do navegador) a partir do que já foi salvo.

## Requisitos funcionais

**RF1. Coleta no Google Maps (content script)**

- RF1.1: ativar apenas em páginas `google.com/maps*` e detectar quando há uma lista de resultados de busca.
- RF1.2: rolar o painel de resultados automaticamente, com pausa aleatória entre 800 ms e 2 s, até o Maps indicar o fim da lista ou até três rolagens seguidas sem novos itens.
- RF1.3: para cada resultado, clicar no cartão, aguardar o painel de detalhes carregar (timeout de 8 s) e extrair: nome, categoria, nota, número de avaliações, endereço, telefone, site e URL do Maps.
- RF1.4: tolerar campos ausentes sem interromper a coleta; o campo fica vazio.
- RF1.5: ao falhar em um item, registrar o erro, seguir para o próximo e contar as falhas no resumo final.
- RF1.6: manter todos os seletores do DOM do Maps isolados em um único arquivo (`selectors.ts`), para facilitar ajuste quando o Google mudar o HTML.

**RF2. Enriquecimento pelo site (service worker)**

- RF2.1: para cada empresa com site, buscar a home e até 3 páginas de contato (caminhos como `/contato`, `/fale-conosco`, `/contact`, `/sobre`), com `fetch` a partir do service worker.
- RF2.2: extrair e-mails de links `mailto:` e de texto da página por regex, descartando falsos positivos (imagens como `foto@2x.png`, domínios de exemplo, e-mails de provedores de hospedagem ou de terceiros).
- RF2.3: extrair links de WhatsApp (`wa.me`, `api.whatsapp.com/send`, `web.whatsapp.com/send`) e normalizar para número em formato internacional.
- RF2.4: processar no máximo 3 sites em paralelo, com timeout de 10 s por requisição e uma nova tentativa em caso de falha de rede.
- RF2.5: ignorar sites que são perfis de rede social (instagram.com, facebook.com, linktr.ee) para fins de extração de e-mail, mas guardar a URL no campo `redes_sociais`.
- RF2.6: respeitar um intervalo mínimo de 1 s entre requisições ao mesmo domínio.

**RF3. Limpeza e deduplicação**

- RF3.1: normalizar telefone para o formato `+55DDDNÚMERO` apenas com dígitos, e guardar também a versão formatada para leitura.
- RF3.2: deduplicar por telefone normalizado; na falta de telefone, por domínio do site; na falta dos dois, por nome normalizado somado ao endereço.
- RF3.3: ao encontrar duplicado, manter o registro mais completo e mesclar campos vazios.
- RF3.4: marcar telefones que parecem celular (9 dígitos após o DDD começando com 9) para facilitar o uso com WhatsApp.
- RF3.5: opção no popup para descartar registros sem nenhum meio de contato (sem telefone, e-mail e WhatsApp).

**RF4. Armazenamento**

- RF4.1: persistir tudo em `chrome.storage.local` (com a permissão `unlimitedStorage`), salvando cada registro assim que é coletado, para suportar retomada sem perda (decisão de 2026-10-10; antes, lotes de 10).
- RF4.2: guardar para cada lead a busca de origem, a data da coleta e a fonte de cada dado (Maps ou site).
- RF4.3: botão para limpar toda a lista, com confirmação.

**RF5. Exportação**

- RF5.1: gerar CSV em UTF-8 com BOM, separador ponto e vírgula (padrão do Excel em português do Brasil), com cabeçalho em português.
- RF5.2: escapar corretamente aspas, quebras de linha e o caractere separador.
- RF5.3: nome do arquivo `leads_AAAA-MM-DD_HHMM.csv`, baixado via `chrome.downloads` ou link `blob`.
- RF5.4: exportar a lista inteira ou apenas os registros da busca atual, à escolha do usuário.

**RF6. Controle da coleta**

- RF6.1: iniciar, pausar, retomar e cancelar a qualquer momento.
- RF6.2: exibir progresso: itens encontrados, itens processados, sites visitados, e-mails achados, erros.
- RF6.3: configurar limite máximo de empresas por coleta (padrão 120) e velocidade (lenta, normal, rápida), que ajusta as pausas entre ações.

## Arquitetura técnica

**Stack:** TypeScript, Manifest V3, build com Vite ou esbuild, sem framework de UI (HTML, CSS e TypeScript puros no popup). Nenhuma dependência de runtime além de, se necessário, uma biblioteca pequena para parse de HTML. Sem backend.

**Permissões do manifest**

- `permissions`: `storage`, `unlimitedStorage`, `alarms`, `scripting`, `sidePanel` (`downloads` e `activeTab` foram removidas por não terem uso).
- `host_permissions`: `https://www.google.com/maps/*` e `https://*/*` (necessário para o `fetch` aos sites das empresas sem bloqueio de CORS).
- Justificar cada permissão no README, já pensando em uma futura publicação.

**Componentes e responsabilidades**

- **Content script** (`content/maps.ts`): roda no Maps, rola a lista, clica nos cartões, extrai os campos e envia cada registro ao service worker por `chrome.runtime.sendMessage`.
- **Service worker** (`background/index.ts`): orquestra a coleta, guarda o estado (rodando, pausado, cancelado), persiste os registros, executa o enriquecimento pelos sites com fila e limite de concorrência, e responde ao popup.
- **Popup** (`popup/`): mostra o estado, o progresso e os botões; lê o estado do service worker e escuta atualizações.
- **Módulos compartilhados** (`shared/`): tipos, normalização de telefone, deduplicação, extração de e-mail e WhatsApp, geração de CSV.

**Fluxo de mensagens**

1. Popup envia `START` ao service worker com as configurações.
2. Service worker repassa `START` ao content script da aba ativa do Maps.
3. Content script envia `LEAD_FOUND` para cada empresa extraída.
4. Service worker deduplica, salva e, se houver site, enfileira o enriquecimento.
5. Ao concluir cada site, o service worker atualiza o registro e emite `PROGRESS` ao popup.
6. Content script envia `DONE` ao fim da lista; o service worker finaliza quando a fila de sites esvaziar.
7. `PAUSE`, `RESUME` e `CANCEL` seguem o caminho inverso, do popup até o content script.

**Atenção ao ciclo de vida do service worker MV3:** ele pode ser encerrado por inatividade. Todo estado necessário para retomar deve estar em `chrome.storage`, e a fila de enriquecimento deve ser reconstruível a partir dos registros que ainda não foram enriquecidos (campo `status_enriquecimento`).

**Estrutura de pastas sugerida**

```text
leadmapper/
  manifest.json
  package.json
  tsconfig.json
  vite.config.ts
  src/
    content/
      maps.ts
      selectors.ts
    background/
      index.ts
      queue.ts
      enrich.ts
    popup/
      popup.html
      popup.ts
      popup.css
    shared/
      types.ts
      phone.ts
      dedupe.ts
      extract.ts
      csv.ts
      storage.ts
  tests/
    phone.test.ts
    dedupe.test.ts
    extract.test.ts
    csv.test.ts
  README.md
```

## Modelo de dados e CSV

Cada lead é um objeto `Lead` salvo em `chrome.storage.local`, indexado por um `id` interno gerado na coleta.

| Campo | Tipo | Origem | Observação |
| --- | --- | --- | --- |
| id | string | interno | UUID gerado na coleta |
| nome | string | Maps | Obrigatório |
| categoria | string | Maps | Ex.: Dentista |
| nota | number | Maps | Opcional |
| avaliacoes | number | Maps | Opcional |
| endereco | string | Maps | Texto completo |
| telefone | string | Maps | Formato original exibido |
| telefone\_e164 | string | derivado | `+55DDDNÚMERO`, chave de deduplicação |
| eh\_celular | boolean | derivado | Heurística do 9 inicial |
| site | string | Maps | URL completa |
| dominio | string | derivado | Host sem `www` |
| emails | string\[\] | site | Lista, sem duplicados |
| whatsapp | string\[\] | site ou derivado | Formato internacional |
| redes\_sociais | string\[\] | Maps ou site | URLs de Instagram, Facebook, etc. |
| url\_maps | string | Maps | Link do cartão no Maps |
| busca\_origem | string | interno | Texto da busca que gerou o lead |
| coletado\_em | string | interno | Data e hora ISO 8601 |
| status\_enriquecimento | enum | interno | `pendente`, `ok`, `sem_site`, `erro` |

**Colunas do CSV (nesta ordem, cabeçalho em português):** Nome, Categoria, Telefone, Celular (sim ou não), WhatsApp, E-mail, Site, Endereço, Nota, Avaliações, Instagram, Facebook, Busca de origem, Link do Maps, Data da coleta. Colunas novas entram sempre no fim (hoje: Tipo de e-mail, Status, Tags, Horário e Outras redes).

Campos com várias entradas (e-mails, WhatsApp) saem em uma única célula, separados por vírgula e espaço.

Exemplo de linha:

```csv
Nome;Categoria;Telefone;Celular;WhatsApp;E-mail;Site;Endereço;Nota;Avaliações;Instagram;Facebook;Busca de origem;Link do Maps;Data da coleta
Clínica Sorriso;Dentista;(12) 3631-0000;não;;contato@clinicasorriso.com.br;https://clinicasorriso.com.br;Rua Exemplo 100, Taubaté, SP;4,8;132;;;clínica odontológica em Taubaté;https://maps.google.com/?cid=000;2026-10-09 22:50
```

## UX do popup

Popup simples, com 360 px de largura, em português do Brasil, sem tela de configuração separada. Visual limpo, claro e escuro seguindo o tema do sistema.

**Estados do popup**

| Estado | O que aparece | Botões ativos |
| --- | --- | --- |
| Fora do Maps | Aviso: "Abra uma busca no Google Maps para começar" | Nenhum |
| Pronto | Resumo da lista atual (total de leads) e opções de coleta | Iniciar coleta, Exportar CSV, Limpar lista |
| Coletando | Barra de progresso e contadores ao vivo | Pausar, Cancelar |
| Pausado | Mesmos contadores, estado destacado | Retomar, Cancelar |
| Concluído | Resumo: total coletado, duplicados removidos, falhas | Exportar CSV, Nova coleta |
| Erro | Mensagem clara do que falhou e o que fazer | Tentar de novo |

**Elementos da tela principal**

- Campo de limite de empresas por coleta (padrão 120).
- Seletor de velocidade: lenta, normal, rápida.
- Caixa para ligar ou desligar a busca de e-mail e WhatsApp nos sites.
- Caixa para descartar leads sem nenhum contato.
- Contadores: encontrados, processados, com telefone, com e-mail, com WhatsApp, erros.

**Mensagens e tom:** curtas, diretas e sem jargão. Erros dizem o que aconteceu e qual o próximo passo (por exemplo, "O Google mudou a página do Maps; atualize a extensão ou tente de novo").

**Acessibilidade:** botões com rótulos de texto, foco visível, navegação por teclado e contraste mínimo AA.

## Requisitos não funcionais, riscos e conformidade

**Requisitos não funcionais**

- **Privacidade:** todos os dados ficam no navegador do usuário. Nenhuma telemetria, nenhum envio a servidores próprios ou de terceiros, além das requisições aos sites das empresas.
- **Desempenho:** a coleta não deve travar a aba do Maps; usar `await` com pausas e evitar laços síncronos longos.
- **Resiliência:** retomar a coleta após fechamento da aba, reinício do navegador ou encerramento do service worker, sem perder registros já salvos.
- **Manutenibilidade:** seletores do Maps isolados, funções de extração e normalização puras e com testes unitários.
- **Compatibilidade:** Chrome atual e navegadores baseados em Chromium (Edge, Brave).
- **Idioma:** interface e CSV em português do Brasil; o Maps pode estar em outro idioma, então os seletores devem preferir atributos estáveis (`aria-label`, `data-item-id`) a textos fixos.

**Riscos e mitigações**

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| O Google muda o HTML do Maps | Coleta para de funcionar | Seletores isolados em um arquivo, mensagem de erro clara, testes manuais a cada ajuste |
| Bloqueio ou captcha por excesso de ações | Coleta interrompida | Pausas aleatórias, limite padrão de 120 por coleta, modo de velocidade lenta |
| O Maps limita a lista a cerca de 120 resultados por busca | Cobertura parcial de cidades grandes | Permitir acumular várias buscas (por bairro ou termo) com deduplicação entre elas |
| Sites bloqueiam o `fetch` ou exigem JavaScript | E-mail não encontrado | Registrar `erro` ou `sem_email`, sem tentar contornar bloqueios |
| Service worker encerrado no meio da coleta | Perda de progresso | Salvar cada lead na hora e reconstruir a fila a partir dos registros pendentes |
| E-mails e telefones desatualizados | Lista com contatos mortos | Guardar data e fonte de cada dado, sem prometer validação na v1 |

**Termos de uso e LGPD**

- O Google Maps proíbe coleta automatizada nos termos de uso. A v1 é uma ferramenta de uso pessoal, que age no ritmo de um usuário humano e na sessão dele. Esse risco deve ficar registrado no README e na descrição da extensão, e não é recomendável distribuir a ferramenta em larga escala sem avaliação jurídica.
- Priorizar dados de pessoa jurídica (telefone comercial, e-mails genéricos como contato@). Evitar coletar e-mails pessoais de pessoas físicas identificadas.
- Guardar a origem e a data de cada dado, para atender a pedidos de titulares.
- Não contornar captchas, não usar proxies para esconder a origem e não fazer coleta em ritmo que um humano não faria.

## Critérios de aceite e entrega por fases

**Entrega por fases (cada fase deve funcionar sozinha antes de passar à próxima)**

1. **Fase 1, esqueleto:** projeto com Vite e TypeScript, `manifest.json` válido, popup abrindo, content script injetado no Maps, troca de mensagens entre popup, service worker e content script funcionando.
2. **Fase 2, coleta do Maps:** rolagem da lista, abertura de cada cartão, extração dos campos, salvamento de cada lead na hora, botões de pausar, retomar e cancelar.
3. **Fase 3, limpeza e exportação:** normalização de telefone, deduplicação, geração do CSV e download. Neste ponto a ferramenta já é útil sozinha.
4. **Fase 4, enriquecimento pelos sites:** fila com concorrência limitada, extração de e-mail e WhatsApp, atualização dos registros e do progresso.
5. **Fase 5, acabamento:** estados e mensagens de erro, configurações de velocidade e limite, retomada após interrupção, README com instalação e avisos.

**Critérios de aceite**

- [ ] A extensão carrega como descompactada no Chrome sem erros no `chrome://extensions`.
- [ ] Em uma busca real (ex.: "clínica odontológica em Taubaté"), a coleta traz ao menos 80 empresas com nome e endereço e termina sem travar.
- [ ] Pelo menos 80% das empresas que exibem telefone no Maps têm o telefone capturado.
- [ ] Telefones saem normalizados e nenhum lead aparece duplicado após duas buscas sobrepostas.
- [ ] Para empresas com site, e-mail ou WhatsApp é encontrado em pelo menos 40% dos casos.
- [ ] Fechar a aba no meio da coleta e reabrir permite retomar sem perder os registros já salvos.
- [ ] O CSV abre corretamente no Excel e no Google Sheets, com acentos preservados e colunas separadas.
- [ ] Pausar interrompe as ações em até 3 segundos; cancelar mantém os registros já coletados.
- [ ] Funções de telefone, deduplicação, extração e CSV têm testes unitários passando.
- [ ] Nenhum dado sai do navegador, exceto as requisições aos sites das empresas.
- [ ] O README explica instalação, uso, limitações e o aviso sobre termos de uso e LGPD.

**Instruções para o Claude Code**

- Seguir as fases na ordem e parar ao fim de cada uma para eu testar no navegador.
- Fazer commits pequenos por fase, com mensagens claras.
- Em caso de dúvida sobre seletores do Maps, escrever o código para falhar de forma amigável e deixar o ajuste em `selectors.ts`.
- Não adicionar funcionalidades fora do escopo da v1 sem perguntar.
