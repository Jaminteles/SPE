-- ===========================================================================
-- Perfil PESQUISADOR.
--
-- Nasce com o cadastro aberto: quem se registra sozinho cria e gerencia as
-- PROPRIAS pesquisas, e nao enxerga nem toca nas dos outros. Nao gerencia
-- usuario nenhum — isso continua sendo do Administrador.
--
-- ADMINISTRADOR e ANALISTA seguem vendo tudo. O Administrador porque precisa
-- dar suporte e conter abuso; o Analista porque e conta criada por um
-- Administrador justamente para ler resultado da equipe.
--
-- Em duas migrations de proposito: o PostgreSQL aceita ADD VALUE dentro de
-- transacao, mas recusa USAR o valor novo na mesma transacao. O registro do
-- perfil vem na migration seguinte.
-- ===========================================================================

ALTER TYPE "perfil_codigo" ADD VALUE IF NOT EXISTS 'PESQUISADOR';
