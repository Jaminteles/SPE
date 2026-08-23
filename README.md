# SPE — Sistema de Pesquisa Eleitoral

Coleta de pesquisa eleitoral anônima na Bahia, com apuração por município (código IBGE)
e painel de resultados.

## Estrutura

| Caminho | O que é |
|---|---|
| `apps/api` | API NestJS + Prisma + PostgreSQL |
| `apps/painel` | Painel web React + TypeScript + Vite |
| `apps/app` | Aplicativo React Native + Expo (APK direto, sem loja) |
| `infra` | Docker Compose de desenvolvimento e homologação |
| `docs` | Escopo, backlog, modelagem do banco e protótipo |

Cada aplicação tem `package.json` próprio. Convenções de branch, commit e PR em
[CONTRIBUTING.md](./CONTRIBUTING.md).

## Requisitos

Node 20 (veja `.nvmrc`), Docker e Docker Compose.

## Subir o ambiente de desenvolvimento

```bash
npm run install:all
npm run dev:up
cp apps/api/.env.example apps/api/.env
npm --prefix apps/api run prisma:deploy
npm --prefix apps/api run seed
```

Serviços: API em `http://localhost:3000/api`, Swagger em `http://localhost:3000/api/docs`,
PostgreSQL em `5432`, Redis em `6379`.

Painel: `npm --prefix apps/painel run dev` → `http://localhost:5173`.
Aplicativo: `npm --prefix apps/app start`.

## Homologação

```bash
cp infra/.env.example infra/.env   # preencher os segredos
npm run hml:up
```

## Verificação

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

## Banco de dados

`apps/api/prisma/schema.prisma` é a fonte de verdade. Índices parciais, `CHECK` e views
materializadas vão escritos à mão dentro do `migration.sql` da migration correspondente.
Modelagem documentada em [docs/modelagem-banco.md](./docs/modelagem-banco.md).

A base de municípios (417 da Bahia, código IBGE) fica em
`apps/api/prisma/data/municipios-ba.json` e é atualizada por
`npm --prefix apps/api run municipios:sync`, direto da API de localidades do IBGE.

## Privacidade

A resposta é anônima por construção: nome, CPF, telefone e e-mail do respondente não são
coletados, persistidos nem registrados em log. O controle de duplicidade usa apenas hash
irreversível do dispositivo. Detalhes em [docs/escopo-pesquisa-eleitoral.md](./docs/escopo-pesquisa-eleitoral.md).
