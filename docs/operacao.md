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

Sem loja: o APK é gerado pelo EAS Build e baixado da página pública
`/download.html` (arquivo `apps/painel/public/download.html`, servido pelo mesmo
host da API).

### Gerar e assinar

A chave é **própria** e fica fora do repositório
(`credentialsSource: "local"` nos perfis `homologacao` e `producao` do
`eas.json`):

```bash
keytool -genkeypair -v -keystore apps/app/chaves/spe-coleta.jks \
  -alias spe-coleta -keyalg RSA -keysize 2048 -validity 10000
```

Copie `apps/app/credentials.example.json` para `apps/app/credentials.json` e
preencha caminho, alias e senhas. O `.gitignore` já barra `credentials.json`,
`*.jks` e `*.keystore` — a chave e as senhas nunca entram no Git.

> Guarde o keystore e as senhas em cofre. Perder a chave significa não conseguir
> publicar atualização que instale por cima da versão anterior: os aparelhos
> recusam APK assinado por chave diferente.

```bash
npm --prefix apps/app run build:apk        # perfil producao
npm --prefix apps/app run build:apk:hml    # perfil homologacao
```

### Para onde o APK aponta

Cada perfil do `eas.json` define `EXPO_PUBLIC_API_URL`. Isso não é conforto: o
`apps/app/src/config/ambiente.ts` recusa build de distribuição apontado para
HTTP, e a exceção estoura na carga do módulo — sem a variável, o APK instala e
**fecha ao abrir**, sem mensagem útil no aparelho.

O perfil `producao` está com um endereço propositalmente inválido
(`ALTERAR-ANTES-DO-DISPARO`). Trocar por um domínio com certificado de AC faz
parte do checklist de liberação.

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

Antes do primeiro build, o projeto precisa estar ligado à conta EAS:

```bash
npx eas init            # cria o projectId em app.json > extra.eas
npx eas update:configure # preenche updates.url, usado pelo expo-updates
```

Sem esses dois passos o `expo-updates` sobe desativado — o aplicativo continua
funcionando e a verificação de versão continua valendo, mas não há atualização
de conteúdo.

### Publicar a versão

1. baixar o APK do EAS e calcular o hash:
   `sha256sum spe-coleta.apk` (ou `certutil -hashfile spe-coleta.apk SHA256`);
2. publicar o arquivo em um endereço estável;
3. atualizar no ambiente da API:
   - `APP_VERSAO_ATUAL` — versão publicada;
   - `APP_VERSAO_MINIMA` — abaixo dela o aplicativo **bloqueia** a coleta;
   - `APP_URL_APK` — endereço do arquivo;
   - `APP_URL_DOWNLOAD` — endereço da página de instruções;
   - `APP_APK_SHA256` — hash calculado no passo 1;
   - `APP_NOTAS_DA_VERSAO` — o que mudou;
4. reiniciar a API. A página de download e o aplicativo passam a ver a versão
   nova na hora seguinte à abertura.

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
