import { ConfigService } from '@nestjs/config';
import { RespostaMarcacao } from '@prisma/client';

import { AnaliseDeSuspeitaService } from './analise-de-suspeita.service';
import { ItemParaGravar, PerguntaDoFormulario } from './coleta.repository';

describe('AnaliseDeSuspeitaService', () => {
  const config = {
    get: jest.fn((_chave: string, padrao: number) => padrao),
  } as unknown as ConfigService;
  const servico = new AnaliseDeSuspeitaService(config);

  const pergunta = (id: string, ordem: number): PerguntaDoFormulario => ({
    id,
    enunciado: `Pergunta ${ordem}`,
    tipo: 'UNICA_ESCOLHA',
    obrigatoria: true,
    ordem,
    escalaMinimo: null,
    escalaMaximo: null,
    escalaRotuloMinimo: null,
    escalaRotuloMaximo: null,
    condicaoAlternativaId: null,
    condicaoPerguntaId: null,
    alternativas: [
      { id: `${id}-a1`, texto: 'Primeira', ordem: 1 },
      { id: `${id}-a2`, texto: 'Segunda', ordem: 2 },
      { id: `${id}-a3`, texto: 'Terceira', ordem: 3 },
    ],
  });

  const perguntas = [1, 2, 3, 4, 5].map((ordem) => pergunta(`p${ordem}`, ordem));

  const item = (perguntaId: string, alternativaId: string): ItemParaGravar => ({
    perguntaId,
    alternativaId,
    valorTexto: null,
    valorNumero: null,
  });

  /** Respostas variadas, uma por pergunta. */
  const respostasVariadas = [
    item('p1', 'p1-a1'),
    item('p2', 'p2-a3'),
    item('p3', 'p3-a2'),
    item('p4', 'p4-a1'),
    item('p5', 'p5-a2'),
  ];

  const base = {
    perguntas,
    itens: respostasVariadas,
    usosDaOrigemNaJanela: 1,
    municipioForaDaBahia: false,
  };

  it('não marca resposta com tempo e padrão normais', () => {
    const resultado = servico.analisar({ ...base, duracaoSegundos: 90 });

    expect(resultado.marcacoes).toEqual([]);
    expect(resultado.motivo).toBeNull();
  });

  it('marca preenchimento rápido demais', () => {
    const resultado = servico.analisar({ ...base, duracaoSegundos: 3 });

    expect(resultado.marcacoes).toContain(RespostaMarcacao.TEMPO_MUITO_BAIXO);
    expect(resultado.motivo).toContain('rápido demais');
  });

  it('usa o piso absoluto quando o formulário é curto', () => {
    const curto = {
      ...base,
      perguntas: perguntas.slice(0, 2),
      itens: respostasVariadas.slice(0, 2),
    };

    expect(servico.analisar({ ...curto, duracaoSegundos: 10 }).marcacoes).toContain(
      RespostaMarcacao.TEMPO_MUITO_BAIXO,
    );
    expect(servico.analisar({ ...curto, duracaoSegundos: 20 }).marcacoes).not.toContain(
      RespostaMarcacao.TEMPO_MUITO_BAIXO,
    );
  });

  it('marca padrão repetitivo quando tudo cai na mesma posição', () => {
    const repetitivo = [
      item('p1', 'p1-a1'),
      item('p2', 'p2-a1'),
      item('p3', 'p3-a1'),
      item('p4', 'p4-a1'),
      item('p5', 'p5-a1'),
    ];

    const resultado = servico.analisar({ ...base, itens: repetitivo, duracaoSegundos: 120 });

    expect(resultado.marcacoes).toContain(RespostaMarcacao.PADRAO_REPETITIVO);
  });

  it('não marca padrão repetitivo com poucas perguntas de escolha', () => {
    const poucas = [item('p1', 'p1-a1'), item('p2', 'p2-a1'), item('p3', 'p3-a1')];

    const resultado = servico.analisar({ ...base, itens: poucas, duracaoSegundos: 120 });

    expect(resultado.marcacoes).not.toContain(RespostaMarcacao.PADRAO_REPETITIVO);
  });

  it('marca volume anômalo da mesma origem', () => {
    const resultado = servico.analisar({
      ...base,
      duracaoSegundos: 120,
      usosDaOrigemNaJanela: 40,
    });

    expect(resultado.marcacoes).toContain(RespostaMarcacao.VOLUME_ANOMALO_DA_ORIGEM);
  });

  it('marca município fora da Bahia', () => {
    const resultado = servico.analisar({
      ...base,
      duracaoSegundos: 120,
      municipioForaDaBahia: true,
    });

    expect(resultado.marcacoes).toEqual([RespostaMarcacao.MUNICIPIO_FORA_DA_BAHIA]);
  });

  it('acumula marcações e resume o motivo', () => {
    const resultado = servico.analisar({
      ...base,
      duracaoSegundos: 1,
      usosDaOrigemNaJanela: 40,
      municipioForaDaBahia: true,
      itens: [item('p1', 'p1-a1'), item('p2', 'p2-a1'), item('p3', 'p3-a1'), item('p4', 'p4-a1')],
    });

    expect(resultado.marcacoes).toHaveLength(4);
    expect(resultado.motivo).not.toBeNull();
    expect(resultado.motivo!.length).toBeLessThanOrEqual(240);
  });
});
