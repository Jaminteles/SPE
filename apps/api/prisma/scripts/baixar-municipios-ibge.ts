/**
 * Baixa a lista oficial de municípios da Bahia da API de localidades do IBGE
 * e grava em prisma/data/municipios-ba.json.
 *
 * O arquivo gerado é versionado: o seed roda offline, sem depender da rede.
 * Rodar apenas quando houver alteração na base do IBGE.
 *
 *   npm run municipios:sync
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const UF_BAHIA = 29;
const TOTAL_ESPERADO = 417;
const URL = `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${UF_BAHIA}/municipios`;
const TIMEOUT_MS = 30_000;
const DESTINO = resolve(__dirname, '..', 'data', 'municipios-ba.json');

type MunicipioIbge = { id: number; nome: string };

async function baixar(): Promise<MunicipioIbge[]> {
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    const resposta = await fetch(URL, { signal: controlador.signal });
    if (!resposta.ok) {
      throw new Error(`IBGE respondeu ${resposta.status}`);
    }
    return (await resposta.json()) as MunicipioIbge[];
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const bruto = await baixar();

  if (bruto.length !== TOTAL_ESPERADO) {
    throw new Error(
      `Esperados ${TOTAL_ESPERADO} municípios da Bahia, recebidos ${bruto.length}. ` +
        'Confira a base do IBGE antes de sobrescrever o arquivo.',
    );
  }

  const municipios = bruto
    .map((m) => ({ codigoIbge: m.id, nome: m.nome, uf: 'BA' }))
    .sort((a, b) => a.codigoIbge - b.codigoIbge);

  const codigos = new Set(municipios.map((m) => m.codigoIbge));
  if (codigos.size !== municipios.length) {
    throw new Error('A base do IBGE trouxe código de município repetido.');
  }
  if (
    municipios.some((m) => !Number.isInteger(m.codigoIbge) || String(m.codigoIbge).length !== 7)
  ) {
    throw new Error('Código IBGE fora do formato de 7 dígitos.');
  }

  writeFileSync(DESTINO, `${JSON.stringify(municipios, null, 2)}\n`, 'utf8');
  console.log(`${municipios.length} municípios gravados em ${DESTINO}`);
}

main().catch((erro) => {
  console.error('Falha ao baixar a base de municípios do IBGE:', erro.message);
  process.exit(1);
});
