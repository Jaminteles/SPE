import { ErroApi, ErroDeRede } from '../api/cliente';
import { bancoLocal } from './banco-local';
import { servicoColeta } from './servico-coleta';
import { PacoteDeEnvio } from './tipos';

/** Espera entre tentativas: 30s, 2min, 8min, 32min, teto de 2h. */
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_TETO_MS = 2 * 60 * 60 * 1000;
const FATOR = 4;

export interface ResultadoDaFila {
  enviados: number;
  pendentes: number;
}

function proximaTentativa(tentativas: number): string {
  const espera = Math.min(BACKOFF_BASE_MS * FATOR ** tentativas, BACKOFF_TETO_MS);
  return new Date(Date.now() + espera).toISOString();
}

/**
 * Falha definitiva: o servidor recusou o conteúdo e reenviar não muda nada.
 * 409 não entra aqui — significa que a resposta já está registrada, o que é
 * sucesso do ponto de vista do aparelho.
 */
function ehDefinitiva(falha: unknown): boolean {
  return falha instanceof ErroApi && falha.status >= 400 && falha.status < 500 && falha.status !== 429;
}

function jaRegistrada(falha: unknown): boolean {
  return falha instanceof ErroApi && falha.status === 409;
}

/**
 * Fila de reenvio da coleta.
 *
 * O envio nunca é a única cópia: a resposta entra na fila local antes de
 * qualquer tentativa de rede. Falhou, fica guardada e é reenviada depois —
 * na abertura do app, na volta ao primeiro plano ou por toque do usuário.
 *
 * O envio é idempotente do lado do servidor (o `respostaId` vem daqui), então
 * reenviar o mesmo pacote nunca duplica resposta.
 */
export const filaDeEnvio = {
  /** Guarda e tenta enviar na hora. Devolve true quando o servidor confirmou. */
  async enviarOuEnfileirar(token: string, pacote: PacoteDeEnvio): Promise<boolean> {
    await bancoLocal.enfileirar(pacote, token);
    return this.tentarUm(token, pacote, 0);
  },

  async tentarUm(token: string, pacote: PacoteDeEnvio, tentativas: number): Promise<boolean> {
    try {
      await servicoColeta.enviar(token, pacote);
      await bancoLocal.removerPendente(pacote.respostaId);
      return true;
    } catch (falha) {
      if (jaRegistrada(falha)) {
        await bancoLocal.removerPendente(pacote.respostaId);
        return true;
      }

      if (ehDefinitiva(falha)) {
        // Reenviar não resolve: sai da fila para não girar para sempre.
        await bancoLocal.removerPendente(pacote.respostaId);
        throw falha;
      }

      const motivo = falha instanceof ErroDeRede ? 'sem conexão' : 'falha temporária no servidor';
      await bancoLocal.registrarFalha(
        pacote.respostaId,
        tentativas + 1,
        proximaTentativa(tentativas),
        motivo,
      );
      return false;
    }
  },

  /** Processa a fila respeitando o backoff. Chamada na abertura e no retorno do app. */
  async processar(): Promise<ResultadoDaFila> {
    const pendentes = await bancoLocal.listarPendentes();
    const agora = Date.now();
    let enviados = 0;

    for (const pendente of pendentes) {
      if (new Date(pendente.proximaTentativaEm).getTime() > agora) {
        continue;
      }
      try {
        const foi = await this.tentarUm(pendente.token, pendente.pacote, pendente.tentativas);
        if (foi) {
          enviados += 1;
        }
      } catch {
        // Falha definitiva já saiu da fila; a próxima pendência continua.
      }
    }

    return { enviados, pendentes: await bancoLocal.contarPendentes() };
  },
};
