import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditoriaAcao } from '@prisma/client';
import { Job, Queue, Worker } from 'bullmq';
import IORedis, { Redis } from 'ioredis';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { ExpurgoRepository } from './expurgo.repository';

export const FILA_EXPURGO = 'expurgo';
export const TAREFA_EXPURGO = 'expurgar';

interface DadosDaTarefa {
  /** Só para rastrear no log quem pediu a execução. */
  origem: 'agendamento' | 'encerramento' | 'manual';
  formularioId?: string;
}

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
 * O worker é idempotente: o expurgo técnico trava em `expurgo_tecnico_em` e a
 * remoção por prazo é uma consulta sobre o que ainda existe. Repetir a tarefa
 * não apaga nada a mais nem quebra nada.
 *
 * Sem `REDIS_URL` o módulo sobe sem fila e a rotina fica disponível sob
 * demanda — a API não deixa de subir por causa da infraestrutura de fila.
 */
@Injectable()
export class ExpurgoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExpurgoService.name);

  private conexao: Redis | null = null;
  private fila: Queue<DadosDaTarefa> | null = null;
  private worker: Worker<DadosDaTarefa> | null = null;

  private static readonly TENTATIVAS = 5;
  private static readonly BACKOFF_MS = 60_000;
  /** Teto de pesquisas tratadas por execução: o job não pode virar maratona. */
  private static readonly PESQUISAS_POR_CICLO = 20;

  constructor(
    private readonly repositorio: ExpurgoRepository,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('REDIS_URL');
    if (!url || this.config.get<string>('NODE_ENV') === 'test') {
      this.logger.warn('Fila de expurgo desligada: sem REDIS_URL. Execução só sob demanda.');
      return;
    }

    this.conexao = new IORedis(url, { maxRetriesPerRequest: null });
    this.fila = new Queue<DadosDaTarefa>(FILA_EXPURGO, { connection: this.conexao });

    this.worker = new Worker<DadosDaTarefa>(FILA_EXPURGO, async (tarefa) => this.executar(tarefa), {
      connection: this.conexao,
      concurrency: 1,
    });

    // Estado explícito: sucesso e falha viram log; a falha final fica retida.
    this.worker.on('failed', (tarefa, erro) => {
      this.logger.error(
        `Expurgo falhou (tentativa ${tarefa?.attemptsMade ?? '?'}): ${erro.message}`,
      );
    });
    this.worker.on('completed', (tarefa) => {
      this.logger.log(`Expurgo concluído (tarefa ${tarefa.id}).`);
    });

    await this.agendar();
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.fila?.close();
    this.conexao?.disconnect();
  }

  /**
   * Agendamento periódico. `jobId` fixo mantém uma única série repetida mesmo
   * com a API em mais de uma instância.
   */
  private async agendar(): Promise<void> {
    const horas = this.config.get<number>('EXPURGO_INTERVALO_HORAS', 24);

    await this.fila?.add(
      TAREFA_EXPURGO,
      { origem: 'agendamento' },
      {
        repeat: { every: horas * 60 * 60_000 },
        jobId: 'expurgo-periodico',
        ...this.opcoesDeTentativa(),
      },
    );

    this.logger.log(`Expurgo agendado a cada ${horas} h.`);
  }

  /**
   * Chamado quando a coleta é encerrada. Enfileira o expurgo técnico daquela
   * pesquisa; sem fila, executa na hora.
   *
   * Falha aqui **não** derruba o encerramento: a coleta encerrada é o fato de
   * negócio, e o ciclo periódico pega a pendência de qualquer forma.
   */
  async aoEncerrarColeta(formularioId: string): Promise<void> {
    try {
      if (!this.fila) {
        await this.expurgarTecnicoDe(formularioId);
        return;
      }

      await this.fila.add(
        TAREFA_EXPURGO,
        { origem: 'encerramento', formularioId },
        this.opcoesDeTentativa(),
      );
    } catch (erro) {
      this.logger.error(
        `Não foi possível agendar o expurgo técnico da pesquisa ${formularioId}: ${
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

  /** Enfileira a execução, se houver fila. Sem fila, executa direto. */
  async solicitarExecucao(): Promise<'enfileirada' | 'executada'> {
    if (!this.fila) {
      await this.executarAgora();
      return 'executada';
    }

    await this.fila.add(TAREFA_EXPURGO, { origem: 'manual' }, this.opcoesDeTentativa());
    return 'enfileirada';
  }

  private opcoesDeTentativa() {
    return {
      attempts: ExpurgoService.TENTATIVAS,
      backoff: { type: 'exponential' as const, delay: ExpurgoService.BACKOFF_MS },
      removeOnComplete: 50,
      removeOnFail: 100,
    };
  }

  private async executar(tarefa: Job<DadosDaTarefa>): Promise<void> {
    this.logger.log(`Executando expurgo (origem: ${tarefa.data.origem}).`);
    await this.executarAgora(tarefa.data.formularioId);
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
