import {
  IndicadoresResponse,
  MunicipioRanqueadoResponse,
  PerguntaComResultadoResponse,
  PontoDaEvolucaoResponse,
} from '../resultados/dto/resultados.dto';

export type FormatoDeExportacao = 'csv' | 'xlsx' | 'pdf';

/** Descrição do recorte, já em texto, para aparecer no cabeçalho do arquivo. */
export interface RecorteDescrito {
  pergunta: string;
  municipio: string;
  periodo: string;
}

/**
 * Conteúdo exportado.
 *
 * Só agregado: pergunta, alternativa, município e dia. Nada aqui identifica um
 * respondente — não há id de resposta, hash de dispositivo, geolocalização nem
 * horário individual de envio.
 */
export interface PacoteDeExportacao {
  formulario: {
    id: string;
    titulo: string;
    status: string;
    versao: number;
    publicadoEm: Date | null;
    encerradoEm: Date | null;
  };
  geradoEm: Date;
  geradoPor: string;
  recorte: RecorteDescrito;
  indicadores: IndicadoresResponse;
  perguntas: PerguntaComResultadoResponse[];
  municipios: MunicipioRanqueadoResponse[];
  totalDoRanking: number;
  evolucao: PontoDaEvolucaoResponse[];
}

export interface ArquivoExportado {
  nome: string;
  tipo: string;
  conteudo: Buffer;
}
