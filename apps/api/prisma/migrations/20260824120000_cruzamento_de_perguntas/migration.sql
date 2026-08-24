-- ===========================================================================
-- Cruzamento entre perguntas (ex.: intencao de voto por faixa etaria).
--
-- O cruzamento precisa olhar duas perguntas da MESMA resposta, o que a
-- `mv_resultado_detalhado` nao permite: la cada linha ja perdeu o vinculo com
-- a resposta que a originou. Entao existe uma segunda tabela de fatos, com o
-- par de alternativas contado em conjunto.
--
-- Continua valendo o invariante: o endpoint de resultado nunca varre
-- `resposta` / `resposta_item` — soma sobre esta view com GROUP BY.
--
-- Cada par aparece uma unica vez, na ordem das perguntas do formulario
-- (`pa.ordem < pb.ordem`). O painel escolhe qual eixo vira linha; contar as
-- duas direcoes dobraria a view sem acrescentar informacao.
--
-- Dimensao de municipio preservada porque a apuracao por municipio e o
-- objetivo do sistema. O dia fica de fora de proposito: com as duas dimensoes
-- o produto cartesiano de pares cresce rapido demais para um refresh honesto,
-- e o cruzamento e leitura de composicao, nao de serie temporal.
--
-- Percentual nao entra aqui: e sempre derivado no momento da consulta.
-- ===========================================================================

CREATE MATERIALIZED VIEW "mv_cruzamento_pergunta" AS
SELECT
  r."formulario_id",
  ia."pergunta_id"    AS pergunta_a_id,
  ia."alternativa_id" AS alternativa_a_id,
  ib."pergunta_id"    AS pergunta_b_id,
  ib."alternativa_id" AS alternativa_b_id,
  r."municipio_codigo_ibge",
  COUNT(*) AS total
FROM "resposta_item" ia
JOIN "resposta_item" ib ON ib."resposta_id" = ia."resposta_id"
JOIN "resposta" r       ON r."id" = ia."resposta_id"
JOIN "pergunta" pa      ON pa."id" = ia."pergunta_id"
JOIN "pergunta" pb      ON pb."id" = ib."pergunta_id"
WHERE r."status" = 'VALIDA'
  AND ia."alternativa_id" IS NOT NULL
  AND ib."alternativa_id" IS NOT NULL
  AND pa."ordem" < pb."ordem"
GROUP BY
  r."formulario_id",
  ia."pergunta_id",
  ia."alternativa_id",
  ib."pergunta_id",
  ib."alternativa_id",
  r."municipio_codigo_ibge";

-- Indice unico: exigencia do REFRESH ... CONCURRENTLY. A alternativa ja
-- determina a pergunta, entao o par de alternativas mais o municipio identifica
-- a linha.
CREATE UNIQUE INDEX "uq_mv_cruzamento_pergunta"
  ON "mv_cruzamento_pergunta" (alternativa_a_id, alternativa_b_id, municipio_codigo_ibge);

CREATE INDEX "ix_mv_cruzamento_pergunta_par"
  ON "mv_cruzamento_pergunta" (formulario_id, pergunta_a_id, pergunta_b_id);

COMMENT ON MATERIALIZED VIEW "mv_cruzamento_pergunta" IS
  'Fato agregado do cruzamento: par de perguntas x par de alternativas x municipio. Atualizado por job BullMQ.';
