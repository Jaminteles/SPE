import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  Filtros as FiltrosDeResultado,
  FormularioComResultado,
  Indicadores as IndicadoresDeResultado,
  MunicipioComResultado,
  PerguntaComResultado,
  PontoDaEvolucao,
  servicoResultados,
} from '../api/servico-resultados';
import { Filtros } from '../componentes/Filtros';
import { GraficoDeBarras, GraficoDeEvolucao, GraficoDePizza } from '../componentes/Graficos';
import { Indicadores } from '../componentes/Indicadores';
import { SessaoEncerrada, UsuarioLogado } from '../auth/sessao';

interface Props {
  usuario: UsuarioLogado;
  aoSair: () => void;
  aoPerderSessao: () => void;
}

const NOME_DO_PERFIL: Record<UsuarioLogado['perfil'], string> = {
  ADMINISTRADOR: 'Administrador',
  ANALISTA: 'Analista',
};

/**
 * Painel de resultados.
 *
 * Toda leitura vem de agregação pré-calculada na API. Mudar filtro recarrega os
 * quatro blocos em paralelo — são quatro consultas sobre view materializada, não
 * varredura de resposta.
 */
export function Painel({ usuario, aoSair, aoPerderSessao }: Props) {
  const [formularios, setFormularios] = useState<FormularioComResultado[]>([]);
  const [formularioId, setFormularioId] = useState<string>('');
  const [filtros, setFiltros] = useState<FiltrosDeResultado>({});

  const [indicadores, setIndicadores] = useState<IndicadoresDeResultado | null>(null);
  const [perguntas, setPerguntas] = useState<PerguntaComResultado[]>([]);
  const [evolucao, setEvolucao] = useState<PontoDaEvolucao[]>([]);
  const [municipios, setMunicipios] = useState<MunicipioComResultado[]>([]);

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const tratarFalha = useCallback(
    (falha: unknown) => {
      if (falha instanceof SessaoEncerrada) {
        aoPerderSessao();
        return;
      }
      setErro(
        falha instanceof Error ? falha.message : 'Não foi possível carregar os resultados.',
      );
    },
    [aoPerderSessao],
  );

  useEffect(() => {
    let ativo = true;

    servicoResultados
      .formularios()
      .then((lista) => {
        if (!ativo) {
          return;
        }
        setFormularios(lista);
        setFormularioId((atual) => atual || lista[0]?.id || '');
        if (lista.length === 0) {
          setCarregando(false);
        }
      })
      .catch((falha) => {
        if (ativo) {
          tratarFalha(falha);
          setCarregando(false);
        }
      });

    return () => {
      ativo = false;
    };
  }, [tratarFalha]);

  useEffect(() => {
    if (!formularioId) {
      return;
    }

    let ativo = true;
    setCarregando(true);
    setErro(null);

    Promise.all([
      servicoResultados.indicadores(formularioId, filtros),
      servicoResultados.porPergunta(formularioId, filtros),
      servicoResultados.evolucao(formularioId, filtros),
      servicoResultados.municipios(formularioId),
    ])
      .then(([indicadoresNovos, resultado, serie, alcance]) => {
        if (!ativo) {
          return;
        }
        setIndicadores(indicadoresNovos);
        setPerguntas(resultado.perguntas);
        setEvolucao(serie.pontos);
        setMunicipios(alcance.municipios);
      })
      .catch((falha) => {
        if (ativo) {
          tratarFalha(falha);
        }
      })
      .finally(() => {
        if (ativo) {
          setCarregando(false);
        }
      });

    return () => {
      ativo = false;
    };
  }, [formularioId, filtros, tratarFalha]);

  /** O gráfico principal mostra a pergunta filtrada, ou a primeira com resultado. */
  const perguntaEmFoco = useMemo(() => {
    if (perguntas.length === 0) {
      return null;
    }
    if (filtros.perguntaId) {
      return perguntas.find((pergunta) => pergunta.perguntaId === filtros.perguntaId) ?? null;
    }
    return perguntas.find((pergunta) => pergunta.totalDeRespostas > 0) ?? perguntas[0];
  }, [perguntas, filtros.perguntaId]);

  const temFiltro = Boolean(
    filtros.perguntaId || filtros.municipioCodigoIbge || filtros.de || filtros.ate,
  );

  return (
    <div className="pagina">
      <header className="cabecalho">
        <div>
          <h1>Painel de Resultados</h1>
          <p>
            {usuario.nome} · {NOME_DO_PERFIL[usuario.perfil]}
          </p>
        </div>
        <button className="botao secundario" onClick={aoSair}>
          Sair
        </button>
      </header>

      {formularios.length === 0 && !carregando ? (
        <div className="cartao">
          <h2>Nenhuma pesquisa publicada</h2>
          <p className="aviso">
            O resultado aparece aqui assim que uma pesquisa for publicada e começar a receber
            respostas.
          </p>
        </div>
      ) : null}

      {formularios.length > 0 ? (
        <>
          <Filtros
            formularios={formularios}
            formularioId={formularioId}
            perguntas={perguntas}
            municipios={municipios}
            filtros={filtros}
            aoTrocarFormulario={(novo) => {
              setFormularioId(novo);
              setFiltros({});
            }}
            aoTrocarFiltros={setFiltros}
            aoLimpar={() => setFiltros({})}
          />

          {erro ? <p className="erro">{erro}</p> : null}

          {indicadores ? <Indicadores indicadores={indicadores} filtrado={temFiltro} /> : null}

          <div className="graficos">
            <GraficoDeBarras pergunta={perguntaEmFoco} />
            <GraficoDePizza pergunta={perguntaEmFoco} />
            <GraficoDeEvolucao pontos={evolucao} />
          </div>

          {perguntas.length > 1 && !filtros.perguntaId ? (
            <div className="cartao">
              <h2>Todas as perguntas</h2>
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Pergunta</th>
                    <th className="numero">Respostas</th>
                    <th>Mais escolhida</th>
                    <th className="numero">%</th>
                  </tr>
                </thead>
                <tbody>
                  {perguntas.map((pergunta) => {
                    const lider = [...pergunta.alternativas].sort((a, b) => b.total - a.total)[0];
                    return (
                      <tr key={pergunta.perguntaId}>
                        <td>
                          {pergunta.ordem}. {pergunta.enunciado}
                        </td>
                        <td className="numero">{pergunta.totalDeRespostas}</td>
                        <td>{pergunta.totalDeRespostas > 0 ? lider?.texto : '—'}</td>
                        <td className="numero">
                          {pergunta.totalDeRespostas > 0 ? `${lider?.percentual ?? 0}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <p className="aviso">
            Os números vêm de agregação pré-calculada e são recontados periodicamente. Percentuais
            são sempre sobre respostas válidas; respostas invalidadas continuam no banco, fora da
            contagem.
          </p>
        </>
      ) : null}

      {carregando ? <p className="aviso">Carregando…</p> : null}
    </div>
  );
}
