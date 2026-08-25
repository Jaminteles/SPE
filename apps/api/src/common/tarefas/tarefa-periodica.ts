import { Logger } from '@nestjs/common';

export interface OpcoesDaTarefa {
  /** Nome usado no log. */
  nome: string;
  /** Intervalo entre os ciclos automáticos. */
  intervaloMs: number;
  /** Quantas vezes tentar antes de desistir do ciclo. */
  tentativas: number;
  /** Espera da primeira retentativa; dobra a cada nova falha. */
  backoffMs: number;
}

/**
 * Execução periódica em processo, sem Redis nem fila externa.
 *
 * Substitui o BullMQ nas rotinas de agregação e expurgo. As duas são
 * idempotentes por construção — `REFRESH MATERIALIZED VIEW` recalcula do zero e
 * o expurgo trava no que já foi feito —, então nada aqui depende de estado
 * durável: se o processo cair no meio de um ciclo, o próximo refaz.
 *
 * O que este executor garante é o mínimo que as rotinas precisam: **um ciclo
 * por vez** (nunca dois `REFRESH` concorrentes na mesma view) e retentativa com
 * espera crescente. O que ele não garante — e o BullMQ garantia — é exclusão
 * entre instâncias: com a API replicada, cada réplica roda o próprio ciclo. Nas
 * duas rotinas isso desperdiça trabalho, mas não corrompe dado.
 */
export class TarefaPeriodica {
  private readonly logger: Logger;
  private temporizador: NodeJS.Timeout | null = null;
  private emExecucao: Promise<void> | null = null;
  private parada = false;

  constructor(
    private readonly opcoes: OpcoesDaTarefa,
    private readonly executar: () => Promise<void>,
  ) {
    this.logger = new Logger(opcoes.nome);
  }

  /** Começa o ciclo. O primeiro disparo é um intervalo depois, não no boot. */
  iniciar(): void {
    if (this.temporizador) {
      return;
    }

    this.temporizador = setInterval(() => void this.disparar(), this.opcoes.intervaloMs);
    // Sem unref, um processo que só tem este temporizador pendurado nunca sai —
    // e o Jest acusa handle aberto ao fim da suíte.
    this.temporizador.unref();

    this.logger.log(`Agendada a cada ${this.opcoes.intervaloMs} ms.`);
  }

  /** Encerra o ciclo e espera o que estiver rodando terminar. */
  async parar(): Promise<void> {
    this.parada = true;

    if (this.temporizador) {
      clearInterval(this.temporizador);
      this.temporizador = null;
    }

    await this.emExecucao;
  }

  /**
   * Executa fora do ciclo. Devolve `false` quando já havia um ciclo em curso —
   * o pedido é absorvido pelo que está rodando, não enfileirado.
   */
  disparar(): boolean {
    if (this.parada || this.emExecucao) {
      return false;
    }

    this.emExecucao = this.executarComTentativas().finally(() => {
      this.emExecucao = null;
    });

    return true;
  }

  /** Espera o ciclo em curso, se houver. Existe para os testes. */
  async aguardar(): Promise<void> {
    await this.emExecucao;
  }

  private async executarComTentativas(): Promise<void> {
    for (let tentativa = 1; tentativa <= this.opcoes.tentativas; tentativa += 1) {
      try {
        await this.executar();
        return;
      } catch (erro) {
        const motivo = erro instanceof Error ? erro.message : String(erro);

        if (tentativa === this.opcoes.tentativas) {
          this.logger.error(`Falhou em definitivo após ${tentativa} tentativas: ${motivo}`);
          return;
        }

        const espera = this.opcoes.backoffMs * 2 ** (tentativa - 1);
        this.logger.warn(
          `Falhou (tentativa ${tentativa}): ${motivo}. Nova tentativa em ${espera} ms.`,
        );

        if (!(await this.esperar(espera))) {
          return;
        }
      }
    }
  }

  /** Espera cancelável: devolve `false` se a tarefa foi parada na espera. */
  private esperar(ms: number): Promise<boolean> {
    return new Promise((resolver) => {
      const espera = setTimeout(() => resolver(!this.parada), ms);
      espera.unref();
    });
  }
}
