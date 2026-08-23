-- AlterTable
ALTER TABLE "formulario" ADD COLUMN     "token_publico" VARCHAR(32);

-- AlterTable
ALTER TABLE "pergunta" ADD COLUMN     "condicao_alternativa_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "formulario_token_publico_key" ON "formulario"("token_publico");

-- CreateIndex
CREATE INDEX "pergunta_condicao_alternativa_id_idx" ON "pergunta"("condicao_alternativa_id");

-- AddForeignKey
ALTER TABLE "pergunta" ADD CONSTRAINT "pergunta_condicao_alternativa_id_fkey" FOREIGN KEY ("condicao_alternativa_id") REFERENCES "alternativa"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ===========================================================================
-- Objetos que o Prisma nao modela, escritos a mao.
-- ===========================================================================

-- Coerencia da logica condicional, garantida pelo banco e nao so pelo servico:
-- a alternativa de origem precisa pertencer ao mesmo formulario e a uma pergunta
-- de ordem anterior. Uma pergunta nunca condiciona a si mesma.
--
-- E um constraint trigger DEFERIDO: a reordenacao troca varias linhas dentro da
-- mesma transacao e so o estado final precisa ser valido.
CREATE OR REPLACE FUNCTION validar_condicao_de_pergunta() RETURNS TRIGGER AS $$
DECLARE
  origem_formulario UUID;
  origem_ordem INT;
  origem_pergunta UUID;
  origem_tipo pergunta_tipo;
BEGIN
  IF NEW.condicao_alternativa_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.formulario_id, p.ordem, p.id, p.tipo
    INTO origem_formulario, origem_ordem, origem_pergunta, origem_tipo
    FROM alternativa a
    JOIN pergunta p ON p.id = a.pergunta_id
   WHERE a.id = NEW.condicao_alternativa_id;

  IF origem_pergunta IS NULL THEN
    RAISE EXCEPTION 'Alternativa de condicao inexistente.';
  END IF;
  IF origem_pergunta = NEW.id THEN
    RAISE EXCEPTION 'Uma pergunta nao pode depender de si mesma.';
  END IF;
  IF origem_formulario <> NEW.formulario_id THEN
    RAISE EXCEPTION 'A condicao precisa apontar para pergunta do mesmo formulario.';
  END IF;
  IF origem_tipo <> 'UNICA_ESCOLHA' THEN
    RAISE EXCEPTION 'A condicao so pode depender de pergunta de escolha unica.';
  END IF;
  IF origem_ordem >= NEW.ordem THEN
    RAISE EXCEPTION 'A pergunta de origem da condicao precisa vir antes.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER tg_pergunta_condicao_valida
  AFTER INSERT OR UPDATE ON "pergunta"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validar_condicao_de_pergunta();

-- Formulario em coleta ou encerrado sempre tem link publico; rascunho nunca tem.
ALTER TABLE "formulario"
  ADD CONSTRAINT "ck_formulario_token_publico_coerente"
  CHECK (
    ("status" = 'RASCUNHO' AND "token_publico" IS NULL)
    OR ("status" <> 'RASCUNHO' AND "token_publico" IS NOT NULL)
  );

COMMENT ON COLUMN "formulario"."token_publico" IS
  'Identificador do link publico de coleta. Aleatorio e nao sequencial: o uuid interno nunca aparece na URL.';
COMMENT ON COLUMN "pergunta"."condicao_alternativa_id" IS
  'Logica condicional: a pergunta so aparece se esta alternativa tiver sido escolhida.';
