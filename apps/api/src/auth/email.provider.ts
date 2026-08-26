import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MensagemDeEmail {
  para: string;
  nomeDoDestinatario: string;
  assunto: string;
  /** Corpo em texto puro. Sempre presente: cliente que recusa HTML ainda lê. */
  texto: string;
  html: string;
}

/**
 * Envio de e-mail transacional, atrás de um adapter.
 *
 * A escolha de hoje é o Brevo, porque o plano gratuito aceita remetente com
 * e-mail comum verificado — os outros exigem domínio próprio, que o projeto não
 * tem. Trocar de serviço depois é trocar esta classe: nada fora daqui conhece o
 * formato do corpo nem o endereço da API.
 *
 * Sem `BREVO_API_KEY` nada é enviado e o envio vira log. Isso mantém o
 * desenvolvimento rodando sem credencial, e é também o que impede a API de
 * subir em produção mandando e-mail para lugar nenhum em silêncio — quem checa
 * essa combinação é a validação de ambiente.
 */
@Injectable()
export class ProvedorDeEmail {
  private readonly logger = new Logger(ProvedorDeEmail.name);

  private static readonly URL_BREVO = 'https://api.brevo.com/v3/smtp/email';

  /** Teto de espera do envio. Cadastro não pode ficar pendurado em rede ruim. */
  private static readonly TIMEOUT_MS = 10_000;

  constructor(private readonly config: ConfigService) {}

  async enviar(mensagem: MensagemDeEmail): Promise<void> {
    const chave = this.config.get<string>('BREVO_API_KEY');

    if (!chave) {
      // Em desenvolvimento o link precisa chegar a algum lugar visível, senão
      // não há como testar o fluxo sem credencial.
      this.logger.warn(
        `Sem BREVO_API_KEY: e-mail para ${mensagem.para} não foi enviado.\n${mensagem.texto}`,
      );
      return;
    }

    const controlador = new AbortController();
    const timer = setTimeout(() => controlador.abort(), ProvedorDeEmail.TIMEOUT_MS);

    try {
      const resposta = await fetch(ProvedorDeEmail.URL_BREVO, {
        method: 'POST',
        signal: controlador.signal,
        headers: {
          'api-key': chave,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          sender: {
            email: this.config.get<string>('EMAIL_REMETENTE'),
            name: this.config.get<string>('EMAIL_REMETENTE_NOME'),
          },
          to: [{ email: mensagem.para, name: mensagem.nomeDoDestinatario }],
          subject: mensagem.assunto,
          textContent: mensagem.texto,
          htmlContent: mensagem.html,
        }),
      });

      if (!resposta.ok) {
        // O corpo do erro do Brevo não vai para o log: pode ecoar o endereço de
        // destino, e log de aplicação não é lugar de dado de contato.
        throw new Error(`Brevo respondeu ${resposta.status}.`);
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
