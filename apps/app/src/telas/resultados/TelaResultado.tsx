import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { SessaoEncerrada } from '../../api/cliente-autenticado';
import { TIPOS_COM_ALTERNATIVA } from '../../api/servico-formularios';
import {
  Indicadores,
  MunicipioComResultado,
  PerguntaComResultado,
  PontoDaEvolucao,
  servicoResultados,
} from '../../api/servico-resultados';
import { Cabecalho, Cartao, Mensagem } from '../../ui/componentes';
import { cores } from '../../ui/cores';
import { Fatia, GraficoDeBarras, GraficoDeEvolucao, GraficoDePizza } from '../../ui/graficos';

interface Props {
  formularioId: string;
  titulo: string;
  aoVoltar: () => void;
  aoPerderSessao: () => void;
}

interface Dados {
  indicadores: Indicadores;
  perguntas: PerguntaComResultado[];
  pontos: PontoDaEvolucao[];
  municipios: MunicipioComResultado[];
}

const MUNICIPIOS_NO_RANKING = 10;

function paraFatias(pergunta: PerguntaComResultado): Fatia[] {
  return pergunta.alternativas.map((alternativa) => ({
    chave: alternativa.alternativaId,
    rotulo: alternativa.texto,
    total: alternativa.total,
    percentual: alternativa.percentual,
  }));
}

function formatarMomento(iso: string): string {
  const data = new Date(iso);
  return data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Resultados de uma pesquisa. Os números vêm das agregações pré-calculadas, as
 * mesmas do painel web — por isso o carimbo de atualização aparece na tela: o
 * que se vê tem a idade do último ciclo, não do último envio.
 */
export function TelaResultado({ formularioId, titulo, aoVoltar, aoPerderSessao }: Props) {
  const { width } = useWindowDimensions();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  /** Cada pergunta alterna entre barras e pizza; barras é o padrão por caber melhor. */
  const [emPizza, setEmPizza] = useState<Record<string, boolean>>({});

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [indicadores, perguntas, evolucao, ranking] = await Promise.all([
        servicoResultados.indicadores(formularioId),
        servicoResultados.perguntas(formularioId),
        servicoResultados.evolucao(formularioId),
        servicoResultados.rankingDeMunicipios(formularioId),
      ]);

      setDados({
        indicadores,
        perguntas: perguntas.perguntas,
        pontos: evolucao.pontos,
        municipios: ranking.municipios.slice(0, MUNICIPIOS_NO_RANKING),
      });
    } catch (falha) {
      if (falha instanceof SessaoEncerrada) {
        aoPerderSessao();
        return;
      }
      setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar os resultados.');
    }
  }, [formularioId, aoPerderSessao]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const atualizar = useCallback(async () => {
    setAtualizando(true);
    await carregar();
    setAtualizando(false);
  }, [carregar]);

  if (!dados) {
    return (
      <View style={estilos.raiz}>
        <Cabecalho titulo={titulo} aoVoltar={aoVoltar} />
        <View style={estilos.centro}>
          {erro ? <Mensagem texto={erro} /> : <ActivityIndicator color={cores.acao} />}
        </View>
      </View>
    );
  }

  const { indicadores, perguntas, pontos, municipios } = dados;
  const comAlternativa = perguntas.filter((p) => TIPOS_COM_ALTERNATIVA.includes(p.tipo));
  const larguraDoGrafico = width - 24 * 2 - 16 * 2;

  return (
    <View style={estilos.raiz}>
      <Cabecalho titulo={titulo} subtitulo="Resultados" aoVoltar={aoVoltar} />

      <ScrollView
        contentContainerStyle={estilos.conteudo}
        refreshControl={
          <RefreshControl refreshing={atualizando} onRefresh={atualizar} tintColor={cores.acao} />
        }
      >
        {erro ? <Mensagem texto={erro} /> : null}

        <Cartao>
          <Text style={estilos.secao}>Indicadores</Text>
          <View style={estilos.indicadores}>
            <Indicador rotulo="Respostas válidas" valor={indicadores.respostasValidas} />
            <Indicador
              rotulo="Municípios alcançados"
              valor={`${indicadores.municipiosAlcancados} de ${indicadores.municipiosDaBahia}`}
            />
            <Indicador rotulo="Em conferência" valor={indicadores.respostasEmConferencia} />
            <Indicador rotulo="Invalidadas" valor={indicadores.respostasInvalidadas} />
          </View>
          <Text style={estilos.carimbo}>
            Agregação de {formatarMomento(indicadores.atualizadoEm)}. Puxe para atualizar.
          </Text>
        </Cartao>

        <Cartao>
          <Text style={estilos.secao}>Evolução da coleta</Text>
          <GraficoDeEvolucao pontos={pontos} largura={larguraDoGrafico} />
        </Cartao>

        {comAlternativa.length === 0 ? (
          <Cartao>
            <Text style={estilos.vazio}>
              Esta pesquisa não tem pergunta de alternativa — texto livre, número e escala não
              geram gráfico de distribuição.
            </Text>
          </Cartao>
        ) : null}

        {comAlternativa.map((pergunta) => {
          const pizza = emPizza[pergunta.perguntaId] ?? false;
          const fatias = paraFatias(pergunta);

          return (
            <Cartao key={pergunta.perguntaId}>
              <Text style={estilos.enunciado}>
                {pergunta.ordem}. {pergunta.enunciado}
              </Text>
              <Text style={estilos.totalDaPergunta}>
                {pergunta.totalDeRespostas}{' '}
                {pergunta.totalDeRespostas === 1 ? 'resposta' : 'respostas'}
              </Text>

              {pergunta.totalDeRespostas === 0 ? (
                <Text style={estilos.vazio}>Sem resposta nesta pergunta ainda.</Text>
              ) : (
                <>
                  <View style={estilos.alternador}>
                    <Alternador
                      rotulo="Barras"
                      ativo={!pizza}
                      aoTocar={() =>
                        setEmPizza((atual) => ({ ...atual, [pergunta.perguntaId]: false }))
                      }
                    />
                    <Alternador
                      rotulo="Pizza"
                      ativo={pizza}
                      aoTocar={() =>
                        setEmPizza((atual) => ({ ...atual, [pergunta.perguntaId]: true }))
                      }
                    />
                  </View>

                  {pizza ? <GraficoDePizza fatias={fatias} /> : <GraficoDeBarras fatias={fatias} />}
                </>
              )}
            </Cartao>
          );
        })}

        {municipios.length > 0 ? (
          <Cartao>
            <Text style={estilos.secao}>Municípios com mais respostas</Text>
            {municipios.map((municipio, indice) => (
              <View key={municipio.codigoIbge} style={estilos.linhaDoMunicipio}>
                <Text style={estilos.posicao}>{indice + 1}</Text>
                <Text style={estilos.nomeDoMunicipio} numberOfLines={1}>
                  {municipio.nome}
                </Text>
                <Text style={estilos.totalDoMunicipio}>{municipio.respostasValidas}</Text>
              </View>
            ))}
          </Cartao>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Indicador({ rotulo, valor }: { rotulo: string; valor: number | string }) {
  return (
    <View style={estilos.indicador}>
      <Text style={estilos.indicadorValor}>{valor}</Text>
      <Text style={estilos.indicadorRotulo}>{rotulo}</Text>
    </View>
  );
}

function Alternador({
  rotulo,
  ativo,
  aoTocar,
}: {
  rotulo: string;
  ativo: boolean;
  aoTocar: () => void;
}) {
  return (
    <Pressable
      onPress={aoTocar}
      accessibilityRole="button"
      accessibilityState={{ selected: ativo }}
      style={[estilos.opcao, ativo && estilos.opcaoAtiva]}
    >
      <Text style={[estilos.opcaoTexto, ativo && estilos.opcaoTextoAtivo]}>{rotulo}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.fundo },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  conteudo: { padding: 24, paddingBottom: 48, gap: 16 },

  secao: { fontSize: 13, color: cores.suave, marginBottom: 10 },
  carimbo: { fontSize: 12, color: cores.suave, marginTop: 12 },
  vazio: { fontSize: 13, color: cores.suave, lineHeight: 20 },

  indicadores: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  indicador: { minWidth: '40%' },
  indicadorValor: { fontSize: 22, fontWeight: '600', color: cores.texto },
  indicadorRotulo: { fontSize: 12, color: cores.suave, marginTop: 2 },

  enunciado: { fontSize: 15, fontWeight: '600', color: cores.texto, lineHeight: 21 },
  totalDaPergunta: { fontSize: 12, color: cores.suave, marginTop: 2, marginBottom: 12 },

  alternador: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  opcao: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  opcaoAtiva: { backgroundColor: cores.acao, borderColor: cores.acao },
  opcaoTexto: { fontSize: 13, color: cores.texto },
  opcaoTextoAtivo: { color: cores.fundoBotaoTexto },

  linhaDoMunicipio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.borda,
  },
  posicao: { fontSize: 12, color: cores.suave, width: 20 },
  nomeDoMunicipio: { flex: 1, fontSize: 14, color: cores.texto },
  totalDoMunicipio: { fontSize: 14, color: cores.texto, fontVariant: ['tabular-nums'] },
});
