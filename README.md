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
ADMIN_NOME="Nome Sobrenome" ADMIN_EMAIL=admin@exemplo.br ADMIN_SENHA="..." npm --prefix apps/api run criar-admin
```

Serviços: API em `http://localhost:3000/api/v1`, Swagger em `http://localhost:3000/api/docs`,
PostgreSQL em `5432`, Redis em `6379`.

Painel: `npm --prefix apps/painel run dev` → `http://localhost:5173`.
Aplicativo: `npm --prefix apps/app start`.

## Homologação

```bash
cp infra/.env.example infra/.env      # preencher os segredos
./infra/scripts/gerar-certificado-dev.sh   # ou instalar o certificado da AC
npm run hml:up
```

O nginx é o único serviço publicado: termina o TLS em 443 e leva `/api` para a API e o
resto para o painel. Detalhes em [docs/autenticacao-e-acesso.md](./docs/autenticacao-e-acesso.md).

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

## Acesso

Dois perfis autenticados: Administrador e Analista. O respondente não tem conta. Toda rota
nasce protegida — rota pública exige `@Publico()` explícito. Modelo completo em
[docs/autenticacao-e-acesso.md](./docs/autenticacao-e-acesso.md).

## Formulários

Montagem do formulário, cinco tipos de pergunta, ordenação e a trava de imutabilidade
depois da publicação: [docs/formularios.md](./docs/formularios.md).

## Coleta

Fluxo do respondente (consentimento, município por código IBGE, preenchimento parcial em
SQLite, reenvio automático): [docs/coleta.md](./docs/coleta.md).

## Integridade

Duplicidade, marcação automática de suspeita, invalidação manual e a agregação
pré-calculada: [docs/integridade.md](./docs/integridade.md).

## Privacidade

A resposta é anônima por construção: nome, CPF, telefone e e-mail do respondente não são
coletados, persistidos nem registrados em log. O controle de duplicidade usa apenas hash
irreversível do dispositivo. Detalhes em [docs/escopo-pesquisa-eleitoral.md](./docs/escopo-pesquisa-eleitoral.md).
