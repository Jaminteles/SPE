import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditoriaAcao } from '@prisma/client';

import { TarefaPeriodica } from '../common/tarefas/tarefa-periodica';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ExpurgoRepository } from './expurgo.repository';

export interface ResumoDoExpurgo {
  pesquisasAnonimizadas: number;
  dispositivosApagados: number;
  sessoesApagadas: number;
  respostasApagadas: number;
  em: Date;
}

/**
 * Rotina de expurgo (LGPD).
 *
 * Dois prazos, os dois automáticos — nunca botão de tela:
 *
 * - **dados técnicos de duplicidade**: expurgados no encerramento da coleta.
 *   O hash de dispositivo vira nulo e as sessões de coleta somem. Encerrada a
 *   coleta, esses dados perderam finalidade;
 * - **respostas**: apagadas 4 anos depois do encerramento, em lotes.
 *
 * A rotina é idempotente: o expurgo técnico trava em `expurgo_tecnico_em` e a
 * remoção por prazo é uma consulta sobre o que ainda existe. Repetir a tarefa
 * não apaga nada a mais nem quebra nada.
 *
 * A rotina roda numa tarefa periódica em processo. `EXPURGO_INTERVALO_HORAS`
 * igual a zero desliga o ciclo e deixa a execução só sob demanda.
 */
@Injectable()
export class ExpurgoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExpurgoService.name);

  private tarefa: TarefaPeriodica | null = null;

  private static readonly TENTATIVAS = 5;
  private static readonly BACKOFF_MS = 60_000;
  /** Teto de pesquisas tratadas por execução: o job não pode virar maratona. */
  private static readonly PESQUISAS_POR_CICLO = 20;

  constructor(
    private readonly repositorio: ExpurgoRepository,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const horas = this.config.get<number>('EXPURGO_INTERVALO_HORAS', 24);

    if (horas <= 0 || this.config.get<string>('NODE_ENV') === 'test') {
      this.logger.warn('Ciclo de expurgo desligado. Execução só sob demanda.');
      return;
    }

    this.tarefa = new TarefaPeriodica(
      {
        nome: 'Expurgo',
        intervaloMs: horas * 60 * 60_000,
        tentativas: ExpurgoService.TENTATIVAS,
        backoffMs: ExpurgoService.BACKOFF_MS,
      },
      async () => {
        this.logger.log('Executando expurgo (origem: agendamento).');
        await this.executarAgora();
      },
    );

    this.tarefa.iniciar();
    this.logger.log(`Expurgo agendado a cada ${horas} h.`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.tarefa?.parar();
  }

  /**
   * Chamado quando a coleta é encerrada. Faz o expurgo técnico daquela pesquisa
   * na hora — é trabalho de uma pesquisa só, não justifica esperar o ciclo.
   *
   * Falha aqui **não** derruba o encerramento: a coleta encerrada é o fato de
   * negócio, e o ciclo periódico pega a pendência de qualquer forma.
   */
  async aoEncerrarColeta(formularioId: string): Promise<void> {
    try {
      await this.expurgarTecnicoDe(formularioId);
    } catch (erro) {
      this.logger.error(
        `Não foi possível fazer o expurgo técnico da pesquisa ${formularioId}: ${
          erro instanceof Error ? erro.message : String(erro)
        }`,
      );
    }
  }

  /** Execução sob demanda: usada pela administração e pelos testes. */
  async executarAgora(formularioId?: string): Promise<ResumoDoExpurgo> {
    const tecnico = formularioId
      ? await this.expurgarTecnicoDe(formularioId)
      : await this.expurgarTecnicoPendente();

    const respostasApagadas = await this.apagarRespostasVencidas();

    return { ...tecnico, respostasApagadas, em: new Date() };
  }

  async situacao(): Promise<ReturnType<ExpurgoRepository['situacao']>> {
    return this.repositorio.situacao(new Date());
  }

  /**
   * Pedido de execução vindo da tela. Com o ciclo ligado, roda em segundo plano
   * e a rota responde na hora — o expurgo apaga em lotes e pode demorar. Sem
   * ciclo, executa e só então responde.
   */
  async solicitarExecucao(): Promise<'enfileirada' | 'executada'> {
    if (!this.tarefa) {
      await this.executarAgora();
      return 'executada';
    }

    this.logger.log('Executando expurgo (origem: manual).');
    this.tarefa.disparar();
    return 'enfileirada';
  }

  /** Expurgo técnico de todas as pesquisas encerradas ainda pendentes. */
  private async expurgarTecnicoPendente(): Promise<{
    pesquisasAnonimizadas: number;
    dispositivosApagados: number;
    sessoesApagadas: number;
  }> {
    const pendentes = await this.repositorio.pesquisasComExpurgoTecnicoPendente(
      ExpurgoService.PESQUISAS_POR_CICLO,
    );

    let pesquisasAnonimizadas = 0;
    let dispositivosApagados = 0;
    let sessoesApagadas = 0;

    for (const pesquisa of pendentes) {
      const resultado = await this.expurgarTecnicoDe(pesquisa.id);
      pesquisasAnonimizadas += resultado.pesquisasAnonimizadas;
      dispositivosApagados += resultado.dispositivosApagados;
      sessoesApagadas += resultado.sessoesApagadas;
    }

    return { pesquisasAnonimizadas, dispositivosApagados, sessoesApagadas };
  }

  /**
   * Expurgo técnico de uma pesquisa. Aproveita para carimbar o prazo de
   * retenção das respostas — é no encerramento que o relógio dos 4 anos começa.
   */
  private async expurgarTecnicoDe(formularioId: string): Promise<{
    pesquisasAnonimizadas: number;
    dispositivosApagados: number;
    sessoesApagadas: number;
  }> {
    const pesquisa = await this.repositorio.pesquisaComExpurgoTecnicoPendente(formularioId);

    if (!pesquisa) {
      // Já expurgada, ainda em coleta ou inexistente: nada a fazer.
      return { pesquisasAnonimizadas: 0, dispositivosApagados: 0, sessoesApagadas: 0 };
    }

    const prazo = ExpurgoRepository.prazoDeRetencao(pesquisa.encerradoEm, this.anosDeRetencao());
    const resultado = await this.repositorio.expurgarDadosTecnicos(formularioId, prazo);

    if (!resultado) {
      return { pesquisasAnonimizadas: 0, dispositivosApagados: 0, sessoesApagadas: 0 };
    }

    // A trilha guarda o volume, nunca o dado: hash de dispositivo não entra em
    // auditoria em hipótese alguma.
    await this.auditoria.registrar({
      acao: AuditoriaAcao.EXPURGO_TECNICO,
      entidade: 'formulario',
      entidadeId: formularioId,
      detalhe: {
        respostasAnonimizadas: resultado.respostas,
        sessoesApagadas: resultado.sessoes,
        respostasExpurgamEm: prazo.toISOString(),
      },
    });

    this.logger.log(
      `Expurgo técnico da pesquisa ${formularioId}: ${resultado.respostas} respostas anonimizadas, ` +
        `${resultado.sessoes} sessões apagadas.`,
    );

    return {
      pesquisasAnonimizadas: 1,
      dispositivosApagados: resultado.respostas,
      sessoesApagadas: resultado.sessoes,
    };
  }

  /**
   * Apaga, em lotes, as respostas que passaram do prazo de retenção. Este é o
   * único ponto do sistema que apaga resposta fisicamente — e só por prazo
   * legal cumprido, nunca por decisão de tela.
   */
  private async apagarRespostasVencidas(): Promise<number> {
    const lote = this.config.get<number>('EXPURGO_LOTE', 1_000);
    const maximoDeLotes = this.config.get<number>('EXPURGO_LOTES_POR_CICLO', 20);
    const referencia = new Date();

    let apagadas = 0;
    const pesquisas = new Set<string>();

    for (let ciclo = 0; ciclo < maximoDeLotes; ciclo += 1) {
      const resultado = await this.repositorio.apagarRespostasVencidas(referencia, lote);
      if (resultado.apagadas === 0) {
        break;
      }
      apagadas += resultado.apagadas;
      resultado.pesquisas.forEach((id) => pesquisas.add(id));
    }

    if (apagadas === 0) {
      return 0;
    }

    await this.auditoria.registrar({
      acao: AuditoriaAcao.EXPURGO_RESPOSTAS,
      entidade: 'resposta',
      detalhe: {
        respostasApagadas: apagadas,
        pesquisasAtingidas: pesquisas.size,
        referencia: referencia.toISOString(),
      },
    });

    this.logger.log(`Expurgo por prazo: ${apagadas} respostas apagadas.`);
    return apagadas;
  }

  private anosDeRetencao(): number {
    return this.config.get<number>('EXPURGO_ANOS', 4);
  }
}
