# Conformidade com a LGPD

Sprint 8. Revisão do que o sistema coleta, por quanto tempo guarda e como
apaga.

## Premissa: a resposta é anônima por construção

O sistema não pede nome, CPF, telefone, e-mail nem qualquer identificador do
respondente — não há campo para isso no schema, não há DTO que aceite isso e não
há tela que pergunte. Anonimato aqui não é política de uso: é ausência de
estrutura para guardar.

Consequência prática: como não existe vínculo entre resposta e pessoa, não há
como atender pedido individual de acesso, correção ou exclusão de uma resposta
específica — e é isso que o termo de consentimento diz, em vez de prometer o que
não se pode cumprir.

## O que é coletado

| Dado | Finalidade | Prazo |
|---|---|---|
| Município (código IBGE) | apuração por município — o objetivo do sistema | 4 anos após o encerramento |
| Alternativa escolhida / valor respondido | apuração | 4 anos após o encerramento |
| Data e hora do envio, duração do preenchimento | integridade da coleta (detecção de resposta automatizada) | 4 anos após o encerramento |
| Hash irreversível do identificador do aparelho | impedir resposta duplicada durante a coleta | até o encerramento da coleta |
| Hash do token e da origem da sessão de coleta | impedir reuso de link e rajada | até o encerramento da coleta |
| Latitude/longitude (opcional) | conferência de campo, quando o respondente autoriza | 4 anos após o encerramento |

O identificador do aparelho **nunca** existe em claro: entra na API e sai como
HMAC-SHA256 com pepper de ambiente. Não aparece em log, em resposta de API nem
em exportação.

A geolocalização é opcional, depende de permissão explícita no aparelho e nunca
trafega em URL, query param ou log.

## Retenção e expurgo

Os dois prazos são automáticos, executados pela tarefa periódica do módulo
`apps/api/src/expurgo` — não existe botão que escolha *o que* apagar:

1. **Encerramento da coleta** → expurgo técnico. O hash do dispositivo vira
   nulo e as sessões de coleta são apagadas. Encerrada a coleta, o controle de
   duplicidade perdeu finalidade; manter o dado seria retenção sem propósito.
   Disparado no próprio encerramento e reconferido a cada ciclo do job.
2. **4 anos após o encerramento** → expurgo das respostas. A resposta e seus
   itens saem fisicamente da base, em lotes.

O prazo é gravado em `resposta.expurgar_apos` no encerramento — é o relógio dos
4 anos, guardado no dado e não numa planilha de alguém.

`EXPURGO_ANOS` existe como variável de ambiente para o caso de a decisão de
conformidade mudar, não como ajuste de operação.

### Como conferir em homologação

```bash
curl -H "Authorization: Bearer $TOKEN_ADMIN" https://<host>/api/v1/expurgo/situacao
```

A rota é exclusiva do Administrador e devolve apenas contagens — nada que
permita reidentificar respondente. Para forçar um ciclo sem esperar as 24 h:
`POST /api/v1/expurgo/executar`.

Evidência automatizada: `apps/api/test/expurgo.e2e-spec.ts` prova, contra banco
real, que encerrar a coleta apaga os dados técnicos e que a resposta some quando
o prazo vence.

## Invalidação não é exclusão

Invalidar resposta muda status; o registro permanece e sai da contagem. O único
ponto do sistema que apaga resposta fisicamente é o expurgo por prazo — e só por
prazo cumprido.

## Auditoria

Ficam auditáveis: login, mudança de permissão, criação e publicação de
formulário, invalidação e revalidação de resposta, encerramento da coleta,
atualização de agregação, exportação de dados e as duas formas de expurgo
(`EXPURGO_TECNICO`, `EXPURGO_RESPOSTAS`).

O `AuditoriaService` descarta, de qualquer origem, chaves como `token`,
`senha`, `dispositivoHash`, `latitude` e `longitude`. Auditoria registra
volume e momento, nunca conteúdo que reidentifique.

## Termo de consentimento

Está em `apps/app/src/telas/coleta/TelaConsentimento.tsx`, antecede a primeira
pergunta e cobre: anonimato, finalidade, o que é guardado, prazos, a
opcionalidade da localização, os direitos do titular e a voluntariedade. Sem
aceite marcado, nada é gravado — nem no aparelho nem no servidor.

O texto reflete exatamente o que o código faz. Os prazos citados nele são os que
o job executa.

## Pendências de conformidade (decisão do responsável pela pesquisa)

Estes pontos são de gestão, não de código, e precisam ser resolvidos antes do
disparo real:

- **Identificação do controlador**: o termo não nomeia a instituição responsável
  pela pesquisa nem um canal de contato. Definido o texto oficial, ele entra na
  tela de consentimento;
- **Aprovação jurídica do termo**: o texto atual é a base legal mínima escrita
  por quem construiu o sistema, não parecer jurídico;
- **Registro do tratamento** (art. 37): manter fora do repositório o registro
  das operações de tratamento, apontando para este documento;
- **Encarregado (DPO)**: se a instituição designar, publicar o contato junto com
  a identificação do controlador.
