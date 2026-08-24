-- ===========================================================================
-- Agregacao detalhada para o painel.
--
-- O painel filtra por formulario, pergunta, municipio e periodo, e os quatro
-- podem se combinar. Manter uma view por recorte multiplicaria views sem fim,
-- entao existe uma tabela de fatos agregada com as quatro dimensoes; os
-- endpoints somam sobre ela com GROUP BY.
--
-- Continua valendo o invariante: o endpoint de resultado nunca varre `resposta`.
-- A granularidade e (formulario, pergunta, alternativa, municipio, dia) e so
-- existe linha para combinacao que aconteceu.
--
-- Percentual nao entra aqui: e sempre derivado no momento da consulta, sobre o
-- total das respostas validas do recorte pedido.
-- ===========================================================================

CREATE MATERIALIZED VIEW "mv_resultado_detalhado" AS
SELECT
  r."formulario_id",
  ri."pergunta_id",
  ri."alternativa_id",
  r."municipio_codigo_ibge",
  (r."recebido_em" AT TIME ZONE 'America/Bahia')::date AS dia,
  COUNT(*) AS total
FROM "resposta_item" ri
JOIN "resposta" r ON r."id" = ri."resposta_id"
WHERE r."status" = 'VALIDA' AND ri."alternativa_id" IS NOT NULL
GROUP BY
  r."formulario_id",
  ri."pergunta_id",
  ri."alternativa_id",
  r."municipio_codigo_ibge",
  (r."recebido_em" AT TIME ZONE 'America/Bahia')::date;

CREATE UNIQUE INDEX "uq_mv_resultado_detalhado"
  ON "mv_resultado_detalhado" (pergunta_id, alternativa_id, municipio_codigo_ibge, dia);
CREATE INDEX "ix_mv_resultado_detalhado_formulario"
  ON "mv_resultado_detalhado" (formulario_id, dia);
CREATE INDEX "ix_mv_resultado_detalhado_municipio"
  ON "mv_resultado_detalhado" (formulario_id, municipio_codigo_ibge);

-- Evolucao da coleta: uma linha por dia, contando respostas (nao itens).
CREATE MATERIALIZED VIEW "mv_evolucao_coleta" AS
SELECT
  r."formulario_id",
  (r."recebido_em" AT TIME ZONE 'America/Bahia')::date AS dia,
  COUNT(*) FILTER (WHERE r."status" = 'VALIDA') AS respostas_validas,
  COUNT(*) FILTER (WHERE r."status" = 'EM_CONFERENCIA') AS respostas_em_conferencia,
  COUNT(*) FILTER (WHERE r."status" = 'INVALIDADA') AS respostas_invalidadas,
  COUNT(DISTINCT r."municipio_codigo_ibge") FILTER (WHERE r."status" = 'VALIDA') AS municipios_do_dia
FROM "resposta" r
GROUP BY r."formulario_id", (r."recebido_em" AT TIME ZONE 'America/Bahia')::date;

CREATE UNIQUE INDEX "uq_mv_evolucao_coleta" ON "mv_evolucao_coleta" (formulario_id, dia);

-- Alcance por municipio: quantas respostas validas cada municipio produziu.
-- Serve ao indicador de cobertura e ao filtro de municipio do painel.
CREATE MATERIALIZED VIEW "mv_alcance_municipio" AS
SELECT
  r."formulario_id",
  r."municipio_codigo_ibge",
  COUNT(*) FILTER (WHERE r."status" = 'VALIDA') AS respostas_validas
FROM "resposta" r
GROUP BY r."formulario_id", r."municipio_codigo_ibge"
HAVING COUNT(*) FILTER (WHERE r."status" = 'VALIDA') > 0;

CREATE UNIQUE INDEX "uq_mv_alcance_municipio"
  ON "mv_alcance_municipio" (formulario_id, municipio_codigo_ibge);

COMMENT ON MATERIALIZED VIEW "mv_resultado_detalhado" IS
  'Fato agregado do painel: formulario x pergunta x alternativa x municipio x dia. Atualizado por job BullMQ.';
COMMENT ON MATERIALIZED VIEW "mv_evolucao_coleta" IS
  'Serie diaria da coleta, por formulario. Base do grafico de evolucao.';
