-- CreateEnum
CREATE TYPE "perfil_codigo" AS ENUM ('ADMINISTRADOR', 'ANALISTA');

-- CreateEnum
CREATE TYPE "formulario_status" AS ENUM ('RASCUNHO', 'EM_COLETA', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "pergunta_tipo" AS ENUM ('UNICA_ESCOLHA', 'MULTIPLA_ESCOLHA', 'TEXTO_LIVRE', 'NUMERO');

-- CreateEnum
CREATE TYPE "resposta_status" AS ENUM ('VALIDA', 'EM_CONFERENCIA', 'INVALIDADA');

-- CreateEnum
CREATE TYPE "resposta_origem" AS ENUM ('APLICATIVO', 'WEB');

-- CreateEnum
CREATE TYPE "auditoria_acao" AS ENUM ('LOGIN', 'LOGIN_FALHA', 'LOGOUT', 'PERMISSAO_ALTERADA', 'FORMULARIO_CRIADO', 'FORMULARIO_PUBLICADO', 'COLETA_ENCERRADA', 'RESPOSTA_INVALIDADA', 'EXPORTACAO_GERADA');

-- CreateTable
CREATE TABLE "perfil" (
    "id" UUID NOT NULL,
    "codigo" "perfil_codigo" NOT NULL,
    "nome" VARCHAR(60) NOT NULL,
    "descricao" VARCHAR(240),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "perfil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "email" VARCHAR(180) NOT NULL,
    "senha_hash" VARCHAR(255) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "perfil_id" UUID NOT NULL,
    "ultimo_login_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formulario" (
    "id" UUID NOT NULL,
    "titulo" VARCHAR(180) NOT NULL,
    "descricao" VARCHAR(2000),
    "status" "formulario_status" NOT NULL DEFAULT 'RASCUNHO',
    "versao" INTEGER NOT NULL DEFAULT 1,
    "vigencia_inicio" TIMESTAMPTZ(6),
    "vigencia_fim" TIMESTAMPTZ(6),
    "publicado_em" TIMESTAMPTZ(6),
    "encerrado_em" TIMESTAMPTZ(6),
    "criado_por_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "formulario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pergunta" (
    "id" UUID NOT NULL,
    "formulario_id" UUID NOT NULL,
    "enunciado" VARCHAR(500) NOT NULL,
    "tipo" "pergunta_tipo" NOT NULL,
    "obrigatoria" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pergunta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alternativa" (
    "id" UUID NOT NULL,
    "pergunta_id" UUID NOT NULL,
    "texto" VARCHAR(300) NOT NULL,
    "ordem" INTEGER NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alternativa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipio" (
    "id" UUID NOT NULL,
    "codigo_ibge" INTEGER NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "municipio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resposta" (
    "id" UUID NOT NULL,
    "formulario_id" UUID NOT NULL,
    "municipio_codigo_ibge" INTEGER NOT NULL,
    "status" "resposta_status" NOT NULL DEFAULT 'VALIDA',
    "origem" "resposta_origem" NOT NULL,
    "dispositivo_hash" CHAR(64) NOT NULL,
    "consentimento_em" TIMESTAMPTZ(6) NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "coletado_em" TIMESTAMPTZ(6) NOT NULL,
    "recebido_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motivo_conferencia" VARCHAR(240),
    "invalidada_em" TIMESTAMPTZ(6),
    "invalidada_por_id" UUID,
    "motivo_invalidacao" VARCHAR(240),
    "expurgar_apos" TIMESTAMPTZ(6),

    CONSTRAINT "resposta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resposta_item" (
    "id" UUID NOT NULL,
    "resposta_id" UUID NOT NULL,
    "pergunta_id" UUID NOT NULL,
    "alternativa_id" UUID,
    "valor_texto" VARCHAR(1000),
    "valor_numero" DECIMAL(18,4),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resposta_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_auditoria" (
    "id" UUID NOT NULL,
    "usuario_id" UUID,
    "acao" "auditoria_acao" NOT NULL,
    "entidade" VARCHAR(60) NOT NULL,
    "entidade_id" VARCHAR(64),
    "detalhe" JSONB,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "perfil_codigo_key" ON "perfil"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE INDEX "usuario_perfil_id_idx" ON "usuario"("perfil_id");

-- CreateIndex
CREATE INDEX "formulario_status_idx" ON "formulario"("status");

-- CreateIndex
CREATE INDEX "formulario_criado_por_id_idx" ON "formulario"("criado_por_id");

-- CreateIndex
CREATE INDEX "pergunta_formulario_id_idx" ON "pergunta"("formulario_id");

-- CreateIndex
CREATE UNIQUE INDEX "pergunta_formulario_id_ordem_key" ON "pergunta"("formulario_id", "ordem");

-- CreateIndex
CREATE INDEX "alternativa_pergunta_id_idx" ON "alternativa"("pergunta_id");

-- CreateIndex
CREATE UNIQUE INDEX "alternativa_pergunta_id_ordem_key" ON "alternativa"("pergunta_id", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "municipio_codigo_ibge_key" ON "municipio"("codigo_ibge");

-- CreateIndex
CREATE INDEX "municipio_uf_nome_idx" ON "municipio"("uf", "nome");

-- CreateIndex
CREATE INDEX "resposta_formulario_id_status_idx" ON "resposta"("formulario_id", "status");

-- CreateIndex
CREATE INDEX "resposta_formulario_id_municipio_codigo_ibge_status_idx" ON "resposta"("formulario_id", "municipio_codigo_ibge", "status");

-- CreateIndex
CREATE INDEX "resposta_recebido_em_idx" ON "resposta"("recebido_em");

-- CreateIndex
CREATE INDEX "resposta_item_pergunta_id_alternativa_id_idx" ON "resposta_item"("pergunta_id", "alternativa_id");

-- CreateIndex
CREATE INDEX "resposta_item_resposta_id_idx" ON "resposta_item"("resposta_id");

-- CreateIndex
CREATE UNIQUE INDEX "resposta_item_resposta_id_pergunta_id_alternativa_id_key" ON "resposta_item"("resposta_id", "pergunta_id", "alternativa_id");

-- CreateIndex
CREATE INDEX "log_auditoria_usuario_id_criado_em_idx" ON "log_auditoria"("usuario_id", "criado_em");

-- CreateIndex
CREATE INDEX "log_auditoria_acao_criado_em_idx" ON "log_auditoria"("acao", "criado_em");

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "perfil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formulario" ADD CONSTRAINT "formulario_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pergunta" ADD CONSTRAINT "pergunta_formulario_id_fkey" FOREIGN KEY ("formulario_id") REFERENCES "formulario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alternativa" ADD CONSTRAINT "alternativa_pergunta_id_fkey" FOREIGN KEY ("pergunta_id") REFERENCES "pergunta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resposta" ADD CONSTRAINT "resposta_formulario_id_fkey" FOREIGN KEY ("formulario_id") REFERENCES "formulario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resposta" ADD CONSTRAINT "resposta_municipio_codigo_ibge_fkey" FOREIGN KEY ("municipio_codigo_ibge") REFERENCES "municipio"("codigo_ibge") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resposta" ADD CONSTRAINT "resposta_invalidada_por_id_fkey" FOREIGN KEY ("invalidada_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resposta_item" ADD CONSTRAINT "resposta_item_resposta_id_fkey" FOREIGN KEY ("resposta_id") REFERENCES "resposta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resposta_item" ADD CONSTRAINT "resposta_item_pergunta_id_fkey" FOREIGN KEY ("pergunta_id") REFERENCES "pergunta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resposta_item" ADD CONSTRAINT "resposta_item_alternativa_id_fkey" FOREIGN KEY ("alternativa_id") REFERENCES "alternativa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_auditoria" ADD CONSTRAINT "log_auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ===========================================================================
-- Objetos que o Prisma nao modela, escritos a mao.
-- ===========================================================================

-- Integridade do codigo IBGE e da UF na base de municipios.
ALTER TABLE "municipio"
  ADD CONSTRAINT "ck_municipio_codigo_ibge_7_digitos"
  CHECK ("codigo_ibge" BETWEEN 1000000 AND 9999999);

ALTER TABLE "municipio"
  ADD CONSTRAINT "ck_municipio_uf_formato"
  CHECK ("uf" ~ '^[A-Z]{2}$');

-- Vigencia coerente do formulario.
ALTER TABLE "formulario"
  ADD CONSTRAINT "ck_formulario_vigencia"
  CHECK ("vigencia_fim" IS NULL OR "vigencia_inicio" IS NULL OR "vigencia_fim" >= "vigencia_inicio");

-- Controle de duplicidade por dispositivo: uma resposta ativa por formulario.
-- Indice parcial, para que a resposta invalidada nao bloqueie um novo envio
-- e para que a resposta continue existindo no banco (invalidar e mudar status).
CREATE UNIQUE INDEX "uq_resposta_dispositivo_ativo"
  ON "resposta" ("formulario_id", "dispositivo_hash")
  WHERE "status" <> 'INVALIDADA';

-- Fila de conferencia manual (resposta fora da Bahia ou marcada por regra).
CREATE INDEX "ix_resposta_em_conferencia"
  ON "resposta" ("formulario_id", "recebido_em")
  WHERE "status" = 'EM_CONFERENCIA';

-- Expurgo programado dos 4 anos: so as respostas com data definida.
CREATE INDEX "ix_resposta_expurgar_apos"
  ON "resposta" ("expurgar_apos")
  WHERE "expurgar_apos" IS NOT NULL;

-- Geolocalizacao e opcional, mas nunca pela metade.
ALTER TABLE "resposta"
  ADD CONSTRAINT "ck_resposta_geolocalizacao_completa"
  CHECK (("latitude" IS NULL) = ("longitude" IS NULL));

ALTER TABLE "resposta"
  ADD CONSTRAINT "ck_resposta_geolocalizacao_faixa"
  CHECK (
    "latitude" IS NULL
    OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
  );

-- Invalidacao sempre com data e motivo; resposta valida nunca carrega esses campos.
ALTER TABLE "resposta"
  ADD CONSTRAINT "ck_resposta_invalidacao_coerente"
  CHECK (
    ("status" = 'INVALIDADA' AND "invalidada_em" IS NOT NULL AND "motivo_invalidacao" IS NOT NULL)
    OR ("status" <> 'INVALIDADA' AND "invalidada_em" IS NULL)
  );

-- O item guarda alternativa OU valor livre OU valor numerico, nunca dois ao mesmo tempo.
ALTER TABLE "resposta_item"
  ADD CONSTRAINT "ck_resposta_item_valor_unico"
  CHECK (
    (("alternativa_id" IS NOT NULL)::int
      + ("valor_texto" IS NOT NULL)::int
      + ("valor_numero" IS NOT NULL)::int) = 1
  );

-- Documentacao no proprio banco.
COMMENT ON COLUMN "resposta"."dispositivo_hash" IS
  'Hash irreversivel do identificador do dispositivo. Nunca em claro, nunca em log, nunca em resposta de API.';
COMMENT ON COLUMN "resposta"."expurgar_apos" IS
  'Data de expurgo automatico da resposta: 4 anos apos o encerramento da pesquisa.';
COMMENT ON TABLE "resposta" IS
  'Resposta anonima por construcao: nenhum campo identifica o respondente.';
