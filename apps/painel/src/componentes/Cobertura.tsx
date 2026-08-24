import { useMemo, useState } from 'react';

import { Cobertura as CoberturaDeResultado } from '../api/servico-resultados';

interface Props {
  cobertura: CoberturaDeResultado;
  impressao?: boolean;
}

const numero = new Intl.NumberFormat('pt-BR');

/**
 * Cobertura da Bahia: onde a pesquisa chegou e, principalmente, onde não
 * chegou. A lista de não alcançados é a que orienta o próximo dia de campo,
 * então ela aparece por inteiro — nada de "e mais N municípios".
 *
 * Sempre sobre a pesquisa inteira: cobertura é alcance acumulado da coleta, não
 * recorte de leitura.
 */
export function Cobertura({ cobertura, impressao = false }: Props) {
  const [mostrarFaltantes, setMostrarFaltantes] = useState(false);

  const faltantes = useMemo(
    () => cobertura.municipios.filter((municipio) => municipio.respostasValidas === 0),
    [cobertura.municipios],
  );

  const listaVisivel = impressao || mostrarFaltantes;

  return (
    <div className="cartao">
      <h2>Cobertura da Bahia</h2>

      <div className="barra-cobertura" aria-hidden="true">
        <div
          className="barra-cobertura-preenchida"
          style={{ width: `${cobertura.percentualDeCobertura}%` }}
        />
      </div>

      <p>
        <strong>{numero.format(cobertura.alcancados)}</strong> de{' '}
        {numero.format(cobertura.municipiosDaBahia)} municípios com ao menos uma resposta válida —{' '}
        {cobertura.percentualDeCobertura.toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
        % da Bahia. Faltam {numero.format(faltantes.length)}.
      </p>

      {faltantes.length > 0 ? (
        <>
          {!impressao ? (
            <button
              className="botao secundario"
              onClick={() => setMostrarFaltantes((atual) => !atual)}
            >
              {mostrarFaltantes ? 'Ocultar não alcançados' : 'Ver municípios não alcançados'}
            </button>
          ) : null}

          {listaVisivel ? (
            <ul className="lista-municipios">
              {faltantes.map((municipio) => (
                <li key={municipio.codigoIbge}>{municipio.nome}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className="aviso">Todos os municípios da Bahia já têm resposta válida.</p>
      )}

      <p className="aviso">
        A cobertura considera a pesquisa inteira, independentemente do período filtrado.
      </p>
    </div>
  );
}
