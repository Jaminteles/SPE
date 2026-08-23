-- CreateEnum
CREATE TYPE "sessao_motivo" AS ENUM ('LOGOUT', 'INATIVIDADE', 'EXPIRACAO', 'SENHA_ALTERADA', 'PERMISSAO_ALTERADA', 'USUARIO_DESATIVADO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "auditoria_acao" ADD VALUE 'SESSAO_EXPIRADA';
ALTER TYPE "auditoria_acao" ADD VALUE 'USUARIO_CRIADO';
ALTER TYPE "auditoria_acao" ADD VALUE 'USUARIO_ALTERADO';
ALTER TYPE "auditoria_acao" ADD VALUE 'USUARIO_DESATIVADO';
ALTER TYPE "auditoria_acao" ADD VALUE 'SENHA_ALTERADA';

-- CreateTable
CREATE TABLE "sessao" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "refresh_token_hash" CHAR(64) NOT NULL,
    "criada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultima_atividade_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_em" TIMESTAMPTZ(6) NOT NULL,
    "encerrada_em" TIMESTAMPTZ(6),
    "motivo_encerramento" "sessao_motivo",

    CONSTRAINT "sessao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sessao_usuario_id_encerrada_em_idx" ON "sessao"("usuario_id", "encerrada_em");

-- CreateIndex
CREATE INDEX "sessao_ultima_atividade_em_idx" ON "sessao"("ultima_atividade_em");

-- CreateIndex
CREATE UNIQUE INDEX "sessao_refresh_token_hash_key" ON "sessao"("refresh_token_hash");

-- AddForeignKey
ALTER TABLE "sessao" ADD CONSTRAINT "sessao_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===========================================================================
-- Objetos que o Prisma nao modela, escritos a mao.
-- ===========================================================================

-- Encerramento sempre com data e motivo juntos.
ALTER TABLE "sessao"
  ADD CONSTRAINT "ck_sessao_encerramento_coerente"
  CHECK (("encerrada_em" IS NULL) = ("motivo_encerramento" IS NULL));

-- Expiracao absoluta sempre depois da criacao.
ALTER TABLE "sessao"
  ADD CONSTRAINT "ck_sessao_expiracao_posterior"
  CHECK ("expira_em" > "criada_em");

-- Varredura de sessoes vivas (inatividade e expiracao) sem tocar no historico.
CREATE INDEX "ix_sessao_ativa"
  ON "sessao" ("ultima_atividade_em")
  WHERE "encerrada_em" IS NULL;

COMMENT ON COLUMN "sessao"."refresh_token_hash" IS
  'Hash SHA-256 do refresh token. O valor em claro so existe no cliente; nunca em log nem em resposta de API.';
