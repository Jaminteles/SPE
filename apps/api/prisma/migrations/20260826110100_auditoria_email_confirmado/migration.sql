-- Confirmacao de e-mail vira evento de auditoria proprio.
--
-- Usar USUARIO_ALTERADO no lugar juntaria numa mesma acao coisas de peso
-- diferente: trocar o nome e provar a posse do e-mail que destranca a conta.
--
-- O valor so e USADO em tempo de execucao, nunca nesta transacao — que e a
-- restricao do PostgreSQL para ADD VALUE.
ALTER TYPE "auditoria_acao" ADD VALUE IF NOT EXISTS 'EMAIL_CONFIRMADO';
