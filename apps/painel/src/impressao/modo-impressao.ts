import { Filtros } from '../api/servico-resultados';

/** Nome da variável que o renderizador de PDF injeta no contexto da página. */
const VARIAVEL_DE_TOKEN = '__SPE_TOKEN_DE_IMPRESSAO__';

export interface ModoImpressao {
  token: string;
  formularioId: string;
  filtros: Filtros;
}

/**
 * Modo de impressão.
 *
 * A API abre o próprio painel no Puppeteer para gerar o PDF — assim os gráficos
 * não são reimplementados do outro lado. A URL carrega só o recorte; o token de
 * quem pediu a exportação chega pelo contexto da página, nunca por query
 * string.
 */
export function lerModoImpressao(busca: string): ModoImpressao | null {
  const parametros = new URLSearchParams(busca);
  if (parametros.get('impressao') !== '1') {
    return null;
  }

  const formularioId = parametros.get('formularioId');
  const token = (window as unknown as Record<string, unknown>)[VARIAVEL_DE_TOKEN];

  if (!formularioId || typeof token !== 'string' || token.length === 0) {
    return null;
  }

  const municipio = parametros.get('municipioCodigoIbge');

  return {
    token,
    formularioId,
    filtros: {
      perguntaId: parametros.get('perguntaId') ?? undefined,
      municipioCodigoIbge: municipio ? Number(municipio) : undefined,
      de: parametros.get('de') ?? undefined,
      ate: parametros.get('ate') ?? undefined,
    },
  };
}
