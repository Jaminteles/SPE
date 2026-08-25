import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditoriaAcao } from '@prisma/client';

import { TarefaPeriodica } from '../common/tarefas/tarefa-periodica';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AgregacaoRepository } from './agregacao.repository';

/**
 * Rotina de agregação pré-calculada.
 *
 * As views materializadas são atualizadas por uma tarefa periódica em processo,
 * nunca no caminho da requisição. `AGREGACAO_INTERVALO_MIN` igual a zero desliga
 * o ciclo e deixa a atualização só sob demanda.
 *
 * A tarefa é idempotente por natureza: `REFRESH MATERIALIZED VIEW` recalcula do
 * zero, então repetir não corrompe nada.
 */
@Injectable()
export class AgregacaoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgregacaoService.name);

  private tarefa: TarefaPeriodica | null = null;
  /** Autor do pedido sob demanda, para a trilha de auditoria do ciclo. */
  private autorDoCicloAtual: string | undefined;

  private static readonly TENTATIVAS = 5;
  private static readonly BACKOFF_MS = 30_000;

  constructor(
    private readonly repositorio: AgregacaoRepository,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const minutos = this.config.get<number>('AGREGACAO_INTERVALO_MIN', 10);

    if (minutos <= 0 || this.config.get<string>('NODE_ENV') === 'test') {
      this.logger.warn('Ciclo de agregação desligado. Atualização só sob demanda.');
      return;
    }

    this.tarefa = new TarefaPeriodica(
      {
        nome: 'Agregacao',
        intervaloMs: minutos * 60_000,
        tentativas: AgregacaoService.TENTATIVAS,
        backoffMs: AgregacaoService.BACKOFF_MS,
      },
      () => this.executar(),
    );

    this.tarefa.iniciar();
    this.logger.log(`Agregação agendada a cada ${minutos} min.`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.tarefa?.parar();
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

  /**
   * Pedido de atualização vindo da tela. Com o ciclo ligado, roda em segundo
   * plano e a rota responde na hora — `REFRESH` de todas as views é lento
   * demais para segurar a requisição. Sem ciclo, executa e só então responde.
   */
  async solicitarAtualizacao(usuarioId?: string): Promise<'enfileirada' | 'executada'> {
    if (!this.tarefa) {
      await this.atualizarAgora(usuarioId);
      return 'executada';
    }

    // Se já havia um ciclo em curso, o pedido é absorvido por ele: o resultado
    // é o mesmo recálculo completo, e a auditoria fica com o autor daquele.
    if (this.tarefa.disparar()) {
      this.autorDoCicloAtual = usuarioId;
    }

    return 'enfileirada';
  }

  private async executar(): Promise<void> {
    const autor = this.autorDoCicloAtual;
    this.autorDoCicloAtual = undefined;

    this.logger.log(`Atualizando agregações (origem: ${autor ? 'manual' : 'agendamento'}).`);

    // Só o pedido humano vira trilha. O ciclo automático recalcula a cada
    // AGREGACAO_INTERVALO_MIN e encheria a auditoria de ruído sem informar nada.
    if (autor) {
      await this.atualizarAgora(autor);
      return;
    }

    await this.repositorio.atualizarTodas();
  }
}
