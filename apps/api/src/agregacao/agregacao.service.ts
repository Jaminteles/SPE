import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditoriaAcao } from '@prisma/client';
import { Job, Queue, Worker } from 'bullmq';
import IORedis, { Redis } from 'ioredis';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { AgregacaoRepository } from './agregacao.repository';

export const FILA_AGREGACAO = 'agregacao';
export const TAREFA_ATUALIZAR = 'atualizar-resultados';

interface DadosDaTarefa {
  /** Só para rastrear no log quem pediu a atualização. */
  origem: 'agendamento' | 'manual';
}

/**
 * Rotina de agregação pré-calculada.
 *
 * As views materializadas são atualizadas por job BullMQ, nunca no caminho da
 * requisição. Se o Redis não estiver configurado, o módulo sobe sem fila e a
 * atualização fica disponível apenas sob demanda — a API não deixa de subir por
 * causa da infraestrutura de fila.
 *
 * O worker é idempotente por natureza: `REFRESH MATERIALIZED VIEW` recalcula do
 * zero, então repetir a tarefa não corrompe nada.
 */
@Injectable()
export class AgregacaoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgregacaoService.name);

  private conexao: Redis | null = null;
  private fila: Queue<DadosDaTarefa> | null = null;
  private worker: Worker<DadosDaTarefa> | null = null;

  private static readonly TENTATIVAS = 5;
  private static readonly BACKOFF_MS = 30_000;

  constructor(
    private readonly repositorio: AgregacaoRepository,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('REDIS_URL');
    if (!url || this.config.get<string>('NODE_ENV') === 'test') {
      this.logger.warn('Fila de agregação desligada: sem REDIS_URL. Atualização só sob demanda.');
      return;
    }

    this.conexao = new IORedis(url, { maxRetriesPerRequest: null });
    this.fila = new Queue<DadosDaTarefa>(FILA_AGREGACAO, { connection: this.conexao });

    this.worker = new Worker<DadosDaTarefa>(
      FILA_AGREGACAO,
      async (tarefa) => this.executar(tarefa),
      { connection: this.conexao, concurrency: 1 },
    );

    // Estado explícito: sucesso e falha viram log, e a falha final fica retida.
    this.worker.on('failed', (tarefa, erro) => {
      this.logger.error(
        `Agregação falhou (tentativa ${tarefa?.attemptsMade ?? '?'}): ${erro.message}`,
      );
    });
    this.worker.on('completed', (tarefa) => {
      this.logger.log(`Agregação concluída (tarefa ${tarefa.id}).`);
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
   * que a API suba em mais de uma instância.
   */
  private async agendar(): Promise<void> {
    const minutos = this.config.get<number>('AGREGACAO_INTERVALO_MIN', 10);

    await this.fila?.add(
      TAREFA_ATUALIZAR,
      { origem: 'agendamento' },
      {
        repeat: { every: minutos * 60_000 },
        jobId: 'agregacao-periodica',
        attempts: AgregacaoService.TENTATIVAS,
        backoff: { type: 'exponential', delay: AgregacaoService.BACKOFF_MS },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    );

    this.logger.log(`Agregação agendada a cada ${minutos} min.`);
  }

  /** Atualização sob demanda: usada pela administração e pelos testes. */
  async atualizarAgora(usuarioId?: string): Promise<{ views: string[]; em: Date }> {
    const views = await this.repositorio.atualizarTodas();

    await this.auditoria.registrar({
      acao: AuditoriaAcao.AGREGACAO_ATUALIZADA,
      entidade: 'agregacao',
      usuarioId: usuarioId ?? null,
      detalhe: { views: views.join(', ') },
    });

    return { views, em: new Date() };
  }

  /** Enfileira a atualização, se houver fila. Sem fila, executa direto. */
  async solicitarAtualizacao(usuarioId?: string): Promise<'enfileirada' | 'executada'> {
    if (!this.fila) {
      await this.atualizarAgora(usuarioId);
      return 'executada';
    }

    await this.fila.add(
      TAREFA_ATUALIZAR,
      { origem: 'manual' },
      {
        attempts: AgregacaoService.TENTATIVAS,
        backoff: { type: 'exponential', delay: AgregacaoService.BACKOFF_MS },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    );
    return 'enfileirada';
  }

  private async executar(tarefa: Job<DadosDaTarefa>): Promise<void> {
    this.logger.log(`Atualizando agregações (origem: ${tarefa.data.origem}).`);
    await this.repositorio.atualizarTodas();
  }
}
