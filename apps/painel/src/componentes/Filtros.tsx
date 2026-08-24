import {
  Filtros as FiltrosDeResultado,
  FormularioComResultado,
  MunicipioComResultado,
  PerguntaComResultado,
} from '../api/servico-resultados';

interface Props {
  formularios: FormularioComResultado[];
  formularioId: string;
  perguntas: PerguntaComResultado[];
  municipios: MunicipioComResultado[];
  filtros: FiltrosDeResultado;
  aoTrocarFormulario: (formularioId: string) => void;
  aoTrocarFiltros: (filtros: FiltrosDeResultado) => void;
  aoLimpar: () => void;
}

/**
 * Filtros do painel: formulário, pergunta, município e período.
 *
 * O município vem da lista de quem já respondeu, sempre identificado por código
 * IBGE — não há campo de texto livre em lugar nenhum.
 */
export function Filtros({
  formularios,
  formularioId,
  perguntas,
  municipios,
  filtros,
  aoTrocarFormulario,
  aoTrocarFiltros,
  aoLimpar,
}: Props) {
  const temFiltro = Boolean(
    filtros.perguntaId || filtros.municipioCodigoIbge || filtros.de || filtros.ate,
  );

  return (
    <div className="filtros">
      <div className="campo">
        <label htmlFor="formulario">Pesquisa</label>
        <select
          id="formulario"
          value={formularioId}
          onChange={(evento) => aoTrocarFormulario(evento.target.value)}
        >
          {formularios.map((formulario) => (
            <option key={formulario.id} value={formulario.id}>
              {formulario.titulo} (v{formulario.versao})
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="pergunta">Pergunta</label>
        <select
          id="pergunta"
          value={filtros.perguntaId ?? ''}
          onChange={(evento) =>
            aoTrocarFiltros({ ...filtros, perguntaId: evento.target.value || undefined })
          }
        >
          <option value="">Todas</option>
          {perguntas.map((pergunta) => (
            <option key={pergunta.perguntaId} value={pergunta.perguntaId}>
              {pergunta.ordem}. {pergunta.enunciado}
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="municipio">Município</label>
        <select
          id="municipio"
          value={filtros.municipioCodigoIbge ?? ''}
          onChange={(evento) =>
            aoTrocarFiltros({
              ...filtros,
              municipioCodigoIbge: evento.target.value ? Number(evento.target.value) : undefined,
            })
          }
        >
          <option value="">Todos</option>
          {municipios.map((municipio) => (
            <option key={municipio.codigoIbge} value={municipio.codigoIbge}>
              {municipio.nome} ({municipio.respostasValidas})
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="de">De</label>
        <input
          id="de"
          type="date"
          value={filtros.de ?? ''}
          onChange={(evento) => aoTrocarFiltros({ ...filtros, de: evento.target.value || undefined })}
        />
      </div>

      <div className="campo">
        <label htmlFor="ate">Até</label>
        <input
          id="ate"
          type="date"
          value={filtros.ate ?? ''}
          onChange={(evento) =>
            aoTrocarFiltros({ ...filtros, ate: evento.target.value || undefined })
          }
        />
      </div>

      <div className="campo">
        <button className="botao secundario" onClick={aoLimpar} disabled={!temFiltro}>
          Limpar filtros
        </button>
      </div>
    </div>
  );
}
