/**
 * Seed determinístico e idempotente.
 *
 * Carrega apenas dado de referência: perfis de acesso e a base oficial de
 * municípios da Bahia (417 registros do IBGE). Não cria usuário e não cria
 * dado de resposta.
 *
 *   npm run seed
 */
import { PrismaClient, PerfilCodigo } from '@prisma/client';

import municipiosBa from './data/municipios-ba.json';

const prisma = new PrismaClient();

const TOTAL_MUNICIPIOS_BA = 417;

const PERFIS: { codigo: PerfilCodigo; nome: string; descricao: string }[] = [
  {
    codigo: PerfilCodigo.ADMINISTRADOR,
    nome: 'Administrador',
    descricao: 'Gerencia formulários, usuários, integridade e encerramento da coleta.',
  },
  {
    codigo: PerfilCodigo.ANALISTA,
    nome: 'Analista',
    descricao: 'Consulta resultados agregados e exporta dados.',
  },
  {
    codigo: PerfilCodigo.PESQUISADOR,
    nome: 'Pesquisador',
    descricao: 'Cria e gerencia as próprias pesquisas. Não enxerga pesquisa de outro usuário.',
  },
];

async function carregarPerfis() {
  for (const perfil of PERFIS) {
    await prisma.perfil.upsert({
      where: { codigo: perfil.codigo },
      update: { nome: perfil.nome, descricao: perfil.descricao },
      create: perfil,
    });
  }
  console.log(`Perfis carregados: ${PERFIS.length}`);
}

async function carregarMunicipios() {
  if (municipiosBa.length !== TOTAL_MUNICIPIOS_BA) {
    throw new Error(
      `A base de municípios tem ${municipiosBa.length} registros; esperados ${TOTAL_MUNICIPIOS_BA}. ` +
        'Rode npm run municipios:sync para atualizar a partir do IBGE.',
    );
  }

  const foraDaBahia = municipiosBa.filter((m) => m.uf !== 'BA');
  if (foraDaBahia.length > 0) {
    throw new Error('A base de municípios contém registro fora da Bahia.');
  }

  for (const municipio of municipiosBa) {
    await prisma.municipio.upsert({
      where: { codigoIbge: municipio.codigoIbge },
      update: { nome: municipio.nome, uf: municipio.uf },
      create: municipio,
    });
  }

  const total = await prisma.municipio.count({ where: { uf: 'BA' } });
  console.log(`Municípios da Bahia carregados: ${total}`);
}

async function main() {
  await carregarPerfis();
  await carregarMunicipios();
}

main()
  .catch((erro) => {
    console.error('Falha no seed:', erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
