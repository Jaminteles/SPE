# Contribuição — Sistema de Pesquisa Eleitoral

## Estrutura do repositório

Monorepo único, com três aplicações independentes:

| Caminho | Aplicação | Stack |
|---|---|---|
| `apps/api` | API e banco de dados | NestJS + TypeScript + Prisma + PostgreSQL |
| `apps/painel` | Painel web de resultados | React + TypeScript + Vite |
| `apps/app` | Aplicativo de coleta e administração | React Native + Expo |
| `infra` | Ambientes Docker (dev e homologação) | Docker Compose |
| `docs` | Escopo, backlog, modelagem e protótipos | — |

Cada aplicação tem o próprio `package.json`, o próprio `node_modules` e o próprio ciclo de build.
Não há workspaces do npm: o Metro (Expo) e o Vite resolvem dependências de forma diferente e
o hoisting compartilhado gera falhas difíceis de diagnosticar.

## Padrão de branches

```
main          produção. Protegida. Só recebe merge de release/* ou hotfix/*.
develop       integração. Protegida. Base de todo trabalho novo.
feature/*     desenvolvimento de item do backlog.
fix/*         correção de defeito encontrado fora de produção.
hotfix/*      correção urgente em produção. Sai de main e volta para main e develop.
release/*     estabilização de uma sprint antes do merge em main.
chore/*       tarefa de infraestrutura, dependência ou documentação.
```

### Nomenclatura

O nome da branch começa pelo ID da task no backlog, quando houver:

```
feature/S1-04-cadastro-de-formulario
fix/S2-11-duplicidade-de-dispositivo
chore/S0-02-ambiente-docker
```

Somente minúsculas, palavras separadas por hífen, sem acento e sem caractere especial.

### Fluxo

1. `git switch develop && git pull`
2. `git switch -c feature/S1-04-cadastro-de-formulario`
3. Commits pequenos, no padrão Conventional Commits.
4. Pull Request para `develop`, usando o template do repositório.
5. Merge por *squash*, com o título do PR no padrão de commit.
6. Ao fim da sprint, `release/sprint-N` → `main`, com tag `vX.Y.Z`.

## Padrão de commit

[Conventional Commits](https://www.conventionalcommits.org):

```
feat(api): cadastro de formulário
fix(app): reenvio de resposta pendente
chore(infra): ambiente de homologação em docker
docs(escopo): ajuste do item 5.2
```

Escopos usados: `api`, `app`, `painel`, `infra`, `db`, `docs`.

## Regras que valem para todo PR

- A migration nasce no `schema.prisma` e é gerada pelo Prisma. Objeto que o Prisma não modela
  (view materializada, índice parcial, trigger, função) vai escrito à mão dentro do
  `migration.sql` da própria migration.
- Nenhum dado que identifique o respondente é coletado, persistido ou registrado em log.
- Toda rota de administração ou de resultado tem *guard*. O frontend não é controle de acesso.
- Resposta nunca é excluída fisicamente: invalidar é mudar o status.
- Município sempre por código IBGE.

## Antes de abrir o PR

```
npm run lint
npm run typecheck
npm test
npm run build
```
