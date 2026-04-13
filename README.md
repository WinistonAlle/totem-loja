# Catalogo Interno Gostinho Mineiro

Aplicacao React + Vite para operacao do catalogo interno da Gostinho Mineiro, com foco em uso em totem e mobile. O sistema cobre navegacao do catalogo, selecao de contexto de compra (`varejo` ou `atacado`), carrinho, checkout, emissao de pedidos no Supabase, painis administrativos e integracao assíncrona com o ERP SAIBWEB via automacao Playwright.

## Visao Geral

O projeto foi estruturado para dois fluxos principais:

- `Totem/consumidor`: o usuario escolhe o tipo de compra, informa o nome, navega pelo catalogo, fecha o pedido e o sistema grava a venda no Supabase.
- `Painel interno`: usuarios autenticados por CPF consultam catalogo, favoritos, avisos, pedidos, relatorios e areas administrativas, conforme o papel associado ao cadastro.

Principais capacidades:

- Catalogo com categorias, busca, paginação e carrinho persistido localmente.
- Tabelas de preco por canal e perfil (`cpf/cnpj`, `varejo/atacado`).
- Checkout com criacao de pedido e itens no Supabase.
- Integracao SAIBWEB por fila/webhook + automacao Playwright.
- Painel admin para produtos e pedidos.
- Dashboard com relatorios de vendas, clientes e produtos.
- PWA para instalacao e operacao em dispositivo dedicado.
- Telemetria basica de eventos e erros do app.

## Stack Tecnica

- `React 18`
- `TypeScript`
- `Vite 5`
- `React Router`
- `TanStack Query`
- `Supabase JS`
- `Tailwind CSS`
- `shadcn/ui + Radix UI`
- `styled-components`
- `Playwright`
- `Express`

## Estrutura do Projeto

```text
.
|-- api/                         # Endpoints serverless / integracoes auxiliares
|-- automation/                  # Webhook e runner da integracao SAIBWEB
|-- public/                      # Assets publicos e icones PWA
|-- scripts/                     # Scripts utilitarios e smoke tests
|-- src/
|   |-- components/              # Componentes UI e modulos de tela
|   |-- contexts/                # Contextos globais, ex.: carrinho
|   |-- data/                    # Dados auxiliares / mocks / listas fixas
|   |-- hooks/                   # Hooks customizados
|   |-- lib/                     # Clientes, eventos e servicos de baixo nivel
|   |-- pages/                   # Rotas/telas principais
|   |-- services/                # Regras de dominio, auth, pedidos
|   |-- types/                   # Tipagens
|   |-- utils/                   # Helpers de preco, sessao, storage, etc.
|-- supabase-local-complete.sql  # Schema principal e funcoes/RPCs
|-- supabase-*.sql               # Migracoes complementares
|-- vite.config.ts               # Config do Vite e PWA
```

## Rotas Principais

### Publico / Totem

- `/inicio`: tela inicial.
- `/contexto`: selecao do contexto de compra (`varejo` ou `atacado`).
- `/catalogo`: catalogo de produtos.
- `/checkout`: fechamento do pedido.
- `/login`: entrada por CPF para fluxo autenticado.
- `/cadastro`: cadastro complementar.

### Autenticado

- `/favoritos`
- `/avisos`

### Administrativo

- `/admin`: CRUD de produtos.
- `/admin/pedidos`: acompanhamento de pedidos.
- `/relatorios`: dashboard de indicadores.
- `/diagnostico`: diagnosticos do sistema.

O controle de acesso e feito por sessao local + consultas ao Supabase para resolucao de papeis.

## Como a Aplicacao Funciona

### 1. Inicio e contexto de compra

O fluxo de totem comeca em `/inicio` e direciona para `/contexto`, onde o usuario escolhe `varejo` ou `atacado`. Essa escolha gera um `pricing_context` no `localStorage`, usado em todo o fluxo de catalogo e checkout.

### 2. Catalogo e precificacao

O catalogo consulta produtos no Supabase e aplica:

- ordenacao customizada por `display_order`
- categorias
- busca textual
- regras de atacado/varejo
- precos distintos por tabela
- tratamento de produto por pacote e por peso

Tambem ha cache local temporario do catalogo para melhorar o tempo de resposta.

### 3. Carrinho e checkout

O carrinho vive em contexto React e persiste em `localStorage`. No checkout, o sistema:

- valida os itens
- recalcula preco autoritativo a partir do banco
- cria pedido no Supabase
- cria itens do pedido
- tenta enfileirar a integracao SAIBWEB

Quando a integracao externa falha, o pedido continua salvo, com status de erro da integracao para tratamento posterior.

### 4. SAIBWEB

A integracao com SAIBWEB foi separada em duas partes:

- `automation/saibweb-webhook.ts`: servidor Express que recebe webhook, monta fila em memoria e dispara o runner.
- `automation/saibweb-runner.ts`: automacao Playwright que abre o ERP, busca o pedido pendente no Supabase e replica os itens no sistema externo.

Status usados na fila:

- `PENDING`
- `PROCESSING`
- `QUEUED`
- `SYNCED`
- `ERROR`

O webhook tambem possui logica de recuperacao de pedidos presos em `PROCESSING`.

## Banco de Dados e Supabase

O projeto depende fortemente de recursos do Supabase:

- tabelas como `products`, `orders`, `order_items`, `employees`, `customers`
- RLS
- funcoes RPC
- autenticacao anonima para fluxo interno

Arquivo principal de referencia:

- `supabase-local-complete.sql`

Arquivos complementares relevantes:

- `supabase-add-is-package-column.sql`
- `supabase-update-create_order_v1-package-pricing.sql`
- `atualizar_precos_atacado_varejo_supabase.sql`

### RPCs e funcoes esperadas

Pelo codigo atual, o ambiente Supabase precisa expor pelo menos funcoes equivalentes a:

- `create_order_v1`
- `get_employee_by_cpf`
- `link_employee_to_user`
- `admin_get_employees_basic`
- `customer_orders_with_items`

Se essas funcoes nao existirem ou estiverem divergentes do schema esperado, login, pedidos, relatorios e painel admin podem quebrar.

## Variaveis de Ambiente

Crie um arquivo `.env` na raiz. Nao suba credenciais reais para versionamento.

### Frontend / Vite

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_SAIBWEB_WEBHOOK_URL=
VITE_SAIBWEB_WEBHOOK_TOKEN=
VITE_REQUIRE_ORDER_RPC=
```

### Backend / scripts Node

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SAIBWEB_URL=
SAIBWEB_USER=
SAIBWEB_PASS=
SAIBWEB_WEBHOOK_PORT=
SAIBWEB_WEBHOOK_TOKEN=
SAIBWEB_SLOWMO=
SAIBWEB_KEEP_OPEN=
SAIBWEB_PAUSE=
SAIBWEB_TYPE_DELAY=
SAIBWEB_RECOVER_PROCESSING_ON_BOOT=
SAIBWEB_PROCESSING_RECOVERY_MINUTES=
SAIBWEB_TOTEM_CUSTOMER_DOCUMENT=
SAIBWEB_CUSTOMER_NAME=
SAIBWEB_PRICE_TABLE_VAREJO=
SAIBWEB_PRICE_TABLE_ATACADO=
GOOGLE_SHEETS_SPREADSHEET_ID=
GOOGLE_SHEETS_RANGE=
```

### Observacoes

- `VITE_*` fica disponivel no frontend.
- `SUPABASE_SERVICE_ROLE_KEY` deve ficar restrita a scripts backend/automacao.
- `VITE_REQUIRE_ORDER_RPC=true` forca o uso da RPC de criacao de pedidos.
- `VITE_SAIBWEB_WEBHOOK_URL` habilita o enfileiramento automatico para o webhook da integracao.

## Requisitos

- `Node.js 20+` recomendado
- `npm`
- navegadores/ambiente compativeis com Playwright para automacao
- projeto Supabase configurado com schema e RPCs necessarias

## Instalacao

```bash
npm install
```

## Desenvolvimento

Subir o frontend local:

```bash
npm run dev
```

Servidor Vite padrao do projeto:

- host: `0.0.0.0`
- porta: `4174`

Preview de build:

```bash
npm run build
npm run preview
```

## Scripts Disponiveis

```bash
npm run dev
npm run build
npm run build:dev
npm run lint
npm run preview
npm run smoke:totem
npm run smoke:totem:success
npm run smoke:totem:webhook-fail
npm run automation:webhook
npm run automation:runner
```

### O que cada script faz

- `dev`: sobe o app em modo desenvolvimento.
- `build`: gera build de producao.
- `build:dev`: build com modo development.
- `lint`: roda ESLint.
- `preview`: sobe o build na porta `4174`.
- `smoke:totem*`: valida o fluxo do totem via Playwright com mocks de backend.
- `automation:webhook`: sobe o servidor Express que recebe webhooks para SAIBWEB.
- `automation:runner`: executa a automacao SAIBWEB manualmente.

## Smoke Test do Totem

O repositório possui um teste de fumaça realista em `scripts/smoke-totem.mjs`. Ele:

- sobe um `vite preview` local em porta separada
- mocka endpoints Supabase
- navega por `/contexto`
- escolhe canal
- adiciona item ao carrinho
- conclui checkout
- valida overlay de sucesso
- salva screenshot em `output/playwright/`

Rodar:

```bash
npm run smoke:totem
```

Cenarios:

```bash
npm run smoke:totem:success
npm run smoke:totem:webhook-fail
```

## Integracao SAIBWEB

### Webhook

Suba o servidor:

```bash
npm run automation:webhook
```

Endpoints principais:

- `GET /health`
- `POST /webhook/new-order`

O endpoint exige token via `Authorization: Bearer ...` ou header `x-webhook-token`.

### Runner manual

Para processar um pedido pendente manualmente:

```bash
npm run automation:runner
```

Para focar em um pedido especifico, use `ORDER_ID` no ambiente antes de iniciar o runner.

### Comportamento importante

- O webhook mantem fila em memoria, nao persistida.
- O runner marca pedidos no Supabase conforme o ciclo de integracao.
- Em ambiente de suporte/teste, `SAIBWEB_KEEP_OPEN=1` deixa o navegador aberto.

## Autenticacao

O login interno usa CPF e depende de RPC no Supabase. O fluxo atual:

1. valida CPF com `get_employee_by_cpf`
2. executa `signInAnonymously()`
3. vincula `employees.user_id` ao usuario autenticado via `link_employee_to_user`
4. salva sessao local do funcionario

Isso significa que a base de funcionarios e as funcoes RPC sao parte critica da aplicacao.

## PWA

O projeto usa `vite-plugin-pwa` com:

- registro automatico
- `autoUpdate`
- icones em `public/`
- `navigateFallback` para SPA

Em desenvolvimento, o service worker fica desabilitado para evitar cache quebrando o fluxo.

## Deploy

Ha indícios de uso em ambiente Vercel, inclusive com endpoint em `api/`. Antes de publicar:

- configure todas as variaveis de ambiente
- valide acesso do frontend ao Supabase
- valide o schema e RPCs no banco
- confirme acessibilidade do webhook SAIBWEB
- rode `npm run build` e pelo menos um `smoke:totem`

## Observacoes Operacionais

- O projeto possui arquivos SQL locais e alteracoes de schema fora de uma esteira formal de migracoes.
- Existem artefatos de build no repositorio (`dist/`, `dev-dist/`, `*.tsbuildinfo`), o que pede cuidado na manutencao.
- O endpoint `api/sync-employees.ts` executa `npm run sync:employees`, mas esse script nao esta presente no `package.json` atual. Se esse endpoint for usado, sera necessario adicionar o script correspondente ou ajustar a implementacao.

## Fluxo Recomendado para Subir um Ambiente Novo

1. Instale dependencias com `npm install`.
2. Crie `.env` com as variaveis obrigatorias.
3. Aplique o schema principal do Supabase usando `supabase-local-complete.sql`.
4. Aplique as migracoes SQL complementares necessarias ao ambiente.
5. Valide as RPCs usadas pelo frontend e pelo login.
6. Rode `npm run dev`.
7. Teste o fluxo `/inicio -> /contexto -> /catalogo -> /checkout`.
8. Rode `npm run smoke:totem`.
9. Se houver integracao externa, suba `npm run automation:webhook` e teste enfileiramento.

## Arquivos Mais Importantes para Manutencao

- `src/App.tsx`: bootstrap, rotas, guards, telemetria e inatividade global.
- `src/pages/Index.tsx`: catalogo principal.
- `src/pages/Checkout.tsx`: fechamento do pedido.
- `src/services/orders.ts`: criacao de pedido e fila SAIBWEB.
- `src/services/auth.ts`: login por CPF.
- `src/pages/Admin.tsx`: painel de produtos.
- `src/pages/AdminOrders.tsx`: painel de pedidos.
- `src/pages/ReportsDashboard.tsx`: relatorios.
- `src/lib/supabase.ts`: cliente Supabase.
- `automation/saibweb-webhook.ts`: fila/webhook.
- `automation/saibweb-runner.ts`: automacao Playwright.
- `supabase-local-complete.sql`: base do banco.

## Checklist de Validacao

- [ ] `.env` configurado corretamente
- [ ] Supabase com schema e RPCs esperadas
- [ ] Login por CPF funcionando
- [ ] Catalogo carregando produtos
- [ ] Carrinho recalculando preco corretamente
- [ ] Checkout criando pedido e itens
- [ ] Webhook SAIBWEB respondendo
- [ ] Runner SAIBWEB conseguindo sincronizar pedidos
- [ ] Rotas admin protegidas por papel
- [ ] Smoke test do totem passando

## Licenca / Uso

Repositório interno. Ajuste esta secao conforme a politica de distribuicao da empresa.
