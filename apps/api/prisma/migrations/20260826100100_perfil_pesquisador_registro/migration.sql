-- Registro do perfil PESQUISADOR. Separado da migration que criou o valor no
-- enum porque o PostgreSQL nao deixa usar o valor novo na mesma transacao.
INSERT INTO "perfil" ("id", "codigo", "nome", "descricao", "criado_em")
VALUES (
  gen_random_uuid(),
  'PESQUISADOR',
  'Pesquisador',
  'Cria e gerencia as proprias pesquisas. Nao enxerga pesquisa de outro usuario.',
  now()
)
ON CONFLICT ("codigo") DO NOTHING;
