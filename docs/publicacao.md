# Publicação sem custos

Como colocar o SPE no ar de forma que qualquer pessoa baixe o aplicativo e
responda a pesquisa, sem nenhuma máquina sua ligada e sem mensalidade.

Nada aqui depende do seu computador depois de configurado. O que fica na sua
máquina é só o desenvolvimento e a homologação em rede local.

## O desenho

| Peça | Onde | Por quê |
|---|---|---|
| Banco PostgreSQL | Neon | Postgres gerenciado com plano gratuito |
| API NestJS | Render ou Fly.io | contêiner com HTTPS válido de graça |
| Painel + página de download | Cloudflare Workers | estático, não hiberna, domínio grátis |
| Compilação do APK | GitHub Actions | sem cota mensal, ao contrário do EAS Build |
| Arquivo do APK | GitHub Releases | link estável e público |

> Planos gratuitos mudam. Confira os limites vigentes de cada serviço antes de
> se comprometer — o desenho acima não depende de nenhum recurso exótico, então
> trocar um provedor por outro equivalente é barato.

## O que já foi preparado no código

- **sem Redis**: agregação e expurgo rodam numa tarefa periódica dentro da
  própria API. Um serviço a menos para hospedar;
- **sem Chromium**: a exportação em PDF vem desligada
  (`EXPORTACAO_PDF_HABILITADO=false`) e a imagem de produção não traz navegador.
  CSV e XLSX continuam funcionando. Ver
  [apuracao-e-exportacao.md](./apuracao-e-exportacao.md);
- **migração no boot**: `npm run start:prod` roda `prisma migrate deploy` antes
  de subir, então apontar para um banco vazio não exige passo manual;
- **escuta em `0.0.0.0`**: sem isso a hospedagem em contêiner não enxerga a API.

## 1. Banco de dados (Neon)

Crie um projeto e copie a connection string. Ela vai ser o `DATABASE_URL` da
API — inclua `?sslmode=require`.

O plano gratuito hiberna o banco depois de um tempo sem uso e acorda sozinho na
conexão seguinte, o que soma alguns segundos à primeira requisição do dia.

## 2. API (Render ou Fly.io)

No Render, crie um **Web Service** ligado ao repositorio, com runtime Docker:

| Campo | Valor |
|---|---|
| Root Directory | `apps/api` |
| Dockerfile Path | `./Dockerfile` |
| Instance Type | Free |
| Health Check Path | `/api/v1/health` |

O `production` e o **ultimo** estagio do Dockerfile de proposito: sem
`--target`, o Docker constroi o ultimo, e o Render nao deixa escolher o alvo.
Se quiser o PDF, use `production-pdf` numa plataforma que aceite alvo.

So tres variaveis sao obrigatorias para a API subir: `DATABASE_URL`,
`JWT_SECRET` e `DEVICE_HASH_PEPPER`. As demais tem padrao razoavel —
`TLS_OBRIGATORIO` inclusive ja vem `true`, porque a imagem define
`NODE_ENV=production`.

Variáveis obrigatórias:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | a string do Neon |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | 32+ caracteres, aleatório |
| `DEVICE_HASH_PEPPER` | 32+ caracteres, aleatório |
| `CORS_ORIGINS` | a URL do painel no Cloudflare |
| `PAINEL_URL` | a mesma URL do painel |
| `COLETA_BASE_URL` | a mesma URL do painel |
| `TLS_OBRIGATORIO` | `true` |
| `APP_URL_DOWNLOAD` | `<painel>/download` (no Workers; `/download.html` atrás do nginx) |

Gere os dois segredos com:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`PORT` costuma ser injetada pelo próprio serviço; a API usa o que vier.

Depois do primeiro deploy, crie o Administrador inicial rodando uma vez, no
console do serviço ou apontando para o mesmo banco a partir da sua máquina:

```bash
ADMIN_NOME="Nome Sobrenome" ADMIN_EMAIL=admin@exemplo.br ADMIN_SENHA="..." \
  npm --prefix apps/api run criar-admin
```

> **Hibernação.** No plano gratuito do Render o serviço dorme sem tráfego e a
> primeira resposta depois disso demora perto de um minuto. Para a coleta em
> campo isso é tolerável: o aplicativo tem fila local e reenvia sozinho. Se
> incomodar, o caminho é uma instância paga pequena — não há truque grátis
> honesto para isso.

## 3. Painel e página de download (Cloudflare Workers)

A Cloudflare não oferece mais criar projeto **Pages** novo — o caminho é
**Workers & Pages → Create → Import a repository**, que publica um Worker só de
assets estáticos. O `apps/painel/wrangler.jsonc` é o que substitui os campos que
a tela do Pages tinha; sem ele o `wrangler deploy` não sabe o que publicar.

Na criação:

| Campo | Valor |
|---|---|
| Project name | `spe` (precisa bater com o `name` do wrangler.jsonc) |
| Build command | `npm ci && npm run build` |
| Deploy command | `npx wrangler deploy` |

Depois de criado, em **Settings → Build**:

| Campo | Valor |
|---|---|
| Root directory | `apps/painel` |

Não há variável para configurar no painel da Cloudflare. A URL da API vem do
`apps/painel/.env.production`, versionado no repositório — trocar de API é um
commit, que já dispara o build novo por si só.

O root directory é indispensável: na raiz do repositório o `npm run build`
compila a API junto, e o `dist` do painel nem existe onde o wrangler procura.

A versão do Node vem do `apps/painel/.nvmrc`, que pede **22** — o wrangler 4
recusa rodar em Node 20. Não adianta definir `NODE_VERSION` nas variáveis: o
Workers Builds não lê essa variável (o Pages lia). Vale só para publicar o
painel; a API continua em Node 20 (`node:20-alpine` no Dockerfile).

Pelo mesmo motivo, rodar `npm --prefix apps/painel run deploy` na sua máquina
exige Node 22+. O caminho normal é o deploy automático a cada push; o script
local é saída de emergência.

`VITE_API_URL` é lida **no build**, tanto pelo painel quanto pela
`download.html`. Um painel publicado sem ela não falha na publicação: sai
apontando para `http://localhost:3000` e só quebra quando alguém tenta entrar —
por isso ela mora num arquivo versionado, e não numa caixinha de painel.

Variável de ambiente de verdade continua tendo precedência sobre o arquivo, para
um build pontual apontando noutro lugar.

### O endereço da página de download

O Workers serve HTML sem a extensão: `/download.html` responde **307** para
`/download`. O navegador segue e a página abre normalmente, mas o endereço
canônico é `/download` — é ele que vai em `APP_URL_DOWNLOAD`. Atrás do nginx da
homologação o caminho continua sendo `/download.html`.

Anote a URL que a Cloudflare te der: ela é o `CORS_ORIGINS`, o `PAINEL_URL` e o
`COLETA_BASE_URL` do passo 2. As duas pontas precisam concordar.

## 4. Aplicativo (GitHub Actions + Releases)

Em Settings → Secrets and variables → Actions:

**Variables** (não são segredos):

| Nome | Valor |
|---|---|
| `SPE_API_URL` | `https://<sua-api>/api/v1` |
| `SPE_PAINEL_URL` | a URL do painel — liga o App Link do link de coleta |

**Secrets**:

| Nome | Valor |
|---|---|
| `SPE_KEYSTORE_BASE64` | o arquivo `.jks` em base64 |
| `SPE_KEYSTORE_SENHA` | senha do keystore |
| `SPE_KEYSTORE_ALIAS` | alias da chave (ex.: `spe-coleta`) |
| `SPE_KEYSTORE_SENHA_CHAVE` | senha da chave |

Para gerar o base64 do keystore:

```bash
base64 -w0 spe-coleta.jks > spe-coleta.jks.base64
```

No Windows, sem `base64`:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("spe-coleta.jks")) | Set-Content spe-coleta.jks.base64
```

Cadastre o conteúdo desse arquivo você mesmo, pela interface do GitHub, e apague
o `.base64` depois. Geração da chave e o que o workflow faz com ela:
[operacao.md](./operacao.md#a-chave-de-assinatura).

Teste a esteira antes de queimar uma versão: rode o workflow por
**Run workflow** (`workflow_dispatch`). Ele compila e deixa o APK como artefato
do run, sem criar Release.

Para publicar de verdade, crie a tag que bate com o `app.json`:

```bash
git tag app-v0.1.0 && git push origin app-v0.1.0
```

Terminado o run, pegue o link do APK e o SHA-256 das notas do Release e preencha
`APP_URL_APK`, `APP_APK_SHA256` e `APP_VERSAO_ATUAL` na API. Reinicie a API: a
página de download passa a oferecer o arquivo.

### O link de coleta abrindo o aplicativo direto

O link que a pesquisa gera é `<painel>/r.html?t=<token>`. Aberto no navegador,
ele mostra uma página com o botão `spe://`, o código para digitar e o caminho
para instalar o aplicativo — isso funciona sempre, e é o que vale se você parar
por aqui.

Para o link abrir o aplicativo **direto**, sem passar pelo navegador, o Android
exige provar que o mesmo dono controla o site e o APK. São duas pontas, e as
duas precisam concordar:

| Onde | Variável | Valor |
|---|---|---|
| GitHub Actions (Variables) | `SPE_PAINEL_URL` | a URL do painel |
| Build do painel na Cloudflare | `SPE_APP_FINGERPRINT` | a impressão digital da chave de assinatura |

A impressão digital sai do próprio workflow do APK: ao fim do run, o resumo
traz um bloco **Impressao digital da chave de assinatura**, já no formato que o
painel espera. É a chave que assinou aquele APK, não um valor que se inventa.

A ordem importa, porque a verificação acontece na **instalação** do aplicativo:

1. rode o workflow do APK com `SPE_PAINEL_URL` já configurada e copie a
   impressão digital do resumo;
2. cadastre `SPE_APP_FINGERPRINT` na Cloudflare e publique o painel de novo;
3. confira que `<painel>/.well-known/assetlinks.json` responde com o JSON —
   se der 404, o painel foi publicado sem a variável e o build avisou isso no
   log;
4. só então instale o APK no aparelho. Aparelho que já tinha o aplicativo
   instalado antes do passo 3 precisa reinstalar: o Android não refaz a
   verificação sozinho.

Trocar a chave de assinatura invalida a impressão digital publicada. O link não
quebra — volta a abrir no navegador, na página `r.html`.

## 5. Conferir a ponta a ponta

1. abrir `<painel>/download` — precisa mostrar versão e hash, não
   "indisponível no momento". Se mostrar, a API não está respondendo ou o
   `CORS_ORIGINS` não inclui a origem do painel;
2. instalar o APK num aparelho e abrir — se fechar sozinho na abertura, o
   `SPE_API_URL` do build estava vazio ou em HTTP;
3. responder uma pesquisa de teste e conferir se aparece no painel;
4. conferir o hash antes de instalar, como a própria página instrui;
5. tocar no link de coleta a partir de uma mensagem no próprio aparelho — com o
   App Link ligado, ele abre o aplicativo já na pesquisa; sem ele, abre a página
   `r.html`, e o botão "Abrir no aplicativo" faz o mesmo caminho.

## Custos que aparecem depois

Coisas que o plano gratuito não cobre e que valem estar no radar:

- **exportação em PDF**: precisa de Chromium e de memória. Alvo `production-pdf`
  do Dockerfile e `EXPORTACAO_PDF_HABILITADO=true`, numa instância maior;
- **domínio próprio**: os subdomínios dos provedores são grátis; um `.com.br`
  não é;
- **volume**: o plano gratuito do banco tem teto de armazenamento e de
  computação. Pesquisa grande estoura;
- **backup**: `infra/scripts/backup-postgres.sh` foi escrito para o Postgres em
  contêiner. Com o banco gerenciado, o backup passa a ser o do provedor —
  confira o que o plano gratuito realmente retém.
