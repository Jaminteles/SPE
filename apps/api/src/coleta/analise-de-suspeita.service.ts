import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RespostaMarcacao } from '@prisma/client';

import { ItemParaGravar, PerguntaDoFormulario } from './coleta.repository';

export interface EntradaDaAnalise {
  duracaoSegundos: number;
  perguntas: PerguntaDoFormulario[];
  itens: ItemParaGravar[];
  usosDaOrigemNaJanela: number;
  municipioForaDaBahia: boolean;
}

export interface ResultadoDaAnalise {
  marcacoes: RespostaMarcacao[];
  motivo: string | null;
}

const DESCRICAO: Record<RespostaMarcacao, string> = {
  TEMPO_MUITO_BAIXO: 'preenchimento rápido demais',
  PADRAO_REPETITIVO: 'padrão repetitivo de alternativas',
  VOLUME_ANOMALO_DA_ORIGEM: 'volume anômalo da mesma origem',
  MUNICIPIO_FORA_DA_BAHIA: 'município fora da Bahia',
};

/**
 * Marcação automática de resposta suspeita.
 *
 * Marcar **não descarta e não invalida**: manda para conferência humana. O
 * Administrador decide. Uma resposta legítima respondida por alguém apressado
 * não pode sumir da apuração por decisão de heurística.
 *
 * Os limites são configuráveis porque dependem do tamanho do questionário e do
 * público — não são verdade universal.
 */
@Injectable()
export class AnaliseDeSuspeitaService {
  /** Piso absoluto: abaixo disso não houve leitura, qualquer que seja o formulário. */
  private static readonly SEGUNDOS_MINIMOS_PADRAO = 15;

  /** Tempo mínimo esperado por pergunta visível. */
  private static readonly SEGUNDOS_POR_PERGUNTA_PADRAO = 2;

  private static readonly JANELA_ORIGEM_MIN_PADRAO = 10;
  private static readonly LIMITE_ORIGEM_PADRAO = 15;

  /** Mínimo de perguntas de escolha para o padrão repetitivo significar algo. */
  private static readonly MINIMO_PARA_PADRAO = 4;

  constructor(private readonly config: ConfigService) {}

  get janelaDaOrigemEmMinutos(): number {
    return this.config.get<number>(
      'COLETA_JANELA_ORIGEM_MIN',
      AnaliseDeSuspeitaService.JANELA_ORIGEM_MIN_PADRAO,
    );
  }

  analisar(entrada: EntradaDaAnalise): ResultadoDaAnalise {
    const marcacoes: RespostaMarcacao[] = [];

    if (entrada.municipioForaDaBahia) {
      marcacoes.push(RespostaMarcacao.MUNICIPIO_FORA_DA_BAHIA);
    }
    if (this.rapidoDemais(entrada)) {
      marcacoes.push(RespostaMarcacao.TEMPO_MUITO_BAIXO);
    }
    if (this.padraoRepetitivo(entrada)) {
      marcacoes.push(RespostaMarcacao.PADRAO_REPETITIVO);
    }
    if (entrada.usosDaOrigemNaJanela > this.limiteDaOrigem()) {
      marcacoes.push(RespostaMarcacao.VOLUME_ANOMALO_DA_ORIGEM);
    }

    return {
      marcacoes,
      motivo:
        marcacoes.length > 0
          ? marcacoes
              .map((marcacao) => DESCRICAO[marcacao])
              .join('; ')
              .slice(0, 240)
          : null,
    };
  }

  private rapidoDemais(entrada: EntradaDaAnalise): boolean {
    const piso = this.config.get<number>(
      'COLETA_SEGUNDOS_MINIMOS',
      AnaliseDeSuspeitaService.SEGUNDOS_MINIMOS_PADRAO,
    );
    const porPergunta = this.config.get<number>(
      'COLETA_SEGUNDOS_POR_PERGUNTA',
      AnaliseDeSuspeitaService.SEGUNDOS_POR_PERGUNTA_PADRAO,
    );

    const respondidas = new Set(entrada.itens.map((item) => item.perguntaId)).size;
    const esperado = Math.max(piso, respondidas * porPergunta);

    return entrada.duracaoSegundos < esperado;
  }

  /**
   * Padrão repetitivo: todas as escolhas caíram na mesma posição da lista
   * (primeira opção sempre, última opção sempre). É a assinatura de quem
   * clicou no automático ou de script ingênuo.
   */
  private padraoRepetitivo(entrada: EntradaDaAnalise): boolean {
    const posicoes: number[] = [];

    for (const item of entrada.itens) {
      if (!item.alternativaId) {
        continue;
      }
      const pergunta = entrada.perguntas.find((candidata) => candidata.id === item.perguntaId);
      const alternativa = pergunta?.alternativas.find(
        (candidata) => candidata.id === item.alternativaId,
      );
      if (alternativa) {
        posicoes.push(alternativa.ordem);
      }
    }

    if (posicoes.length < AnaliseDeSuspeitaService.MINIMO_PARA_PADRAO) {
      return false;
    }
    return new Set(posicoes).size === 1;
  }

  private limiteDaOrigem(): number {
    return this.config.get<number>(
      'COLETA_LIMITE_ORIGEM',
      AnaliseDeSuspeitaService.LIMITE_ORIGEM_PADRAO,
    );
  }
}
