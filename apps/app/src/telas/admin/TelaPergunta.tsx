import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

import {
  Pergunta,
  ROTULO_DO_TIPO,
  TIPOS_COM_ALTERNATIVA,
  servicoFormularios,
} from '../../api/servico-formularios';
import { Botao, Cabecalho, Campo, Cartao, Etiqueta, Mensagem } from '../../ui/componentes';
import { cores } from '../../ui/cores';
import { ehSessaoEncerrada, mensagemDeFalha } from './erros';

interface Props {
  formularioId: string;
  perguntaId: string;
  editavel: boolean;
  aoVoltar: () => void;
  aoPerderSessao: () => void;
}

export function TelaPergunta({
  formularioId,
  perguntaId,
  editavel,
  aoVoltar,
  aoPerderSessao,
}: Props) {
  const [pergunta, setPergunta] = useState<Pergunta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [enunciado, setEnunciado] = useState('');
  const [obrigatoria, setObrigatoria] = useState(true);
  const [rotuloMinimo, setRotuloMinimo] = useState('');
  const [rotuloMaximo, setRotuloMaximo] = useState('');
  const [novaAlternativa, setNovaAlternativa] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const formulario = await servicoFormularios.buscar(formularioId);
      const encontrada = formulario.perguntas.find((item) => item.id === perguntaId) ?? null;
      setPergunta(encontrada);
      if (encontrada) {
        setEnunciado(encontrada.enunciado);
        setObrigatoria(encontrada.obrigatoria);
        setRotuloMinimo(encontrada.escalaRotuloMinimo ?? '');
        setRotuloMaximo(encontrada.escalaRotuloMaximo ?? '');
      }
    } catch (falha) {
      if (ehSessaoEncerrada(falha)) {
        aoPerderSessao();
        return;
      }
      setErro(mensagemDeFalha(falha));
    } finally {
      setCarregando(false);
    }
  }, [formularioId, perguntaId, aoPerderSessao]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function executar(acao: () => Promise<unknown>) {
    setOcupado(true);
    setErro(null);
    try {
      await acao();
      await carregar();
    } catch (falha) {
      if (ehSessaoEncerrada(falha)) {
        aoPerderSessao();
        return;
      }
      setErro(mensagemDeFalha(falha));
    } finally {
      setOcupado(false);
    }
  }

  function salvar() {
    void executar(() =>
      servicoFormularios.atualizarPergunta(formularioId, perguntaId, {
        enunciado: enunciado.trim(),
        obrigatoria,
        ...(pergunta?.tipo === 'ESCALA'
          ? {
              ...(rotuloMinimo.trim() ? { escalaRotuloMinimo: rotuloMinimo.trim() } : {}),
              ...(rotuloMaximo.trim() ? { escalaRotuloMaximo: rotuloMaximo.trim() } : {}),
            }
          : {}),
      }),
    );
  }

  function acrescentarAlternativa() {
    void executar(async () => {
      await servicoFormularios.criarAlternativa(
        formularioId,
        perguntaId,
        novaAlternativa.trim(),
      );
      setNovaAlternativa('');
    });
  }

  function moverAlternativa(indice: number, direcao: -1 | 1) {
    if (!pergunta) {
      return;
    }
    const ids = pergunta.alternativas.map((alternativa) => alternativa.id);
    const destino = indice + direcao;
    if (destino < 0 || destino >= ids.length) {
      return;
    }
    [ids[indice], ids[destino]] = [ids[destino], ids[indice]];
    void executar(() => servicoFormularios.reordenarAlternativas(formularioId, perguntaId, ids));
  }

  function confirmarExclusao(alternativaId: string) {
    Alert.alert('Remover esta alternativa?', 'A ação não pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () =>
          void executar(() =>
            servicoFormularios.excluirAlternativa(formularioId, perguntaId, alternativaId),
          ),
      },
    ]);
  }

  if (carregando) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator color={cores.acao} />
      </View>
    );
  }

  if (!pergunta) {
    return (
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Cabecalho titulo="Pergunta" aoVoltar={aoVoltar} />
        <Mensagem texto={erro ?? 'Pergunta não encontrada.'} />
      </ScrollView>
    );
  }

  const aceitaAlternativa = TIPOS_COM_ALTERNATIVA.includes(pergunta.tipo);

  return (
    <ScrollView contentContainerStyle={estilos.conteudo}>
      <Cabecalho
        titulo={`Pergunta ${pergunta.ordem}`}
        subtitulo={ROTULO_DO_TIPO[pergunta.tipo]}
        aoVoltar={aoVoltar}
      />

      {erro ? <Mensagem texto={erro} /> : null}

      <Cartao>
        <Campo
          rotulo="Enunciado"
          value={enunciado}
          onChangeText={setEnunciado}
          editable={editavel}
          multiline
        />

        <View style={estilos.linhaSwitch}>
          <Text style={estilos.rotulo}>Resposta obrigatória</Text>
          <Switch value={obrigatoria} onValueChange={setObrigatoria} disabled={!editavel} />
        </View>

        {pergunta.tipo === 'ESCALA' ? (
          <>
            <Text style={estilos.escala}>
              Escala de {pergunta.escalaMinimo} a {pergunta.escalaMaximo}. A faixa é definida na
              criação da pergunta.
            </Text>
            <Campo
              rotulo="Rótulo do menor valor"
              value={rotuloMinimo}
              onChangeText={setRotuloMinimo}
              editable={editavel}
              placeholder="Ex.: Péssima"
            />
            <Campo
              rotulo="Rótulo do maior valor"
              value={rotuloMaximo}
              onChangeText={setRotuloMaximo}
              editable={editavel}
              placeholder="Ex.: Ótima"
            />
          </>
        ) : null}

        {pergunta.condicaoAlternativaId ? (
          <View style={estilos.condicao}>
            <Text style={estilos.condicaoTexto}>
              Esta pergunta só aparece para quem escolher a alternativa marcada em outra pergunta.
            </Text>
            {editavel ? (
              <TouchableOpacity
                onPress={() =>
                  void executar(() =>
                    servicoFormularios.atualizarPergunta(formularioId, perguntaId, {
                      enunciado: enunciado.trim(),
                      condicaoAlternativaId: null,
                    }),
                  )
                }
                accessibilityRole="button"
              >
                <Text style={estilos.removerCondicao}>Remover condição</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {editavel ? (
          <Botao
            titulo="Salvar pergunta"
            aoTocar={salvar}
            carregando={ocupado}
            desabilitado={enunciado.trim().length < 3}
          />
        ) : null}
      </Cartao>

      {aceitaAlternativa ? (
        <>
          <Text style={estilos.secao}>Alternativas ({pergunta.alternativas.length})</Text>

          {pergunta.alternativas.map((alternativa, indice) => (
            <Cartao key={alternativa.id}>
              <Text style={estilos.alternativaTexto}>
                {alternativa.ordem}. {alternativa.texto}
              </Text>
              {editavel ? (
                <View style={estilos.acoes}>
                  <TouchableOpacity
                    onPress={() => moverAlternativa(indice, -1)}
                    disabled={indice === 0}
                  >
                    <Text style={[estilos.acao, indice === 0 && estilos.acaoInativa]}>↑ subir</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => moverAlternativa(indice, 1)}
                    disabled={indice === pergunta.alternativas.length - 1}
                  >
                    <Text
                      style={[
                        estilos.acao,
                        indice === pergunta.alternativas.length - 1 && estilos.acaoInativa,
                      ]}
                    >
                      ↓ descer
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => confirmarExclusao(alternativa.id)}>
                    <Text style={[estilos.acao, estilos.acaoPerigo]}>remover</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </Cartao>
          ))}

          {editavel ? (
            <Cartao>
              <Campo
                rotulo="Nova alternativa"
                value={novaAlternativa}
                onChangeText={setNovaAlternativa}
                placeholder="Ex.: Candidato A"
              />
              <Botao
                titulo="Acrescentar alternativa"
                aoTocar={acrescentarAlternativa}
                carregando={ocupado}
                desabilitado={novaAlternativa.trim().length === 0}
              />
            </Cartao>
          ) : null}

          {pergunta.alternativas.length < 2 ? (
            <Etiqueta texto="A publicação exige ao menos duas alternativas" />
          ) : null}
        </>
      ) : (
        <Text style={estilos.semAlternativa}>
          Perguntas do tipo {ROTULO_DO_TIPO[pergunta.tipo].toLowerCase()} não têm alternativas.
        </Text>
      )}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: 24, paddingTop: 64, paddingBottom: 56 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  secao: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: cores.suave,
    marginTop: 8,
    marginBottom: 10,
  },
  rotulo: { fontSize: 13, color: cores.suave },
  linhaSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  escala: { fontSize: 13, color: cores.suave, marginBottom: 14, lineHeight: 18 },
  alternativaTexto: { fontSize: 14, color: cores.texto },
  acoes: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
    paddingTop: 8,
  },
  acao: { fontSize: 12, color: cores.suave },
  acaoInativa: { opacity: 0.35 },
  acaoPerigo: { color: cores.erro },
  semAlternativa: { fontSize: 13, color: cores.suave, marginTop: 8 },
  condicao: {
    borderTopWidth: 1,
    borderTopColor: cores.borda,
    paddingTop: 12,
    marginBottom: 16,
    gap: 8,
  },
  condicaoTexto: { fontSize: 12, color: cores.suave, lineHeight: 17 },
  removerCondicao: { fontSize: 12, color: cores.erro },
});
