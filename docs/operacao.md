# Operação: backup, distribuição do APK e teste de carga

Sprint 8. O que precisa estar de pé antes do disparo real.

## Tarefas pontuais em homologação

Seed dos municípios, criação do Administrador inicial e população da base de
carga são scripts `ts-node`. A imagem da API roda `npm prune --omit=dev`, então
o `ts-node` **não existe** no container que serve as requisições — rodar esses
comandos do host também não serve, porque o Postgres de homologação não publica
porta: só o nginx é exposto.

Para isso existe o serviço `tarefas`, atrás do profile de mesmo nome. Ele não
sobe com `hml:up`; roda na rede do banco, executa e sai:

```bash
docker compose -f infra/docker-compose.hml.yml --profile tarefas run --rm tarefas npm run seed
```

```bash
docker compose -f infra/docker-compose.hml.yml --profile tarefas run --rm \
  -e ADMIN_NOME="Nome Sobrenome" -e ADMIN_EMAIL=admin@exemplo.br \
  -e ADMIN_SENHA="..." tarefas npm run criar-admin
```

As migrations não precisam do estágio de tarefas — o CLI do Prisma sobrevive à
poda e roda no próprio container da API:

```bash
docker compose -f infra/docker-compose.hml.yml exec api npx prisma migrate deploy
```

## Backup da base

Serviço `backup` no `infra/docker-compose.hml.yml`, rodando
`infra/scripts/backup-postgres.sh` dentro de um container com o cliente do
PostgreSQL. O agendamento é o próprio laço do script — sem depender de cron no
host, que é a primeira coisa que se perde ao trocar de máquina.

- formato `custom` (`pg_dump -Fc`): comprimido e restaurável seletivamente;
- o dump é escrito como `.parcial` e só renomeado no fim — dump interrompido
  nunca é confundido com backup bom;
- cada arquivo sai com um `.sha256` ao lado. Backup que não se verifica é
  esperança, não backup;
- retenção por `BACKUP_RETENCAO_DIAS` (padrão 14), intervalo por
  `BACKUP_INTERVALO_HORAS` (padrão 6);
- volume `dados-backup`. **Copiar esse volume para fora do host faz parte da
  rotina**: backup no mesmo servidor não protege contra perda do servidor.

### Restaurar

```bash
docker compose -f infra/docker-compose.hml.yml exec backup \
  sh /usr/local/bin/restaurar-postgres.sh /backups/spe-<base>-<carimbo>.dump
```

O script confere o SHA-256 antes de tocar no banco e exige
`POSTGRES_RESTORE_DB` explícito — restaurar por cima da base errada é o pior
desfecho possível. Restauração nunca é automática: API parada, restaura,
`prisma migrate status`, sobe.

### Teste de restauração (obrigatório antes do disparo)

1. subir uma base vazia (`POSTGRES_RESTORE_DB=spe_restore_teste`);
2. restaurar o dump mais recente;
3. conferir `prisma migrate status` e as contagens de `resposta` e
   `resposta_item`;
4. registrar data e resultado do teste.

Backup nunca testado é backup desconhecido.

## Distribuição do APK

Sem loja: o APK é compilado pelo workflow
[`publicar-apk.yml`](../.github/workflows/publicar-apk.yml), no runner do
GitHub, e baixado da página pública `/download.html` (arquivo
`apps/painel/download.html`).

O EAS Build não participa mais do caminho de produção — a compilação por Gradle
no Actions não tem cota mensal e não depende de máquina de ninguém. Os perfis
`development` e `homologacao` do `eas.json` continuam existindo para uso local.

### A chave de assinatura

A chave é **própria** e fica fora do repositório:

```bash
keytool -genkeypair -v -keystore spe-coleta.jks \
  -alias spe-coleta -keyalg RSA -keysize 2048 -validity 10000
```

> Guarde o keystore e as senhas em cofre. Perder a chave significa não conseguir
> publicar atualização que instale por cima da versão anterior: os aparelhos
> recusam APK assinado por chave diferente. Não há recuperação — só desinstalar
> e reinstalar, perdendo o que estiver na fila local de envio.

O `plugins/assinar-release.js` troca, no `build.gradle` gerado pelo `prebuild`,
a assinatura de debug pela chave real. Ele lê tudo de variável de ambiente, e o
Gradle interpola no momento do build: a senha não chega a ser escrita em arquivo
nenhum. Se o plugin não encontrar o que espera no `build.gradle`, ele derruba o
build — cair de volta na chave de debug em silêncio seria publicar um APK que
ninguém consegue atualizar depois. O workflow ainda confere o certificado do
APK pronto com `apksigner`, como segunda rede.

Para build local assinado, exporte as mesmas variáveis antes do `prebuild`:
`SPE_KEYSTORE_ARQUIVO`, `SPE_KEYSTORE_SENHA`, `SPE_KEYSTORE_ALIAS` e
`SPE_KEYSTORE_SENHA_CHAVE`. Sem `SPE_KEYSTORE_ARQUIVO` o plugin não age e o
build sai com a chave de debug, como qualquer projeto Expo.

### Para onde o APK aponta

`EXPO_PUBLIC_API_URL` define a API que vai no bundle. Isso não é conforto: o
`apps/app/src/config/ambiente.ts` recusa build de distribuição apontado para
HTTP, e a exceção estoura na carga do módulo — sem a variável, o APK instala e
**fecha ao abrir**, sem mensagem útil no aparelho.

Em produção o valor vem da variável de repositório `SPE_API_URL` (Settings →
Secrets and variables → Actions → *Variables*, não *Secrets*: é uma URL pública,
não segredo). O workflow falha cedo e com mensagem clara se ela estiver vazia.

Para homologação em aparelho real na rede local, o endereço é o IP da máquina
que roda o Docker, e o certificado precisa cobrir esse IP:

```bash
./infra/scripts/gerar-certificado-dev.sh 192.168.1.14
```

O script distingue IP de domínio: um IP entra como `IP:` no `subjectAltName`,
porque emitido como `DNS:` o Android ignora a entrada e recusa a conexão mesmo
com o certificado instalado. Depois de gerar, `npm run hml:up` para o nginx
recarregar.

No aparelho, o certificado autoassinado ainda precisa ser instalado (Ajustes →
Segurança → Instalar certificado) ou o app vai falhar no TLS. Confira também se
o firewall do Windows libera a porta 443 para a rede privada — sem isso o
celular não alcança o host.

### Atualização de conteúdo (opcional)

O `expo-updates` só funciona com o projeto ligado a uma conta EAS:

```bash
npx eas init             # cria o projectId em app.json > extra.eas
npx eas update:configure # preenche updates.url
```

Sem esses passos o `expo-updates` sobe desativado — o aplicativo continua
funcionando e a verificação de versão continua valendo, mas não há atualização
de conteúdo. A distribuição por APK não depende disso.

### Publicar a versão

1. subir `expo.version` em `apps/app/app.json`;
2. criar a tag correspondente — `app-v0.2.0` para a versão `0.2.0`. O workflow
   confere que as duas batem e recusa publicar se divergirem;
3. o Actions compila, assina, confere a assinatura e cria o Release com o APK e
   o SHA-256 nas notas;
4. atualizar no ambiente da API:
   - `APP_VERSAO_ATUAL` — versão publicada;
   - `APP_VERSAO_MINIMA` — abaixo dela o aplicativo **bloqueia** a coleta;
   - `APP_URL_APK` — link do arquivo no Release;
   - `APP_URL_DOWNLOAD` — endereço da página de instruções;
   - `APP_APK_SHA256` — hash que o workflow calculou;
   - `APP_NOTAS_DA_VERSAO` — o que mudou;
5. reiniciar a API. A página de download e o aplicativo passam a ver a versão
   nova na abertura seguinte.

`workflow_dispatch` gera o APK como artefato do run, sem criar Release: serve
para testar a esteira sem queimar uma versão.

`APP_VERSAO_MINIMA` só sobe quando a versão anterior realmente não pode mais
gravar resposta (mudança de contrato da API). Bloquear por conforto tira gente
de campo.

### Verificação de versão no aplicativo

`apps/app/src/atualizacao/servico-atualizacao.ts` consulta
`GET /aplicativo/versao` na abertura e compara com a versão instalada
(`runtimeVersion`, que segue `expo.version` pela política `appVersion`):

- abaixo da mínima → tela bloqueante com link e hash;
- abaixo da atual → aviso dispensável;
- servidor fora do ar → **abre normalmente**. Quem está em campo com rede ruim
  não pode ser barrado por indisponibilidade nossa.

O `expo-updates` cuida da atualização de conteúdo (JavaScript) em segundo plano,
aplicada na abertura seguinte — reiniciar no meio de uma coleta perderia
resposta. Ele não substitui o APK quando muda dependência nativa; por isso a
verificação de versão existe junto.

## Teste de carga no porte projetado

Porte alvo: **100 mil respostas em base** e **pico de 300 envios por minuto**.

### 1. Base populada

```bash
docker compose -f infra/docker-compose.hml.yml --profile tarefas run --rm \
  -e FORMULARIO_ID=<uuid> -e TOTAL=100000 tarefas npm run popular-carga
```

Gera dado sintético e anônimo (hash de dispositivo aleatório, nenhum dado
pessoal), distribuído pelos municípios da Bahia e por 30 dias. Depois, atualize
as agregações (`POST /api/v1/agregacao/atualizar`) e confira o tempo de abertura
do painel — a suíte E2E de resultados exige o painel inteiro em menos de 1,5 s.

### 2. Pico sustentado

```bash
docker compose -f infra/docker-compose.hml.yml --profile tarefas run --rm \
  -e API_URL=https://<host>/api/v1 -e TOKEN_PESQUISA=<token público> \
  -e RPM=300 -e TOTAL=1500 -e CONCORRENCIA=30 \
  tarefas npm run teste-de-carga
```

Com `RPM`, cada envio tem hora marcada: o que se mede é se a API aguenta o
**ritmo** do pico, não quantos pedidos cabem de uma vez. O script termina com
veredito explícito (`APROVADO` / `REPROVADO`) e sai com código 1 quando reprova:

- nenhum envio recusado;
- vazão sustentada ≥ 95% do ritmo alvo;
- p95 do envio ≤ `META_P95_MS` (padrão 1500 ms).

Rode contra homologação, com o rate limit configurado como o de produção — o
teste precisa medir a proteção junto, não contorná-la.
