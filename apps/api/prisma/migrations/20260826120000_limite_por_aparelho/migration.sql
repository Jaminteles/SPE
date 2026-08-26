-- ===========================================================================
-- Teto de respostas por aparelho.
--
-- A contagem roda a cada envio, e sem indice ela varreria a tabela de respostas
-- inteira — justamente a tabela que mais cresce. O indice cobre exatamente o
-- filtro usado: hash do aparelho + janela de tempo.
--
-- Parcial, excluindo hash nulo: depois do expurgo tecnico o hash vira NULL e
-- essas linhas nao interessam a nenhuma contagem de aparelho. Deixa-las de fora
-- mantem o indice do tamanho da coleta ativa, nao do historico inteiro.
-- ===========================================================================

CREATE INDEX "ix_resposta_dispositivo_recebido"
  ON "resposta"("dispositivo_hash", "recebido_em")
  WHERE "dispositivo_hash" IS NOT NULL;

COMMENT ON INDEX "ix_resposta_dispositivo_recebido" IS
  'Serve ao teto de respostas por aparelho por hora, conferido em cada envio.';
