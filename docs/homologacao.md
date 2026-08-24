# Homologação para o disparo real

Sprint 8, marco M4. Este documento é o roteiro das validações que **dependem de
aparelho físico e de pessoas** — elas não podem ser feitas por código e ficam
pendentes até serem executadas com o resultado registrado aqui.

## Critério de aceite da sprint

> Teste de carga aprovado, expurgo validado em homologação e APK instalado com
> sucesso em aparelho real a partir da página de download.

| Item | Como validar | Situação |
|---|---|---|
| Teste de carga | `docs/operacao.md` → "Teste de carga no porte projetado" | pendente de execução em homologação |
| Expurgo | `docs/lgpd.md` → "Como conferir em homologação" + `apps/api/test/expurgo.e2e-spec.ts` | pendente de execução em homologação |
| APK em aparelho real | roteiro abaixo | pendente de aparelho |

Preencha data, responsável e resultado em cada bloco quando executar.

## 1. Instalação em aparelhos reais (S8-09)

Mínimo de **três** modelos, cobrindo versões diferentes do Android (o
`minSdkVersion` do projeto é 29 — Android 10). Sugestão de cobertura: um
aparelho de entrada, um intermediário e um recente.

Para cada aparelho, registrar:

| # | Modelo | Android | Baixou da página | Hash conferido | Instalou | Login | Coleta offline | Reenvio | Observações |
|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | |
| 2 | | | | | | | | | |
| 3 | | | | | | | | | |

Roteiro por aparelho:

1. abrir `https://<host>/download.html` no navegador do próprio aparelho;
2. conferir se versão, hash e link aparecem preenchidos;
3. baixar o APK e **conferir o SHA-256** (app de arquivos com hash, ou baixar
   também no computador e comparar);
4. instalar autorizando "fontes desconhecidas"; anotar se o Play Protect
   reclamou e como foi contornado;
5. abrir o app e conferir que **não** aparece tela de atualização (versão
   instalada = publicada);
6. fazer login com uma conta de teste;
7. responder uma pesquisa **com o aparelho em modo avião**, confirmando que o
   preenchimento persiste;
8. religar a rede e confirmar o reenvio automático;
9. conferir no painel que a resposta chegou (após o ciclo de agregação).

### Teste da verificação de versão

Com um aparelho já instalado:

1. subir `APP_VERSAO_ATUAL` no ambiente da API e reiniciar → o app deve mostrar
   o aviso **dispensável** na próxima abertura;
2. subir `APP_VERSAO_MINIMA` acima da instalada → o app deve **bloquear**, com o
   link da página de download;
3. desligar a rede e abrir o app → deve abrir normalmente, sem bloqueio.

O terceiro passo é o mais importante: indisponibilidade nossa não pode tirar
coletador de campo.

## 2. Homologação assistida com o Administrador (S8-11)

Sessão acompanhada, com o Administrador real montando uma pesquisa de verdade —
não um formulário de teste feito pela equipe técnica. Objetivo: descobrir onde a
ferramenta atrapalha antes de a coleta começar.

Roteiro:

1. login no aplicativo com a conta dele;
2. criar pesquisa com pelo menos: uma pergunta de única escolha, uma de múltipla
   escolha, uma escala e uma condicional;
3. pré-visualizar e responder a própria pesquisa;
4. publicar e gerar o QR Code;
5. responder pelo link público em outro aparelho;
6. abrir o painel: indicadores, apuração por município, cobertura;
7. exportar em CSV, XLSX e PDF; conferir se o total do arquivo bate com o do
   painel;
8. invalidar uma resposta e conferir que ela sai da contagem sem sumir;
9. encerrar a coleta;
10. conferir em `GET /api/v1/expurgo/situacao` que o expurgo técnico rodou.

Registrar: data, participantes, o que travou, o que ele pediu e o que virou
backlog.

| Campo | Preencher |
|---|---|
| Data | |
| Participantes | |
| Pesquisa montada | |
| Problemas encontrados | |
| Ajustes acordados | |

## 3. Expurgo em homologação (S8-01 / S8-02)

1. publicar uma pesquisa e coletar algumas respostas;
2. `GET /api/v1/expurgo/situacao` (Administrador) — anotar os números;
3. encerrar a coleta;
4. repetir a consulta: `pesquisasComExpurgoTecnicoPendente` deve voltar a zero e
   `dispositivosAindaGuardados` deve cair;
5. conferir no banco: `SELECT count(*) FROM resposta WHERE dispositivo_hash IS
   NOT NULL AND formulario_id = '<id>'` → zero; `sessao_coleta` da pesquisa →
   vazia; `expurgar_apos` preenchido;
6. conferir o registro `EXPURGO_TECNICO` no log de auditoria;
7. para exercitar o prazo dos 4 anos sem esperar: em base de homologação,
   antecipar `expurgar_apos` e rodar `POST /api/v1/expurgo/executar`.

| Campo | Preencher |
|---|---|
| Data | |
| Responsável | |
| Resultado | |

## 4. Teste de carga (S8-08)

Executar conforme `docs/operacao.md` e colar aqui a saída do veredito.

| Campo | Preencher |
|---|---|
| Data | |
| Ambiente | |
| Base populada (respostas) | |
| Ritmo alvo / vazão obtida | |
| p95 do envio | |
| Veredito | |

## 5. Antes de liberar o disparo

- [ ] backup rodando e **restauração testada** (`docs/operacao.md`);
- [ ] `APP_VERSAO_MINIMA` coerente com o APK distribuído;
- [ ] `TURNSTILE_OBRIGATORIO=true` em produção;
- [ ] `TLS_OBRIGATORIO=true` e certificado válido;
- [ ] `JWT_SECRET` e `DEVICE_HASH_PEPPER` próprios do ambiente (nunca os do
      exemplo);
- [ ] contas de teste removidas ou desativadas;
- [ ] identificação do controlador preenchida no termo de consentimento
      (`docs/lgpd.md`, pendências de conformidade);
- [ ] manuais entregues ao Administrador e ao Analista.
