import { useMemo, useState } from 'react';

import { RankingPorMunicipio } from '../api/servico-resultados';

interface Props {
  ranking: RankingPorMunicipio;
  /** Na impressão a tabela sai inteira: não há como clicar em "ver mais" no PDF. */
  impressao?: boolean;
}

const numero = new Intl.NumberFormat('pt-BR');
const percentual = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const VISIVEIS_DE_INICIO = 15;

/**
 * Apuração por município — o objetivo central do sistema.
 *
 * Absoluto e percentual lado a lado, ranqueados. O percentual vem derivado da
 * API sobre as respostas válidas do recorte; nada é recalculado aqui, para a
 * tela não divergir do arquivo exportado.
 */
export function TabelaDeMunicipios({ ranking, impressao = false }: Props) {
  const [expandida, setExpandida] = useState(false);

  const visiveis = useMemo(
    () =>
      impressao || expandida
        ? ranking.municipios
        : ranking.municipios.slice(0, VISIVEIS_DE_INICIO),
    [ranking.municipios, expandida, impressao],
  );

  return (
    <div className="cartao">
      <h2>Apuração por município</h2>

      {ranking.municipios.length === 0 ? (
        <p className="aviso">Nenhum município tem resposta válida neste recorte.</p>
      ) : (
        <>
          <table className="tabela">
            <thead>
              <tr>
                <th className="numero">#</th>
                <th>Município</th>
                <th className="numero">Código IBGE</th>
                <th className="numero">Respostas válidas</th>
                <th className="numero">%</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((municipio) => (
                <tr key={municipio.codigoIbge}>
                  <td className="numero">{municipio.posicao}</td>
                  <td>{municipio.nome}</td>
                  <td className="numero">{municipio.codigoIbge}</td>
                  <td className="numero">{numero.format(municipio.respostasValidas)}</td>
                  <td className="numero">{percentual.format(municipio.percentual)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>
                  Total do recorte ({numero.format(ranking.municipios.length)}{' '}
                  {ranking.municipios.length === 1 ? 'município' : 'municípios'})
                </td>
                <td className="numero">{numero.format(ranking.total)}</td>
                <td className="numero">100,00%</td>
              </tr>
            </tfoot>
          </table>

          {!impressao && ranking.municipios.length > VISIVEIS_DE_INICIO ? (
            <button className="botao secundario" onClick={() => setExpandida((atual) => !atual)}>
              {expandida
                ? 'Mostrar apenas os primeiros'
                : `Mostrar todos os ${numero.format(ranking.municipios.length)} municípios`}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
