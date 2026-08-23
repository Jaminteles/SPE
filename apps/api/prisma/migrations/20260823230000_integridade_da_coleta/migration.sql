-- CreateEnum
CREATE TYPE "resposta_marcacao" AS ENUM ('TEMPO_MUITO_BAIXO', 'PADRAO_REPETITIVO', 'VOLUME_ANOMALO_DA_ORIGEM', 'MUNICIPIO_FORA_DA_BAHIA');

-- AlterTable
-- As colunas novas sao obrigatorias. Para nao quebrar em base que ja tenha
-- resposta gravada, entram com preenchimento e so depois perdem o default:
-- nenhuma linha e apagada e nenhum valor existente e alterado.
ALTER TABLE "resposta" ADD COLUMN "iniciado_em" TIMESTAMPTZ(6);
UPDATE "resposta" SET "iniciado_em" = "coletado_em" WHERE "iniciado_em" IS NULL;
ALTER TABLE "resposta" ALTER COLUMN "iniciado_em" SET NOT NULL;

ALTER TABLE "resposta" ADD COLUMN "duracao_segundos" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "resposta" ALTER COLUMN "duracao_segundos" DROP DEFAULT;

ALTER TABLE "resposta" ADD COLUMN "marcacoes" "resposta_marcacao"[];

-- CreateTable
CREATE TABLE "sessao_coleta" (
    "id" UUID NOT NULL,
    "formulario_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "origem_hash" CHAR(64),
    "iniciada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_em" TIMESTAMPTZ(6) NOT NULL,
    "usada_em" TIMESTAMPTZ(6),

    CONSTRAINT "sessao_coleta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessao_coleta_token_hash_key" ON "sessao_coleta"("token_hash");

-- CreateIndex
CREATE INDEX "sessao_coleta_formulario_id_iniciada_em_idx" ON "sessao_coleta"("formulario_id", "iniciada_em");

-- CreateIndex
CREATE INDEX "sessao_coleta_origem_hash_iniciada_em_idx" ON "sessao_coleta"("origem_hash", "iniciada_em");

-- CreateIndex
CREATE INDEX "resposta_formulario_id_duracao_segundos_idx" ON "resposta"("formulario_id", "duracao_segundos");

-- AddForeignKey
ALTER TABLE "sessao_coleta" ADD CONSTRAINT "sessao_coleta_formulario_id_fkey" FOREIGN KEY ("formulario_id") REFERENCES "formulario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===========================================================================
-- Objetos que o Prisma nao modela, escritos a mao.
-- ===========================================================================

-- Duracao nunca negativa; sessao expira depois de comecar.
ALTER TABLE "resposta"
  ADD CONSTRAINT "ck_resposta_duracao_nao_negativa" CHECK ("duracao_segundos" >= 0);

ALTER TABLE "sessao_coleta"
  ADD CONSTRAINT "ck_sessao_coleta_expiracao_posterior" CHECK ("expira_em" > "iniciada_em");

-- Sessao aberta e nao usada: e o que a validacao do envio procura.
CREATE INDEX "ix_sessao_coleta_aberta"
  ON "sessao_coleta" ("expira_em")
  WHERE "usada_em" IS NULL;

-- Fila de conferencia por marcacao automatica.
CREATE INDEX "ix_resposta_marcacoes"
  ON "resposta" USING GIN ("marcacoes");

COMMENT ON COLUMN "sessao_coleta"."origem_hash" IS
  'HMAC do endereco de rede, so para detectar volume anomalo. Dado tecnico de duplicidade, expurgado no encerramento da coleta.';
COMMENT ON COLUMN "resposta"."duracao_segundos" IS
  'Tempo entre a abertura da sessao e o envio, medido pelo servidor.';

-- ===========================================================================
-- Agregacao pre-calculada dos resultados (views materializadas).
-- O painel le daqui; endpoint de resultado nunca varre a tabela bruta.
-- Percentual sempre derivado, sobre respostas validas.
-- ===========================================================================

-- Total de respostas validas por formulario. Base dos percentuais.
CREATE MATERIALIZED VIEW "mv_resumo_formulario" AS
SELECT
  f."id" AS formulario_id,
  COUNT(r."id") FILTER (WHERE r."status" = 'VALIDA') AS respostas_validas,
  COUNT(r."id") FILTER (WHERE r."status" = 'EM_CONFERENCIA') AS respostas_em_conferencia,
  COUNT(r."id") FILTER (WHERE r."status" = 'INVALIDADA') AS respostas_invalidadas,
  COUNT(DISTINCT r."municipio_codigo_ibge") FILTER (WHERE r."status" = 'VALIDA') AS municipios_alcancados,
  MIN(r."recebido_em") FILTER (WHERE r."status" = 'VALIDA') AS primeira_resposta_em,
  MAX(r."recebido_em") FILTER (WHERE r."status" = 'VALIDA') AS ultima_resposta_em
FROM "formulario" f
LEFT JOIN "resposta" r ON r."formulario_id" = f."id"
GROUP BY f."id";

CREATE UNIQUE INDEX "uq_mv_resumo_formulario" ON "mv_resumo_formulario" (formulario_id);

-- Resultado por alternativa, com percentual sobre as respostas validas da pergunta.
CREATE MATERIALIZED VIEW "mv_resultado_pergunta" AS
WITH validas AS (
  SELECT ri."pergunta_id", ri."alternativa_id", r."formulario_id"
  FROM "resposta_item" ri
  JOIN "resposta" r ON r."id" = ri."resposta_id"
  WHERE r."status" = 'VALIDA' AND ri."alternativa_id" IS NOT NULL
),
totais AS (
  SELECT "pergunta_id", COUNT(*) AS total_da_pergunta
  FROM validas
  GROUP BY "pergunta_id"
)
SELECT
  v."formulario_id",
  v."pergunta_id",
  v."alternativa_id",
  COUNT(*) AS total,
  ROUND((COUNT(*)::numeric * 100) / NULLIF(t.total_da_pergunta, 0), 2) AS percentual
FROM validas v
JOIN totais t ON t."pergunta_id" = v."pergunta_id"
GROUP BY v."formulario_id", v."pergunta_id", v."alternativa_id", t.total_da_pergunta;

CREATE UNIQUE INDEX "uq_mv_resultado_pergunta"
  ON "mv_resultado_pergunta" (pergunta_id, alternativa_id);
CREATE INDEX "ix_mv_resultado_pergunta_formulario"
  ON "mv_resultado_pergunta" (formulario_id);

-- Apuracao por municipio: o objetivo central do sistema.
CREATE MATERIALIZED VIEW "mv_resultado_municipio" AS
WITH validas AS (
  SELECT
    r."formulario_id",
    r."municipio_codigo_ibge",
    ri."pergunta_id",
    ri."alternativa_id"
  FROM "resposta_item" ri
  JOIN "resposta" r ON r."id" = ri."resposta_id"
  WHERE r."status" = 'VALIDA' AND ri."alternativa_id" IS NOT NULL
),
totais AS (
  SELECT "formulario_id", "municipio_codigo_ibge", "pergunta_id", COUNT(*) AS total_local
  FROM validas
  GROUP BY "formulario_id", "municipio_codigo_ibge", "pergunta_id"
)
SELECT
  v."formulario_id",
  v."municipio_codigo_ibge",
  v."pergunta_id",
  v."alternativa_id",
  COUNT(*) AS total,
  ROUND((COUNT(*)::numeric * 100) / NULLIF(t.total_local, 0), 2) AS percentual
FROM validas v
JOIN totais t
  ON t."formulario_id" = v."formulario_id"
 AND t."municipio_codigo_ibge" = v."municipio_codigo_ibge"
 AND t."pergunta_id" = v."pergunta_id"
GROUP BY
  v."formulario_id", v."municipio_codigo_ibge", v."pergunta_id", v."alternativa_id", t.total_local;

CREATE UNIQUE INDEX "uq_mv_resultado_municipio"
  ON "mv_resultado_municipio" (municipio_codigo_ibge, pergunta_id, alternativa_id);
CREATE INDEX "ix_mv_resultado_municipio_formulario"
  ON "mv_resultado_municipio" (formulario_id);

COMMENT ON MATERIALIZED VIEW "mv_resumo_formulario" IS
  'Agregacao pre-calculada. Atualizada por job BullMQ; nunca consultada com a tabela bruta em tempo real.';
