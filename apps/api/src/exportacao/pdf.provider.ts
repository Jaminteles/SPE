import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Browser, LaunchOptions } from 'puppeteer';

import { ArquivoExportado, PacoteDeExportacao } from './tipos';

/** Marca que o painel coloca no DOM quando terminou de carregar os dados. */
const SELETOR_PRONTO = '[data-impressao="pronta"]';

/**
 * Exportação em PDF.
 *
 * O Puppeteer renderiza **o próprio painel** em modo de impressão (decisão do
 * backlog): os gráficos não são reimplementados aqui, então PDF e tela não
 * podem divergir.
 *
 * O access token de quem pediu a exportação é injetado no contexto da página
 * antes do primeiro script — nunca em query string, nunca em `localStorage`,
 * nunca em log. A página só é aberta na origem configurada do painel.
 */
@Injectable()
export class PdfProvider {
  private readonly logger = new Logger(PdfProvider.name);

  private static readonly TENTATIVAS = 2;

  constructor(private readonly config: ConfigService) {}

  async gerar(
    pacote: PacoteDeExportacao,
    nomeBase: string,
    contexto: { token: string; filtros: Record<string, string> },
  ): Promise<ArquivoExportado> {
    const url = this.montarUrl(pacote.formulario.id, contexto.filtros);

    let ultimaFalha: unknown = null;
    for (let tentativa = 1; tentativa <= PdfProvider.TENTATIVAS; tentativa += 1) {
      try {
        const conteudo = await this.renderizar(url, contexto.token);
        return { nome: `${nomeBase}.pdf`, tipo: 'application/pdf', conteudo };
      } catch (falha) {
        ultimaFalha = falha;
        // A URL entra no log; o token, nunca.
        this.logger.warn(
          `Falha ao renderizar o PDF (tentativa ${tentativa}/${PdfProvider.TENTATIVAS}): ${
            falha instanceof Error ? falha.message : String(falha)
          }`,
        );
      }
    }

    throw new ServiceUnavailableException(
      `Não foi possível gerar o PDF: ${
        ultimaFalha instanceof Error ? ultimaFalha.message : 'falha na renderização'
      }`,
    );
  }

  /** Base do painel, sem barra no fim. Só esta origem é aberta pelo navegador. */
  private montarUrl(formularioId: string, filtros: Record<string, string>): string {
    const base = String(this.config.get<string>('PAINEL_URL') ?? 'http://localhost:5173').replace(
      /\/+$/,
      '',
    );
    const parametros = new URLSearchParams({ impressao: '1', formularioId, ...filtros });
    return `${base}/?${parametros.toString()}`;
  }

  private tempoLimite(): number {
    return this.config.get<number>('EXPORTACAO_PDF_TIMEOUT_MS', 45_000);
  }

  private async renderizar(url: string, token: string): Promise<Buffer> {
    const puppeteer = await this.carregarPuppeteer();
    const opcoes: LaunchOptions = {
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
      timeout: this.tempoLimite(),
      // Homologação roda atrás de certificado autoassinado. Fica desligado por
      // padrão: em produção, certificado inválido é erro, não detalhe.
      acceptInsecureCerts: this.config.get<boolean>('EXPORTACAO_PDF_TLS_INVALIDO', false),
    };

    const caminho = this.config.get<string>('PUPPETEER_EXECUTABLE_PATH');
    if (caminho) {
      opcoes.executablePath = caminho;
    }

    let navegador: Browser | null = null;
    try {
      navegador = await puppeteer.launch(opcoes);
      const pagina = await navegador.newPage();
      pagina.setDefaultTimeout(this.tempoLimite());

      // Injetado no contexto da página, antes de qualquer script do painel.
      await pagina.evaluateOnNewDocument((valor: string) => {
        (window as unknown as Record<string, string>).__SPE_TOKEN_DE_IMPRESSAO__ = valor;
      }, token);

      await pagina.goto(url, { waitUntil: 'networkidle0', timeout: this.tempoLimite() });
      await pagina.waitForSelector(SELETOR_PRONTO, { timeout: this.tempoLimite() });

      const pdf = await pagina.pdf({
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
      });

      return Buffer.from(pdf);
    } finally {
      await navegador?.close().catch(() => undefined);
    }
  }

  /**
   * Carga tardia: quem nunca exporta PDF não paga o custo do navegador, e a
   * ausência do pacote vira erro de indisponibilidade, não queda da API.
   */
  private async carregarPuppeteer(): Promise<typeof import('puppeteer')> {
    try {
      return await import('puppeteer');
    } catch {
      throw new ServiceUnavailableException(
        'Exportação em PDF indisponível: o Puppeteer não está instalado neste ambiente.',
      );
    }
  }
}
