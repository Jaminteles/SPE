-- ===========================================================================
-- Expurgo automatico (LGPD).
--
-- Dois prazos, decididos no escopo do projeto:
--
--   1. dados tecnicos de duplicidade — expurgados no ENCERRAMENTO da coleta.
--      Servem para impedir resposta repetida durante a coleta; encerrada a
--      coleta, perdem finalidade e viram risco.
--   2. respostas — expurgadas 4 anos depois do encerramento.
--
-- Nada aqui apaga resposta agora: a migration so cria a estrutura que permite
-- o job apagar no prazo. O expurgo em si e rotina automatica, nunca manual.
-- ===========================================================================

-- O hash do dispositivo passa a aceitar NULL: e assim que o expurgo tecnico
-- marca "este dado nao existe mais". Continua sendo hash irreversivel enquanto
-- existe — nunca o identificador em claro.
ALTER TABLE "resposta" ALTER COLUMN "dispositivo_hash" DROP NOT NULL;

COMMENT ON COLUMN "resposta"."dispositivo_hash" IS
  'Hash irreversivel do identificador do dispositivo. NULL depois do expurgo tecnico, que acontece no encerramento da coleta.';

-- Momento em que o expurgo tecnico rodou para esta pesquisa. Serve de trava de
-- idempotencia: rodar o job de novo nao refaz trabalho nem reescreve historico.
ALTER TABLE "formulario" ADD COLUMN "expurgo_tecnico_em" TIMESTAMPTZ(6);

COMMENT ON COLUMN "formulario"."expurgo_tecnico_em" IS
  'Quando os dados tecnicos de duplicidade desta pesquisa foram expurgados. NULL enquanto a coleta nao foi encerrada.';

-- Indice parcial para o job achar o que ainda falta expurgar sem varrer a
-- tabela inteira.
CREATE INDEX "ix_formulario_expurgo_pendente"
  ON "formulario" ("encerrado_em")
  WHERE "encerrado_em" IS NOT NULL AND "expurgo_tecnico_em" IS NULL;

-- Acoes novas na trilha de auditoria. O expurgo e irreversivel: precisa deixar
-- rastro de quando rodou e de quanto apagou.
ALTER TYPE "auditoria_acao" ADD VALUE IF NOT EXISTS 'EXPURGO_TECNICO';
ALTER TYPE "auditoria_acao" ADD VALUE IF NOT EXISTS 'EXPURGO_RESPOSTAS';
