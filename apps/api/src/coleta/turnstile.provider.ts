import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface RespostaDoTurnstile {
  success?: boolean;
  'error-codes'?: string[];
}

export type ResultadoAntiRobo =
  { aprovado: true; verificado: boolean } | { aprovado: false; motivo: string };

/**
 * Verificação anti-robô (Cloudflare Turnstile), atrás de adapter.
 *
 * Escolhido no lugar do reCAPTCHA por gerar menos atrito para o respondente.
 *
 * A credencial vem só do ambiente. Sem `TURNSTILE_SECRET` configurado a
 * verificação fica desligada — o que é aceitável em desenvolvimento e teste,
 * e é por isso que existe `TURNSTILE_OBRIGATORIO`: em produção, ligado, a
 * ausência de configuração derruba a validação em vez de deixar passar.
 */
@Injectable()
export class ProvedorAntiRobo {
  private readonly logger = new Logger(ProvedorAntiRobo.name);

  private static readonly URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
  private static readonly TIMEOUT_MS = 5_000;
  private static readonly TENTATIVAS = 2;

  constructor(private readonly config: ConfigService) {}

  get configurado(): boolean {
    return Boolean(this.config.get<string>('TURNSTILE_SECRET'));
  }

  get obrigatorio(): boolean {
    return this.config.get<boolean>('TURNSTILE_OBRIGATORIO', false);
  }

  /** Exige o desafio também no aplicativo, não só na origem web. */
  get exigirNoAplicativo(): boolean {
    return this.config.get<boolean>('TURNSTILE_EXIGIR_NO_APLICATIVO', false);
  }

  async verificar(token: string | undefined, ip: string | undefined): Promise<ResultadoAntiRobo> {
    if (!this.configurado) {
      if (this.obrigatorio) {
        this.logger.error('TURNSTILE_OBRIGATORIO ligado sem TURNSTILE_SECRET configurado.');
        return { aprovado: false, motivo: 'Verificação anti-robô indisponível.' };
      }
      return { aprovado: true, verificado: false };
    }

    if (!token) {
      return { aprovado: false, motivo: 'Verificação anti-robô ausente.' };
    }

    for (let tentativa = 1; tentativa <= ProvedorAntiRobo.TENTATIVAS; tentativa += 1) {
      try {
        const resultado = await this.consultar(token, ip);
        if (resultado.success) {
          return { aprovado: true, verificado: true };
        }
        // Token recusado é decisão do provedor: não adianta repetir.
        this.logger.warn(
          `Verificação anti-robô recusada: ${(resultado['error-codes'] ?? []).join(', ')}`,
        );
        return { aprovado: false, motivo: 'Verificação anti-robô inválida.' };
      } catch (erro) {
        const ultima = tentativa === ProvedorAntiRobo.TENTATIVAS;
        this.logger.warn(
          `Falha ao consultar a verificação anti-robô (tentativa ${tentativa}): ${
            erro instanceof Error ? erro.message : 'desconhecida'
          }`,
        );
        if (ultima) {
          // Provedor fora do ar: em produção não se abre a porta.
          return this.obrigatorio
            ? { aprovado: false, motivo: 'Verificação anti-robô indisponível.' }
            : { aprovado: true, verificado: false };
        }
      }
    }

    return { aprovado: false, motivo: 'Verificação anti-robô indisponível.' };
  }

  private async consultar(token: string, ip: string | undefined): Promise<RespostaDoTurnstile> {
    const controlador = new AbortController();
    const timer = setTimeout(() => controlador.abort(), ProvedorAntiRobo.TIMEOUT_MS);

    try {
      const corpo = new URLSearchParams({
        secret: this.config.getOrThrow<string>('TURNSTILE_SECRET'),
        response: token,
        ...(ip ? { remoteip: ip } : {}),
      });

      const resposta = await fetch(ProvedorAntiRobo.URL, {
        method: 'POST',
        signal: controlador.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: corpo.toString(),
      });

      if (!resposta.ok) {
        throw new Error(`Turnstile respondeu ${resposta.status}`);
      }

      return (await resposta.json()) as RespostaDoTurnstile;
    } finally {
      clearTimeout(timer);
    }
  }
}
