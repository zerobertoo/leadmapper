# Produto: LeadMapper

<!-- impeccable:product-schema 1 -->

## Platform

web

## O que é

Extensão de Chrome (Manifest V3) que transforma uma busca no Google Maps em uma lista de leads em CSV, JSON ou vCard. Roda 100% no navegador do usuário, sem servidor, sem conta e sem API paga.

## Para quem

Profissional de vendas, freelancer ou dono de pequena agência que prospecta empresas locais no Brasil (clínicas, escritórios, comércios, condomínios, escolas) e precisa de listas rápidas, sem aprender uma ferramenta complexa.

## Registro da interface

**Operate**: o usuário vem para concluir uma tarefa (coletar, revisar, exportar). Escaneabilidade, consistência e controles nativos valem mais que expressão visual. Superfícies: popup de 360 px (coleta e exportação) e painel lateral (lista de leads).

## Princípios

- Mensagens curtas em português do Brasil, sem jargão; erro diz o que houve e o que fazer.
- Privacidade por padrão: nada sai do navegador, exceto as visitas aos sites das empresas.
- Prioriza dados de pessoa jurídica; e-mails de aparência pessoal são marcados e podem ficar fora da exportação (LGPD).
- Honestidade sobre limites: o Maps muda, sites bloqueiam, contatos envelhecem. A interface avisa em vez de esconder.
- Acessibilidade: rótulos de texto, foco visível, teclado, contraste AA, tema claro e escuro pelo sistema.

## Anti-objetivos

Não é CRM, não envia mensagens, não pontua leads com IA, não contorna captcha nem proxy, não sincroniza na nuvem. Ver `docs/prd-extensao-leads.md` e `docs/melhorias.md` (seção v2+).

## Positioning

100% local: roda no navegador do usuário, sem servidor, sem conta e sem API paga; os dados ficam na máquina dele. Outras ferramentas de leads dependem de nuvem, cadastro ou créditos.

## Operating Context

Uso diário em Chrome (118+), na aba do Google Maps, com popup para coletar e exportar e painel lateral para revisar. Saída em CSV, JSON ou vCard, importada em planilhas ou no CRM que o usuário já tem. O enriquecimento visita os sites das empresas e pede essa permissão só ao ativar.

## Evidence on Hand

Apenas o código, `README.md`, `docs/prd-extensao-leads.md`, `docs/melhorias.md`, `docs/revisao.md` e a suíte de testes em `tests/`. Não há clientes, depoimentos, métricas de uso nem publicação na Chrome Web Store; não inventar nenhum deles.

## Brand Commitments

Nome sempre "LeadMapper". Marca e regras em `docs/branding.md` e `brand/logo.svg`.
