/**
 * Popula a base no porte projetado, para o teste de carga medir leitura e
 * escrita com volume real: 100 mil respostas espalhadas pelos municípios da
 * Bahia e por vários dias de coleta.
 *
 *   DATABASE_URL=... FORMULARIO_ID=<uuid> TOTAL=100000 \
 *   npx ts-node prisma/scripts/popular-base-de-carga.ts
 *
 * O que ele gera é dado sintético e anônimo: o identificador de dispositivo é
 * um hash aleatório, como o de um aparelho real, e nenhum campo carrega nome,
 * documento, telefone ou e-mail. Não existe "usuário de teste" com dado
 * pessoal aqui.
 *
 * Só roda em base que não seja de produção: a checagem abaixo é proposital.
 */
import { PrismaClient, RespostaStatus } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';

const prisma = new PrismaClient();

const FORMULARIO_ID = process.env.FORMULARIO_ID ?? '';
const TOTAL = Number(process.env.TOTAL ?? 100_000);
const LOTE = Number(process.env.LOTE ?? 2_000);
const DIAS = Number(process.env.DIAS ?? 30);
/** Proporção de respostas invalidadas, para o painel ter o que descontar. */
const FRACAO_INVALIDADA = 40;

function hashDeDispositivo(): string {
  return randomBytes(32).toString('hex');
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Este script não roda com NODE_ENV=production.');
  }
  if (!FORMULARIO_ID) {
    throw new Error('FORMULARIO_ID não informado.');
  }

  const formulario = await prisma.formulario.findUnique({
    where: { id: FORMULARIO_ID },
    select: { id: true, titulo: true, status: true },
  });
  if (!formulario) {
    throw new Error(`Formulário ${FORMULARIO_ID} não encontrado.`);
  }

  const perguntas = await prisma.pergunta.findMany({
    where: { formularioId: FORMULARIO_ID },
    select: { id: true, alternativas: { select: { id: true } } },
  });
  const comAlternativa = perguntas.filter((pergunta) => pergunta.alternativas.length > 0);
  if (comAlternativa.length === 0) {
    throw new Error('O formulário não tem pergunta com alternativa: nada a distribuir.');
  }

  const municipios = await prisma.municipio.findMany({
    where: { uf: 'BA' },
    select: { codigoIbge: true },
  });
  if (municipios.length === 0) {
    throw new Error('Base de municípios vazia. Rode o seed antes.');
  }

  console.log(
    `Populando ${TOTAL} respostas em "${formulario.titulo}" (${municipios.length} municípios, ${DIAS} dias).`,
  );

  const inicio = Date.now();
  let gravadas = 0;

  while (gravadas < TOTAL) {
    const tamanho = Math.min(LOTE, TOTAL - gravadas);
    const respostas = [];
    const itens: { respostaId: string; perguntaId: string; alternativaId: string }[] = [];

    for (let indice = 0; indice < tamanho; indice += 1) {
      const id = randomUUID();
      const posicao = gravadas + indice;
      const momento = new Date(Date.now() - (posicao % DIAS) * 24 * 60 * 60 * 1000);
      const invalidada = posicao % FRACAO_INVALIDADA === 0;

      respostas.push({
        id,
        formularioId: FORMULARIO_ID,
        // Distribuição desigual de propósito: município grande concentra
        // resposta, como na coleta real.
        municipioCodigoIbge:
          municipios[posicao % 3 === 0 ? 0 : posicao % municipios.length].codigoIbge,
        status: invalidada ? RespostaStatus.INVALIDADA : RespostaStatus.VALIDA,
        origem: 'APLICATIVO' as const,
        dispositivoHash: hashDeDispositivo(),
        consentimentoEm: momento,
        iniciadoEm: momento,
        coletadoEm: momento,
        recebidoEm: momento,
        duracaoSegundos: 60 + (posicao % 120),
        invalidadaEm: invalidada ? momento : null,
        motivoInvalidacao: invalidada ? 'Carga sintética' : null,
      });

      for (const pergunta of comAlternativa) {
        const alternativa =
          pergunta.alternativas[
            (posicao + pergunta.alternativas.length) % pergunta.alternativas.length
          ];
        itens.push({ respostaId: id, perguntaId: pergunta.id, alternativaId: alternativa.id });
      }
    }

    await prisma.$transaction([
      prisma.resposta.createMany({ data: respostas }),
      prisma.respostaItem.createMany({ data: itens }),
    ]);

    gravadas += tamanho;
    process.stdout.write(`\r  ${gravadas}/${TOTAL}`);
  }

  const segundos = (Date.now() - inicio) / 1000;
  console.log('');
  console.log(`Concluído em ${segundos.toFixed(1)} s (${(TOTAL / segundos).toFixed(0)} resp/s).`);
  console.log('Agora atualize as agregações: POST /api/v1/agregacao/atualizar (Administrador).');
}

main()
  .catch((erro) => {
    console.error('Falha ao popular:', erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
