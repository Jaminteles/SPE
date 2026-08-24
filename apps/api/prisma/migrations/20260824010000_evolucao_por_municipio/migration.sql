-- A serie diaria passa a ter a dimensao de municipio.
--
-- Sem ela, o indicador de respostas validas ignorava o periodo quando havia
-- municipio escolhido: o painel mostrava o total do municipio inteiro ao lado
-- de um grafico ja recortado por data. Com as duas dimensoes na mesma view,
-- qualquer combinacao de filtro (municipio, periodo ou os dois) sai de uma
-- soma sobre a view — sem varrer `resposta`.
--
-- Recriar view materializada nao toca dado de resposta: e agregacao derivada.

DROP MATERIALIZED VIEW "mv_evolucao_coleta";

CREATE MATERIALIZED VIEW "mv_evolucao_coleta" AS
SELECT
  r."formulario_id",
  r."municipio_codigo_ibge",
  (r."recebido_em" AT TIME ZONE 'America/Bahia')::date AS dia,
  COUNT(*) FILTER (WHERE r."status" = 'VALIDA') AS respostas_validas,
  COUNT(*) FILTER (WHERE r."status" = 'EM_CONFERENCIA') AS respostas_em_conferencia,
  COUNT(*) FILTER (WHERE r."status" = 'INVALIDADA') AS respostas_invalidadas
FROM "resposta" r
GROUP BY
  r."formulario_id",
  r."municipio_codigo_ibge",
  (r."recebido_em" AT TIME ZONE 'America/Bahia')::date;

CREATE UNIQUE INDEX "uq_mv_evolucao_coleta"
  ON "mv_evolucao_coleta" (formulario_id, municipio_codigo_ibge, dia);
CREATE INDEX "ix_mv_evolucao_coleta_dia" ON "mv_evolucao_coleta" (formulario_id, dia);

COMMENT ON MATERIALIZED VIEW "mv_evolucao_coleta" IS
  'Serie diaria da coleta por formulario e municipio. Base do grafico de evolucao e do indicador filtrado.';
