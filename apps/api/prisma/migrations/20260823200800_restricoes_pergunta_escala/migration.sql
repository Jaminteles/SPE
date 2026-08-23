-- Restricoes do tipo ESCALA em migration separada: o PostgreSQL nao aceita
-- usar um valor de enum na mesma transacao em que ele foi criado.

-- ===========================================================================
-- Objetos que o Prisma nao modela, escritos a mao.
-- ===========================================================================

-- A configuracao de escala so existe no tipo ESCALA, e sempre completa.
ALTER TABLE "pergunta"
  ADD CONSTRAINT "ck_pergunta_escala_coerente"
  CHECK (
    ("tipo" = 'ESCALA'
      AND "escala_minimo" IS NOT NULL
      AND "escala_maximo" IS NOT NULL
      AND "escala_maximo" > "escala_minimo")
    OR ("tipo" <> 'ESCALA'
      AND "escala_minimo" IS NULL
      AND "escala_maximo" IS NULL
      AND "escala_rotulo_minimo" IS NULL
      AND "escala_rotulo_maximo" IS NULL)
  );

-- Faixa util de escala: evita nota de 1 a 1000 por engano de digitacao.
ALTER TABLE "pergunta"
  ADD CONSTRAINT "ck_pergunta_escala_faixa"
  CHECK (
    "escala_minimo" IS NULL
    OR ("escala_minimo" BETWEEN 0 AND 10 AND "escala_maximo" BETWEEN 1 AND 10)
  );

-- Ordem sempre positiva, em pergunta e em alternativa.
ALTER TABLE "pergunta"
  ADD CONSTRAINT "ck_pergunta_ordem_positiva" CHECK ("ordem" > 0);

ALTER TABLE "alternativa"
  ADD CONSTRAINT "ck_alternativa_ordem_positiva" CHECK ("ordem" > 0);

COMMENT ON COLUMN "pergunta"."escala_minimo" IS
  'Valor inicial da escala. Preenchido apenas quando tipo = ESCALA.';
