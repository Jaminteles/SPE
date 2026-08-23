import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { Formulario, Pergunta, servicoFormularios } from '../../api/servico-formularios';
import { Cabecalho, Cartao, Mensagem } from '../../ui/componentes';
import { cores } from '../../ui/cores';
import { ehSessaoEncerrada, mensagemDeFalha } from './erros';

interface Props {
  formularioId: string;
  aoVoltar: () => void;
  aoPerderSessao: () => void;
}

/** Resposta local da pré-visualização. Nada disso é enviado nem gravado. */
type RespostaLocal = string | string[] | number | undefined;

/**
 * Pré-visualização do formulário como o respondente verá, incluindo a lógica
 * condicional: uma pergunta condicionada só aparece quando a alternativa que a
 * habilita é escolhida.
 *
 * É simulação: nenhuma resposta sai daqui e nada é gravado. A tela de coleta
 * de verdade, com consentimento e município, entra na sprint da coleta.
 */
export function TelaPreVisualizacao({ formularioId, aoVoltar, aoPerderSessao }: Props) {
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [respostas, setRespostas] = useState<Record<string, RespostaLocal>>({});

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setFormulario(await servicoFormularios.buscar(formularioId));
    } catch (falha) {
      if (ehSessaoEncerrada(falha)) {
        aoPerderSessao();
        return;
      }
      setErro(mensagemDeFalha(falha));
    } finally {
      setCarregando(false);
    }
  }, [formularioId, aoPerderSessao]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * Mesma regra do servidor: sem condição, sempre aparece; com condição,
   * aparece só quando a alternativa que a habilita está escolhida.
   */
  const visiveis = useMemo(() => {
    if (!formulario) {
      return [];
    }
    return formulario.perguntas.filter((pergunta) => {
      if (!pergunta.condicaoAlternativaId || !pergunta.condicaoPerguntaId) {
        return true;
      }
      return respostas[pergunta.condicaoPerguntaId] === pergunta.condicaoAlternativaId;
    });
  }, [formulario, respostas]);

  function responder(perguntaId: string, valor: RespostaLocal) {
    setRespostas((atual) => ({ ...atual, [perguntaId]: valor }));
  }

  function alternarMultipla(perguntaId: string, alternativaId: string) {
    setRespostas((atual) => {
      const marcadas = Array.isArray(atual[perguntaId]) ? (atual[perguntaId] as string[]) : [];
      return {
        ...atual,
        [perguntaId]: marcadas.includes(alternativaId)
          ? marcadas.filter((id) => id !== alternativaId)
          : [...marcadas, alternativaId],
      };
    });
  }

  function renderizar(pergunta: Pergunta) {
    const resposta = respostas[pergunta.id];

    if (pergunta.tipo === 'UNICA_ESCOLHA') {
      return pergunta.alternativas.map((alternativa) => (
        <TouchableOpacity
          key={alternativa.id}
          style={estilos.opcao}
          onPress={() => responder(pergunta.id, alternativa.id)}
          accessibilityRole="radio"
          accessibilityState={{ selected: resposta === alternativa.id }}
        >
          <View style={[estilos.marca, resposta === alternativa.id && estilos.marcaAtiva]} />
          <Text style={estilos.opcaoTexto}>{alternativa.texto}</Text>
        </TouchableOpacity>
      ));
    }

    if (pergunta.tipo === 'MULTIPLA_ESCOLHA') {
      const marcadas = Array.isArray(resposta) ? resposta : [];
      return pergunta.alternativas.map((alternativa) => (
        <TouchableOpacity
          key={alternativa.id}
          style={estilos.opcao}
          onPress={() => alternarMultipla(pergunta.id, alternativa.id)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: marcadas.includes(alternativa.id) }}
        >
          <View
            style={[
              estilos.marca,
              estilos.marcaQuadrada,
              marcadas.includes(alternativa.id) && estilos.marcaAtiva,
            ]}
          />
          <Text style={estilos.opcaoTexto}>{alternativa.texto}</Text>
        </TouchableOpacity>
      ));
    }

    if (pergunta.tipo === 'ESCALA') {
      const minimo = pergunta.escalaMinimo ?? 0;
      const maximo = pergunta.escalaMaximo ?? 10;
      const valores = Array.from({ length: maximo - minimo + 1 }, (_, indice) => minimo + indice);
      return (
        <View>
          <View style={estilos.escala}>
            {valores.map((valor) => (
              <TouchableOpacity
                key={valor}
                style={[estilos.nota, resposta === valor && estilos.notaAtiva]}
                onPress={() => responder(pergunta.id, valor)}
                accessibilityRole="button"
              >
                <Text style={[estilos.notaTexto, resposta === valor && estilos.notaTextoAtivo]}>
                  {valor}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {pergunta.escalaRotuloMinimo || pergunta.escalaRotuloMaximo ? (
            <View style={estilos.rotulosEscala}>
              <Text style={estilos.rotuloEscala}>{pergunta.escalaRotuloMinimo ?? ''}</Text>
              <Text style={estilos.rotuloEscala}>{pergunta.escalaRotuloMaximo ?? ''}</Text>
            </View>
          ) : null}
        </View>
      );
    }

    return (
      <TextInput
        style={[estilos.campo, pergunta.tipo === 'TEXTO_LIVRE' && estilos.campoAlto]}
        value={typeof resposta === 'string' ? resposta : ''}
        onChangeText={(texto) => responder(pergunta.id, texto)}
        multiline={pergunta.tipo === 'TEXTO_LIVRE'}
        keyboardType={pergunta.tipo === 'NUMERO' ? 'number-pad' : 'default'}
        placeholder={pergunta.tipo === 'NUMERO' ? 'Digite um número' : 'Digite sua resposta'}
        placeholderTextColor={cores.suave}
      />
    );
  }

  if (carregando) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator color={cores.acao} />
      </View>
    );
  }

  if (!formulario) {
    return (
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Cabecalho titulo="Pré-visualização" aoVoltar={aoVoltar} />
        <Mensagem texto={erro ?? 'Pesquisa não encontrada.'} />
      </ScrollView>
    );
  }

  const ocultas = formulario.perguntas.length - visiveis.length;

  return (
    <ScrollView contentContainerStyle={estilos.conteudo}>
      <Cabecalho
        titulo="Pré-visualização"
        subtitulo="Como o respondente verá"
        aoVoltar={aoVoltar}
      />

      {erro ? <Mensagem texto={erro} /> : null}

      <Cartao>
        <Text style={estilos.aviso}>
          Simulação. Nada do que for marcado aqui é enviado ou gravado.
          {ocultas > 0
            ? ` ${ocultas} ${ocultas === 1 ? 'pergunta está oculta' : 'perguntas estão ocultas'} pela lógica condicional.`
            : ''}
        </Text>
      </Cartao>

      <Text style={estilos.tituloFormulario}>{formulario.titulo}</Text>
      {formulario.descricao ? (
        <Text style={estilos.descricao}>{formulario.descricao}</Text>
      ) : null}

      {formulario.perguntas.length === 0 ? (
        <Text style={estilos.vazio}>Esta pesquisa ainda não tem perguntas.</Text>
      ) : null}

      {visiveis.map((pergunta, indice) => (
        <Cartao key={pergunta.id}>
          <Text style={estilos.enunciado}>
            {indice + 1}. {pergunta.enunciado}
            {pergunta.obrigatoria ? <Text style={estilos.obrigatoria}> *</Text> : null}
          </Text>
          {pergunta.condicaoAlternativaId ? (
            <Text style={estilos.condicao}>Apareceu por causa da resposta anterior.</Text>
          ) : null}
          <View style={estilos.controle}>{renderizar(pergunta)}</View>
        </Cartao>
      ))}

      {visiveis.length > 0 ? (
        <View style={estilos.rodape}>
          <Text style={estilos.rodapeTexto}>
            Fim da pré-visualização. O envio real só existe na tela de coleta, depois do
            consentimento e da escolha do município.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: 24, paddingTop: 64, paddingBottom: 56 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  aviso: { fontSize: 13, color: cores.suave, lineHeight: 19 },
  tituloFormulario: { fontSize: 18, fontWeight: '600', color: cores.texto, marginBottom: 4 },
  descricao: { fontSize: 14, color: cores.suave, marginBottom: 16, lineHeight: 20 },
  vazio: { fontSize: 14, color: cores.suave, marginTop: 12 },
  enunciado: { fontSize: 15, color: cores.texto, lineHeight: 21 },
  obrigatoria: { color: cores.erro },
  condicao: { fontSize: 11, color: cores.suave, marginTop: 4, fontStyle: 'italic' },
  controle: { marginTop: 12 },
  opcao: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
  marca: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: cores.borda,
  },
  marcaQuadrada: { borderRadius: 4 },
  marcaAtiva: { backgroundColor: cores.acao, borderColor: cores.acao },
  opcaoTexto: { fontSize: 14, color: cores.texto, flex: 1 },
  escala: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  nota: {
    minWidth: 38,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 6,
    alignItems: 'center',
  },
  notaAtiva: { backgroundColor: cores.acao, borderColor: cores.acao },
  notaTexto: { fontSize: 13, color: cores.texto },
  notaTextoAtivo: { color: cores.fundoBotaoTexto },
  rotulosEscala: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  rotuloEscala: { fontSize: 11, color: cores.suave },
  campo: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: cores.texto,
    backgroundColor: cores.fundo,
  },
  campoAlto: { minHeight: 88, textAlignVertical: 'top' },
  rodape: { marginTop: 8 },
  rodapeTexto: { fontSize: 12, color: cores.suave, lineHeight: 18 },
});
