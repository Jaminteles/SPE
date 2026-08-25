/**
 * Cria a pesquisa "Eleições 2026" com as onze perguntas já definidas.
 *
 * Existe para não montar formulário longo a mão na interface, onde errar a
 * ordem de uma alternativa é fácil e conferir é caro. O formulário nasce em
 * RASCUNHO: publicar continua sendo ação do Administrador pela interface, que é
 * onde o link e o QR Code são gerados.
 *
 * É idempotente pelo título: se a pesquisa já existir, não faz nada e não
 * sobrescreve — rodar duas vezes não duplica nem apaga resposta coletada.
 *
 *   npm run criar-pesquisa
 *
 * O autor é o Administrador mais antigo ativo, ou quem for indicado em
 * ADMIN_EMAIL. Sem administrador na base o script recusa: formulário sem autor
 * quebra a trilha de auditoria.
 */
import { AuditoriaAcao, PerfilCodigo, PerguntaTipo, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TITULO = 'Pesquisa de Opinião — Eleições 2026';

const DESCRICAO = [
  'Pesquisa independente de opinião pública sobre as eleições de 2026.',
  'A participação é voluntária e as respostas serão utilizadas exclusivamente para análise estatística.',
  'Não informe nome, CPF ou outros dados pessoais.',
].join(' ');

const AVALIACAO = ['Ótimo', 'Bom', 'Regular', 'Ruim', 'Péssimo', 'Não sei avaliar'];

type Definicao = {
  enunciado: string;
  tipo: PerguntaTipo;
  alternativas?: string[];
  escala?: { minimo: number; maximo: number; rotuloMinimo: string; rotuloMaximo: string };
};

/**
 * Todas as perguntas de lista são UNICA_ESCOLHA: cada uma pede uma resposta só
 * ("o principal problema", "em quem votaria"), e as alternativas se excluem.
 * MULTIPLA_ESCOLHA existe no sistema para quando o respondente pode marcar mais
 * de uma — não é o caso de nenhuma delas.
 */
const PERGUNTAS: Definicao[] = [
  {
    enunciado: 'Em qual cidade você mora?',
    tipo: PerguntaTipo.TEXTO_LIVRE,
  },
  {
    enunciado: 'Como você avalia o atual prefeito da sua cidade?',
    tipo: PerguntaTipo.UNICA_ESCOLHA,
    alternativas: AVALIACAO,
  },
  {
    enunciado: 'Se a eleição para prefeito fosse hoje, você votaria novamente no atual prefeito?',
    tipo: PerguntaTipo.UNICA_ESCOLHA,
    alternativas: ['Sim', 'Não', 'Talvez', 'Ainda não sei'],
  },
  {
    enunciado: 'Se a eleição para Presidente da República fosse hoje, em quem você votaria?',
    tipo: PerguntaTipo.UNICA_ESCOLHA,
    alternativas: ['Lula', 'Flávio Bolsonaro', 'Outro candidato', 'Branco/Nulo', 'Ainda não sei'],
  },
  {
    enunciado: 'Se a eleição para Governador da Bahia fosse hoje, em quem você votaria?',
    tipo: PerguntaTipo.UNICA_ESCOLHA,
    alternativas: [
      'Jerônimo Rodrigues',
      'ACM Neto',
      'Outro candidato',
      'Branco/Nulo',
      'Ainda não sei',
    ],
  },
  {
    enunciado: 'Como você avalia o atual Governo da Bahia?',
    tipo: PerguntaTipo.UNICA_ESCOLHA,
    alternativas: AVALIACAO,
  },
  {
    enunciado: 'Qual é hoje o principal problema da sua cidade?',
    tipo: PerguntaTipo.UNICA_ESCOLHA,
    alternativas: [
      'Segurança',
      'Saúde',
      'Educação',
      'Emprego',
      'Infraestrutura',
      'Transporte',
      'Saneamento',
      'Custo de vida',
      'Corrupção',
      'Outro',
    ],
  },
  {
    enunciado: 'Qual deveria ser a principal prioridade do próximo governador da Bahia?',
    tipo: PerguntaTipo.UNICA_ESCOLHA,
    alternativas: [
      'Segurança pública',
      'Saúde',
      'Educação',
      'Emprego e renda',
      'Estradas',
      'Agricultura',
      'Infraestrutura',
      'Combate à corrupção',
      'Outra',
    ],
  },
  {
    enunciado: 'Qual deveria ser a principal prioridade do próximo Presidente?',
    tipo: PerguntaTipo.UNICA_ESCOLHA,
    alternativas: [
      'Segurança pública',
      'Saúde',
      'Educação',
      'Emprego e renda',
      'Economia',
      'Combate à corrupção',
      'Redução de impostos',
      'Programas sociais',
      'Outra',
    ],
  },
  {
    enunciado: 'Você já decidiu seu voto?',
    tipo: PerguntaTipo.UNICA_ESCOLHA,
    alternativas: [
      'Sim, definitivamente',
      'Tenho preferência, mas posso mudar',
      'Estou indeciso',
      'Não pretendo votar',
    ],
  },
  {
    enunciado: 'De 0 a 10, qual a possibilidade de você mudar seu voto?',
    tipo: PerguntaTipo.ESCALA,
    escala: {
      minimo: 0,
      maximo: 10,
      rotuloMinimo: 'Não mudaria',
      rotuloMaximo: 'Posso mudar completamente',
    },
  },
];

async function main(): Promise<void> {
  const existente = await prisma.formulario.findFirst({
    where: { titulo: TITULO },
    select: { id: true, status: true },
  });

  if (existente) {
    console.log(
      `Pesquisa "${TITULO}" já existe (${existente.id}, ${existente.status}). Nada a fazer.`,
    );
    return;
  }

  const emailIndicado = process.env.ADMIN_EMAIL?.trim().toLowerCase();

  const autor = await prisma.usuario.findFirst({
    where: {
      ativo: true,
      perfil: { codigo: PerfilCodigo.ADMINISTRADOR },
      ...(emailIndicado ? { email: emailIndicado } : {}),
    },
    orderBy: { criadoEm: 'asc' },
    select: { id: true, email: true },
  });

  if (!autor) {
    throw new Error(
      emailIndicado
        ? `Nenhum Administrador ativo com o e-mail ${emailIndicado}.`
        : 'Nenhum Administrador ativo na base. Rode criar-admin antes.',
    );
  }

  const formulario = await prisma.$transaction(async (tx) => {
    const criado = await tx.formulario.create({
      data: { titulo: TITULO, descricao: DESCRICAO, criadoPorId: autor.id },
      select: { id: true },
    });

    for (const [indice, definicao] of PERGUNTAS.entries()) {
      await tx.pergunta.create({
        data: {
          formularioId: criado.id,
          enunciado: definicao.enunciado,
          tipo: definicao.tipo,
          obrigatoria: true,
          ordem: indice + 1,
          escalaMinimo: definicao.escala?.minimo ?? null,
          escalaMaximo: definicao.escala?.maximo ?? null,
          escalaRotuloMinimo: definicao.escala?.rotuloMinimo ?? null,
          escalaRotuloMaximo: definicao.escala?.rotuloMaximo ?? null,
          alternativas: definicao.alternativas
            ? {
                create: definicao.alternativas.map((texto, posicao) => ({
                  texto,
                  ordem: posicao + 1,
                })),
              }
            : undefined,
        },
      });
    }

    await tx.logAuditoria.create({
      data: {
        usuarioId: autor.id,
        acao: AuditoriaAcao.FORMULARIO_CRIADO,
        entidade: 'formulario',
        entidadeId: criado.id,
        detalhe: { titulo: TITULO, perguntas: PERGUNTAS.length, origem: 'script criar-pesquisa' },
      },
    });

    return criado;
  });

  const alternativas = PERGUNTAS.reduce((total, p) => total + (p.alternativas?.length ?? 0), 0);

  console.log(`Pesquisa criada: ${formulario.id}`);
  console.log(`Autor: ${autor.email}`);
  console.log(`Perguntas: ${PERGUNTAS.length} · Alternativas: ${alternativas}`);
  console.log('Status: RASCUNHO — publique pela interface para gerar link e QR Code.');
}

main()
  .catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
