import { sessao } from '../auth/sessao';
import { Filtros, consultaDeExportacao } from './servico-resultados';

export type FormatoDeExportacao = 'csv' | 'xlsx' | 'pdf';

/**
 * Exportação do recorte que está na tela.
 *
 * Os filtros enviados são exatamente os do painel — é o que faz o arquivo bater
 * com o que o usuário está vendo. O download é autenticado por cabeçalho; não
 * existe link com token embutido.
 */
export const servicoExportacao = {
  async baixar(
    formato: FormatoDeExportacao,
    formularioId: string,
    filtros: Filtros,
  ): Promise<void> {
    const arquivo = await sessao.baixarAutenticado(
      `/exportacao/${formularioId}/${formato}${consultaDeExportacao(filtros)}`,
    );

    const url = URL.createObjectURL(arquivo.conteudo);
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = arquivo.nome;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  },
};
