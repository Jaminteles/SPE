/**
 * Teste de carga reduzido da coleta pública.
 *
 * Antecipado de propósito: descobrir gargalo de infraestrutura agora custa
 * barato; descobrir na véspera da coleta real, não.
 *
 * O que ele exercita é o caminho completo do respondente — abrir a pesquisa
 * (que cria sessão) e enviar a resposta (que valida, analisa suspeita e grava
 * resposta + itens em transação).
 *
 *   API_URL=http://localhost:3000/api/v1 \
 *   TOKEN_PESQUISA=<token público> \
 *   CONCORRENCIA=20 TOTAL=200 \
 *   npm run teste-de-carga
 *
 * Para o porte projetado (pico de 300 envios por minuto, sustentado), use RPM:
 *
 *   TOKEN_PESQUISA=<token> RPM=300 TOTAL=1500 CONCORRENCIA=30 npm run teste-de-carga
 *
 * Com RPM o disparo é controlado por relógio: o teste mede se a API aguenta o
 * ritmo do pico, não quantos pedidos cabem de uma vez.
 *
 * Nenhum dado pessoal é gerado: o identificador de dispositivo é aleatório e
 * descartável, como o de um aparelho real.
 */
import { randomUUID } from 'node:crypto';

interface PerguntaPublica {
  id: string;
  tipo: 'UNICA_ESCOLHA' | 'MULTIPLA_ESCOLHA' | 'ESCALA' | 'TEXTO_LIVRE' | 'NUMERO';
  obrigatoria: boolean;
  escalaMinimo: number | null;
  escalaMaximo: number | null;
  condicaoAlternativaId: string | null;
  alternativas: { id: string }[];
}

interface FormularioPublico {
  sessao: string;
  perguntas: PerguntaPublica[];
}

interface Medida {
  ok: boolean;
  status: number;
  msAbertura: number;
  msEnvio: number;
}

const API_URL = process.env.API_URL ?? 'http://localhost:3000/api/v1';
const TOKEN = process.env.TOKEN_PESQUISA ?? '';
const CONCORRENCIA = Number(process.env.CONCORRENCIA ?? 10);
const TOTAL = Number(process.env.TOTAL ?? 100);
const CODIGO_IBGE = Number(process.env.MUNICIPIO_IBGE ?? 2927408);
/** Ritmo alvo em envios por minuto. Zero (padrão) dispara sem freio. */
const RPM = Number(process.env.RPM ?? 0);
/** Teto aceitável do p95 de envio, em ms, para o teste dar veredito. */
const META_P95_MS = Number(process.env.META_P95_MS ?? 1500);

function percentil(valores: number[], p: number): number {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const indice = Math.min(ordenados.length - 1, Math.floor((p / 100) * ordenados.length));
  return Math.round(ordenados[indice]);
}

/** Responde só o que está visível, respeitando a lógica condicional. */
function montarItens(perguntas: PerguntaPublica[]) {
  const itens: {
    perguntaId: string;
    alternativaId?: string;
    valorNumero?: number;
    valorTexto?: string;
  }[] = [];

  for (const pergunta of perguntas) {
    if (pergunta.condicaoAlternativaId) {
      continue;
    }
    if (!pergunta.obrigatoria) {
      continue;
    }

    switch (pergunta.tipo) {
      case 'UNICA_ESCOLHA':
      case 'MULTIPLA_ESCOLHA': {
        const alternativa =
          pergunta.alternativas[Math.floor(Math.random() * pergunta.alternativas.length)];
        if (alternativa) {
          itens.push({ perguntaId: pergunta.id, alternativaId: alternativa.id });
        }
        break;
      }
      case 'ESCALA': {
        const minimo = pergunta.escalaMinimo ?? 0;
        const maximo = pergunta.escalaMaximo ?? 10;
        itens.push({
          perguntaId: pergunta.id,
          valorNumero: minimo + Math.floor(Math.random() * (maximo - minimo + 1)),
        });
        break;
      }
      case 'NUMERO':
        itens.push({ perguntaId: pergunta.id, valorNumero: Math.floor(Math.random() * 40) });
        break;
      case 'TEXTO_LIVRE':
        itens.push({ perguntaId: pergunta.id, valorTexto: 'Resposta gerada por teste de carga.' });
        break;
    }
  }

  return itens;
}

async function umaResposta(): Promise<Medida> {
  const inicioAbertura = performance.now();
  const abertura = await fetch(`${API_URL}/coleta/${TOKEN}`);
  const msAbertura = performance.now() - inicioAbertura;

  if (!abertura.ok) {
    return { ok: false, status: abertura.status, msAbertura, msEnvio: 0 };
  }

  const publico = (await abertura.json()) as FormularioPublico;

  const inicioEnvio = performance.now();
  const envio = await fetch(`${API_URL}/coleta/${TOKEN}/respostas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      respostaId: randomUUID(),
      sessao: publico.sessao,
      consentimento: true,
      consentimentoEm: new Date().toISOString(),
      municipioCodigoIbge: CODIGO_IBGE,
      dispositivoId: `carga-${randomUUID()}`,
      coletadoEm: new Date().toISOString(),
      origem: 'WEB',
      itens: montarItens(publico.perguntas),
    }),
  });
  const msEnvio = performance.now() - inicioEnvio;

  return { ok: envio.ok, status: envio.status, msAbertura, msEnvio };
}

async function main() {
  if (!TOKEN) {
    throw new Error('TOKEN_PESQUISA não informado.');
  }

  console.log(`Carga: ${TOTAL} respostas, ${CONCORRENCIA} simultâneas, contra ${API_URL}`);

  if (RPM > 0) {
    console.log(`Ritmo alvo: ${RPM} envios/min (${(RPM / 60).toFixed(1)}/s)`);
  }

  const medidas: Medida[] = [];
  const inicio = performance.now();
  let proxima = 0;

  const intervaloMs = RPM > 0 ? 60_000 / RPM : 0;
  const espera = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

  const trabalhador = async () => {
    while (proxima < TOTAL) {
      const indice = proxima;
      proxima += 1;

      // Com ritmo alvo, cada envio tem hora marcada: atraso acumulado vira
      // fila de espera, que é exatamente o que se quer medir no pico.
      if (intervaloMs > 0) {
        const atrasoDoSlot = inicio + indice * intervaloMs - performance.now();
        if (atrasoDoSlot > 0) {
          await espera(atrasoDoSlot);
        }
      }

      medidas.push(await umaResposta());
    }
  };

  await Promise.all(Array.from({ length: CONCORRENCIA }, trabalhador));
  const duracaoSegundos = (performance.now() - inicio) / 1000;

  const sucessos = medidas.filter((medida) => medida.ok);
  const porStatus = new Map<number, number>();
  for (const medida of medidas) {
    porStatus.set(medida.status, (porStatus.get(medida.status) ?? 0) + 1);
  }

  const enviosOk = sucessos.map((medida) => medida.msEnvio);
  const aberturas = medidas.map((medida) => medida.msAbertura);

  console.log('');
  console.log(`Duração total:      ${duracaoSegundos.toFixed(1)} s`);
  console.log(`Vazão:              ${(medidas.length / duracaoSegundos).toFixed(1)} req/s`);
  console.log(`Sucesso:            ${sucessos.length}/${medidas.length}`);
  console.log(
    `Status:             ${[...porStatus.entries()]
      .map(([status, total]) => `${status}=${total}`)
      .join(' ')}`,
  );
  console.log(
    `Abertura p50/p95:   ${percentil(aberturas, 50)} ms / ${percentil(aberturas, 95)} ms`,
  );
  console.log(`Envio p50/p95:      ${percentil(enviosOk, 50)} ms / ${percentil(enviosOk, 95)} ms`);
  console.log(
    `Envio máximo:       ${enviosOk.length > 0 ? Math.round(Math.max(...enviosOk)) : 0} ms`,
  );

  // Veredito explícito: teste de carga sem critério é gráfico bonito.
  const p95 = percentil(enviosOk, 95);
  const vazaoPorMinuto = (medidas.length / duracaoSegundos) * 60;
  const semFalha = sucessos.length === medidas.length;
  const noRitmo = RPM === 0 || vazaoPorMinuto >= RPM * 0.95;
  const aprovado = semFalha && noRitmo && p95 <= META_P95_MS;

  console.log('');
  console.log(`Vazão sustentada:   ${vazaoPorMinuto.toFixed(0)} envios/min`);
  console.log(`Meta de p95:        ${META_P95_MS} ms`);
  console.log(`Veredito:           ${aprovado ? 'APROVADO' : 'REPROVADO'}`);
  if (!aprovado) {
    if (!semFalha) console.log('  - houve envio recusado ou com erro');
    if (!noRitmo) console.log('  - a vazão ficou abaixo do ritmo alvo');
    if (p95 > META_P95_MS) console.log('  - o p95 de envio passou da meta');
    process.exitCode = 1;
  }
}

main().catch((erro) => {
  console.error('Falha no teste de carga:', erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
