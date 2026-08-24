import { Indicadores as IndicadoresDeResultado } from '../api/servico-resultados';

interface Props {
  indicadores: IndicadoresDeResultado;
  filtrado: boolean;
}

const numero = new Intl.NumberFormat('pt-BR');

function dataCurta(valor: string | null): string {
  return valor ? new Date(valor).toLocaleDateString('pt-BR') : '—';
}

/**
 * Indicadores gerais.
 *
 * Válidas respeitam o recorte dos filtros; conferência e invalidadas são sempre
 * da pesquisa inteira, porque medem integridade da coleta, não resultado.
 */
export function Indicadores({ indicadores, filtrado }: Props) {
  const cobertura =
    indicadores.municipiosDaBahia === 0
      ? 0
      : Math.round((indicadores.municipiosAlcancados / indicadores.municipiosDaBahia) * 100);

  return (
    <div className="indicadores">
      <div className="cartao indicador">
        <div className="valor">{numero.format(indicadores.respostasValidas)}</div>
        <div className="rotulo">Respostas válidas</div>
        <div className="detalhe">{filtrado ? 'no recorte filtrado' : 'na pesquisa inteira'}</div>
      </div>

      <div className="cartao indicador">
        <div className="valor">
          {numero.format(indicadores.municipiosAlcancados)}
          <span style={{ fontSize: 15, color: 'var(--cor-suave)' }}>
            {' '}
            / {numero.format(indicadores.municipiosDaBahia)}
          </span>
        </div>
        <div className="rotulo">Municípios alcançados</div>
        <div className="detalhe">{cobertura}% da Bahia</div>
      </div>

      <div className="cartao indicador">
        <div className="valor">{numero.format(indicadores.respostasEmConferencia)}</div>
        <div className="rotulo">Em conferência</div>
        <div className="detalhe">marcadas automaticamente</div>
      </div>

      <div className="cartao indicador">
        <div className="valor">{numero.format(indicadores.respostasInvalidadas)}</div>
        <div className="rotulo">Invalidadas</div>
        <div className="detalhe">fora da contagem, não apagadas</div>
      </div>

      <div className="cartao indicador">
        <div className="valor" style={{ fontSize: 18 }}>
          {dataCurta(indicadores.primeiraRespostaEm)} — {dataCurta(indicadores.ultimaRespostaEm)}
        </div>
        <div className="rotulo">Período com resposta</div>
        <div className="detalhe">
          agregação de {new Date(indicadores.atualizadoEm).toLocaleTimeString('pt-BR')}
        </div>
      </div>
    </div>
  );
}
