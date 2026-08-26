-- ===========================================================================
-- Confirmacao de e-mail no cadastro aberto.
--
-- Com o auto-cadastro, o e-mail deixa de ser um dado que um Administrador
-- digitou e passa a ser afirmacao de um desconhecido. Confirmar prova posse da
-- caixa e e o que impede cadastro em massa e cadastro no e-mail de terceiro.
--
-- O token segue o padrao da casa (sessao, sessao_coleta): valor em claro so
-- existe no e-mail enviado, o banco guarda sha256. Vazamento de banco nao
-- entrega token utilizavel.
-- ===========================================================================

ALTER TABLE "usuario"
  ADD COLUMN "email_confirmado_em" TIMESTAMPTZ(6);

COMMENT ON COLUMN "usuario"."email_confirmado_em" IS
  'Quando a posse do e-mail foi provada. NULL bloqueia o login.';

-- Conta que ja existia foi criada por um Administrador ou pelo script de
-- implantacao: a posse do e-mail ja era pressuposto. Sem este backfill, a
-- migration trancaria todo mundo para fora — inclusive o unico Administrador.
UPDATE "usuario" SET "email_confirmado_em" = now() WHERE "email_confirmado_em" IS NULL;

CREATE TABLE "confirmacao_email" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "usuario_id" UUID         NOT NULL,
  "token_hash" CHAR(64)     NOT NULL,
  "criado_em"  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "expira_em"  TIMESTAMPTZ(6) NOT NULL,
  "usado_em"   TIMESTAMPTZ(6),

  CONSTRAINT "confirmacao_email_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "confirmacao_email_usuario_id_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE
);

-- Unico: o token e a credencial da confirmacao, e colisao teria que ser
-- impossivel, nao improvavel.
CREATE UNIQUE INDEX "confirmacao_email_token_hash_key"
  ON "confirmacao_email"("token_hash");

-- Reenvio invalida os anteriores do mesmo usuario: o indice serve a essa busca.
CREATE INDEX "confirmacao_email_usuario_id_idx"
  ON "confirmacao_email"("usuario_id", "criado_em");

COMMENT ON TABLE "confirmacao_email" IS
  'Tokens de confirmacao de e-mail. Guarda sha256; o valor em claro so vai no e-mail.';
