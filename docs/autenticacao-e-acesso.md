# Autenticação e Controle de Acesso

Sprint 1. Vale para a API, o painel e o aplicativo.

## Perfis

São três perfis autenticados. O respondente **não tem conta**.

| Perfil | Pode | Enxerga |
|---|---|---|
| `ADMINISTRADOR` | tudo da administração: usuários, formulários, integridade, encerramento, auditoria | todas as pesquisas |
| `ANALISTA` | consultar resultados agregados e exportar | todas as pesquisas |
| `PESQUISADOR` | criar e gerenciar pesquisa, ler o próprio resultado, exportar | **só as próprias** |

### Escopo por dono

O `PESQUISADOR` é o perfil de quem se cadastra sozinho. As duas listas
(`GET /formularios` e `GET /resultados/formularios`) devolvem só o que é dele, e as 32 rotas
que recebem id de formulário passam pelo `DonoDoFormularioGuard`, que compara o dono lido do
banco com a identidade do token.

Pesquisa de outro usuário responde **404, nunca 403**: dizer "existe, mas não é seu"
transformaria a rota num verificador de existência de pesquisa alheia para quem tivesse o id.

A regra de quem enxerga tudo mora em um lugar só, `auth/escopo-do-formulario.ts` — o guard e os
services leem dela. Duas cópias divergiriam no primeiro perfil novo, e a divergência apareceria
como pesquisa de outro usuário numa lista.

O `ADMINISTRADOR` e o `ANALISTA` enxergam tudo de propósito: o primeiro porque precisa dar
suporte e conter abuso, o segundo porque é conta criada por um Administrador justamente para ler
o resultado da equipe — escopo por dono deixaria essa conta sem enxergar nada.

Forçar o recálculo das agregações (`POST /agregacao/atualizar`) continua só do Administrador: ele
recalcula as views inteiras, e liberá-lo daria a qualquer conta um jeito barato de martelar o
banco. O resultado do `PESQUISADOR` atualiza no ciclo automático, como o de todo mundo.

## Fluxo

```
POST /api/v1/auth/login      e-mail + senha  → access token (JWT) + refresh token
POST /api/v1/auth/renovar    refresh token   → novo par (o refresh antigo morre)
POST /api/v1/auth/logout     access token    → sessão encerrada
GET  /api/v1/auth/eu         access token    → identidade do usuário
```

- **Access token**: JWT HS256, curto (`JWT_ACCESS_TTL_MIN`, padrão 15 min). Carrega `sub`,
  `perfil` e `sid` (id da sessão).
- **Refresh token**: 32 bytes aleatórios. O banco guarda só o SHA-256; o valor em claro
  existe apenas no cliente. Cada renovação gera um novo — reutilizar o antigo dá 401.
- **Sessão**: linha na tabela `sessao`, com `ultima_atividade_em`, `expira_em`,
  `encerrada_em` e `motivo_encerramento`.

### Encerramento por inatividade

O guard de autenticação confere a sessão a cada requisição. Passou de
`SESSAO_INATIVIDADE_MIN` (padrão 30) sem uso, a sessão é encerrada com motivo
`INATIVIDADE` e o acesso vira 401. Há também um teto absoluto,
`SESSAO_ABSOLUTA_HORAS` (padrão 8), com motivo `EXPIRACAO`.

Para não escrever no banco a cada requisição, `ultima_atividade_em` é atualizada em
janelas de um minuto.

### Sessões derrubadas por mudança administrativa

| Evento | Motivo gravado |
|---|---|
| Usuário desativado | `USUARIO_DESATIVADO` |
| Perfil alterado | `PERMISSAO_ALTERADA` |
| Senha redefinida ou trocada | `SENHA_ALTERADA` |

O perfil usado na autorização é lido do banco a cada requisição, nunca do token: mudança de
permissão vale na hora.

## Senha

`scrypt` da biblioteca padrão do Node (memory-hard), com salt aleatório por usuário e
comparação em tempo constante. Formato: `scrypt$N$r$p$salt_base64$hash_base64`.

Política mínima: 12 caracteres, com minúscula, maiúscula e número.

Não foi adicionada dependência de hash: `node:crypto` já resolve, e uma biblioteca nativa a
menos é uma superfície de build a menos.

## Guards

Dois guards globais, nesta ordem: `ThrottlerGuard` → `JwtAuthGuard` → `PerfisGuard`.

O padrão é **negar**: sem token a requisição não passa. Rota pública precisa de `@Publico()`
explícito — hoje só `health`, `municipios` e o próprio login. Rota de administração leva
`@Perfis(PerfilCodigo.ADMINISTRADOR)`.

## Administrador inicial

```bash
ADMIN_NOME="Nome Sobrenome" ADMIN_EMAIL=admin@exemplo.br ADMIN_SENHA='...' npm --prefix apps/api run criar-admin
```

Idempotente: se já existir administrador ativo, não faz nada. As credenciais vêm só de
variável de ambiente — nunca de argumento de linha de comando, que ficaria no histórico do
shell. A senha nunca é impressa. A criação entra na auditoria.

O sistema recusa ficar sem nenhum administrador ativo, e um administrador não pode desativar
a si mesmo nem alterar o próprio perfil.

## HTTPS

O TLS termina no nginx (`infra/nginx/proxy.conf`), único serviço publicado em homologação.
API e painel ficam em rede interna.

- HTTP responde 301 para HTTPS; só `/.well-known/acme-challenge/` passa em texto claro.
- TLS 1.2 e 1.3, HSTS de um ano.
- O proxy repassa `X-Forwarded-Proto`; a API roda com `trust proxy` e, quando
  `TLS_OBRIGATORIO=true` (padrão em produção), recusa requisição em texto claro.
- Certificado de desenvolvimento: `infra/scripts/gerar-certificado-dev.sh`. Em produção,
  certificado de AC (Let's Encrypt). Certificado e chave nunca são versionados.

No aplicativo, build de distribuição só aceita `EXPO_PUBLIC_API_URL` em HTTPS — a checagem
está em `apps/app/src/config/ambiente.ts`.

## Auditoria

Ações registradas: `LOGIN`, `LOGIN_FALHA`, `LOGOUT`, `SESSAO_EXPIRADA`, `USUARIO_CRIADO`,
`USUARIO_ALTERADO`, `USUARIO_DESATIVADO`, `SENHA_ALTERADA`, `PERMISSAO_ALTERADA`.

Consulta em `GET /api/v1/auditoria`, restrita ao Administrador.

O `AuditoriaService` descarta, antes de gravar, qualquer campo de nome sensível (senha, hash,
token, authorization, hash de dispositivo, latitude, longitude). Falha ao auditar não derruba
a operação, mas vira log de erro.

## Resposta de erro

Login inválido responde sempre `401` com a mesma mensagem, seja e-mail inexistente, senha
errada ou conta desativada — e o custo do scrypt é pago mesmo sem usuário, para que o tempo
de resposta não denuncie quem existe. O motivo real fica só na auditoria.

Login tem rate limit próprio: 5 tentativas por minuto, contra 60 do limite global.
