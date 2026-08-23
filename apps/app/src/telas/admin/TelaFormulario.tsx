import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

import {
  Formulario,
  PerguntaTipo,
  ROTULO_DO_STATUS,
  ROTULO_DO_TIPO,
  servicoFormularios,
} from '../../api/servico-formularios';
import { Botao, Cabecalho, Campo, Cartao, Etiqueta, Mensagem } from '../../ui/componentes';
import { cores } from '../../ui/cores';
import { ehSessaoEncerrada, mensagemDeFalha } from './erros';

interface Props {
  formularioId: string;
  aoAbrirPergunta: (perguntaId: string, editavel: boolean) => void;
  aoVoltar: () => void;
  aoPerderSessao: () => void;
}

const TIPOS: PerguntaTipo[] = [
  'UNICA_ESCOLHA',
  'MULTIPLA_ESCOLHA',
  'ESCALA',
  'TEXTO_LIVRE',
  'NUMERO',
];

export function TelaFormulario({
  formularioId,
  aoAbrirPergunta,
  aoVoltar,
  aoPerderSessao,
}: Props) {
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');

  const [novoEnunciado, setNovoEnunciado] = useState('');
  const [novoTipo, setNovoTipo] = useState<PerguntaTipo>('UNICA_ESCOLHA');
  const [novaObrigatoria, setNovaObrigatoria] = useState(true);
  const [novaEscalaMinimo, setNovaEscalaMinimo] = useState('0');
  const [novaEscalaMaximo, setNovaEscalaMaximo] = useState('10');

  const editavel = formulario?.status === 'RASCUNHO';

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const dados = await servicoFormularios.buscar(formularioId);
      setFormulario(dados);
      setTitulo(dados.titulo);
      setDescricao(dados.descricao ?? '');
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

  function salvarDados() {
    void executar(() =>
      servicoFormularios.atualizar(formularioId, {
        titulo: titulo.trim(),
        descricao: descricao.trim(),
      }),
    );
  }

  function acrescentarPergunta() {
    const entrada = {
      enunciado: novoEnunciado.trim(),
      tipo: novoTipo,
      obrigatoria: novaObrigatoria,
      ...(novoTipo === 'ESCALA'
        ? {
            escalaMinimo: Number(novaEscalaMinimo),
            escalaMaximo: Number(novaEscalaMaximo),
          }
        : {}),
    };

    void executar(async () => {
      await servicoFormularios.criarPergunta(formularioId, entrada);
      setNovoEnunciado('');
      setNovaObrigatoria(true);
    });
  }

  function mover(indice: number, direcao: -1 | 1) {
    if (!formulario) {
      return;
    }
    const ids = formulario.perguntas.map((pergunta) => pergunta.id);
    const destino = indice + direcao;
    if (destino < 0 || destino >= ids.length) {
      return;
    }
    [ids[indice], ids[destino]] = [ids[destino], ids[indice]];
    void executar(() => servicoFormularios.reordenarPerguntas(formularioId, ids));
  }

  function confirmarPublicacao() {
    Alert.alert(
      'Publicar pesquisa?',
      'Depois de entrar em coleta, perguntas e alternativas não podem mais ser alteradas. Para mudar o conteúdo será preciso criar uma nova versão.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Publicar',
          onPress: () => void executar(() => servicoFormularios.publicar(formularioId)),
        },
      ],
    );
  }

  function confirmarEncerramento() {
    Alert.alert(
      'Encerrar a coleta?',
      'Novas respostas deixam de ser aceitas. Os resultados continuam disponíveis.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Encerrar',
          style: 'destructive',
          onPress: () => void executar(() => servicoFormularios.encerrar(formularioId)),
        },
      ],
    );
  }

  function confirmarExclusaoDePergunta(perguntaId: string) {
    Alert.alert('Remover esta pergunta?', 'A ação não pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () =>
          void executar(() => servicoFormularios.excluirPergunta(formularioId, perguntaId)),
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

  if (!formulario) {
    return (
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Cabecalho titulo="Pesquisa" aoVoltar={aoVoltar} />
        <Mensagem texto={erro ?? 'Pesquisa não encontrada.'} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={estilos.conteudo}>
      <Cabecalho
        titulo={formulario.titulo}
        subtitulo={`${ROTULO_DO_STATUS[formulario.status]} · versão ${formulario.versao}`}
        aoVoltar={aoVoltar}
      />

      {erro ? <Mensagem texto={erro} /> : null}

      {!editavel ? (
        <Cartao>
          <Text style={estilos.avisoImutavel}>
            Esta pesquisa já saiu do rascunho: perguntas e alternativas são imutáveis.
          </Text>
        </Cartao>
      ) : null}

      <Text style={estilos.secao}>Dados da pesquisa</Text>
      <Cartao>
        <Campo rotulo="Título" value={titulo} onChangeText={setTitulo} editable={editavel} />
        <Campo
          rotulo="Descrição"
          value={descricao}
          onChangeText={setDescricao}
          editable={editavel}
          multiline
        />
        {editavel ? (
          <Botao titulo="Salvar dados" aoTocar={salvarDados} carregando={ocupado} />
        ) : null}
      </Cartao>

      <Text style={estilos.secao}>
        Perguntas ({formulario.perguntas.length})
      </Text>

      {formulario.perguntas.map((pergunta, indice) => (
        <Cartao key={pergunta.id}>
          <View style={estilos.perguntaTopo}>
            <Text style={estilos.perguntaOrdem}>{pergunta.ordem}.</Text>
            <TouchableOpacity
              style={estilos.perguntaCorpo}
              onPress={() => aoAbrirPergunta(pergunta.id, editavel)}
              accessibilityRole="button"
            >
              <Text style={estilos.perguntaEnunciado}>{pergunta.enunciado}</Text>
              <View style={estilos.perguntaEtiquetas}>
                <Etiqueta texto={ROTULO_DO_TIPO[pergunta.tipo]} />
                <Etiqueta texto={pergunta.obrigatoria ? 'Obrigatória' : 'Opcional'} />
                {pergunta.alternativas.length > 0 ? (
                  <Etiqueta texto={`${pergunta.alternativas.length} alternativas`} />
                ) : null}
                {pergunta.tipo === 'ESCALA' ? (
                  <Etiqueta texto={`${pergunta.escalaMinimo} a ${pergunta.escalaMaximo}`} />
                ) : null}
              </View>
            </TouchableOpacity>
          </View>

          {editavel ? (
            <View style={estilos.perguntaAcoes}>
              <TouchableOpacity onPress={() => mover(indice, -1)} disabled={indice === 0}>
                <Text style={[estilos.acao, indice === 0 && estilos.acaoInativa]}>↑ subir</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => mover(indice, 1)}
                disabled={indice === formulario.perguntas.length - 1}
              >
                <Text
                  style={[
                    estilos.acao,
                    indice === formulario.perguntas.length - 1 && estilos.acaoInativa,
                  ]}
                >
                  ↓ descer
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => confirmarExclusaoDePergunta(pergunta.id)}>
                <Text style={[estilos.acao, estilos.acaoPerigo]}>remover</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </Cartao>
      ))}

      {editavel ? (
        <Cartao>
          <Text style={estilos.subsecao}>Nova pergunta</Text>
          <Campo
            rotulo="Enunciado"
            value={novoEnunciado}
            onChangeText={setNovoEnunciado}
            placeholder="Ex.: Em quem você votaria hoje?"
            multiline
          />

          <Text style={estilos.rotulo}>Tipo</Text>
          <View style={estilos.tipos}>
            {TIPOS.map((tipo) => (
              <TouchableOpacity
                key={tipo}
                onPress={() => setNovoTipo(tipo)}
                style={[estilos.tipo, novoTipo === tipo && estilos.tipoSelecionado]}
                accessibilityRole="button"
              >
                <Text style={[estilos.tipoTexto, novoTipo === tipo && estilos.tipoTextoSelecionado]}>
                  {ROTULO_DO_TIPO[tipo]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {novoTipo === 'ESCALA' ? (
            <View style={estilos.linhaBotoes}>
              <View style={estilos.metade}>
                <Campo
                  rotulo="Mínimo"
                  value={novaEscalaMinimo}
                  onChangeText={setNovaEscalaMinimo}
                  keyboardType="number-pad"
                />
              </View>
              <View style={estilos.metade}>
                <Campo
                  rotulo="Máximo"
                  value={novaEscalaMaximo}
                  onChangeText={setNovaEscalaMaximo}
                  keyboardType="number-pad"
                />
              </View>
            </View>
          ) : null}

          <View style={estilos.linhaSwitch}>
            <Text style={estilos.rotulo}>Resposta obrigatória</Text>
            <Switch value={novaObrigatoria} onValueChange={setNovaObrigatoria} />
          </View>

          <Botao
            titulo="Acrescentar pergunta"
            aoTocar={acrescentarPergunta}
            carregando={ocupado}
            desabilitado={novoEnunciado.trim().length < 3}
          />
        </Cartao>
      ) : null}

      <View style={estilos.rodape}>
        {formulario.status === 'RASCUNHO' ? (
          <Botao
            titulo="Publicar pesquisa"
            aoTocar={confirmarPublicacao}
            desabilitado={ocupado || formulario.perguntas.length === 0}
          />
        ) : null}
        {formulario.status === 'EM_COLETA' ? (
          <Botao titulo="Encerrar coleta" variante="perigo" aoTocar={confirmarEncerramento} />
        ) : null}
      </View>
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
  subsecao: { fontSize: 14, fontWeight: '600', color: cores.texto, marginBottom: 12 },
  avisoImutavel: { fontSize: 13, color: cores.suave, lineHeight: 19 },
  perguntaTopo: { flexDirection: 'row', gap: 8 },
  perguntaOrdem: { fontSize: 14, color: cores.suave, paddingTop: 1 },
  perguntaCorpo: { flex: 1 },
  perguntaEnunciado: { fontSize: 15, color: cores.texto, marginBottom: 8 },
  perguntaEtiquetas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  perguntaAcoes: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
    paddingTop: 10,
  },
  acao: { fontSize: 12, color: cores.suave },
  acaoInativa: { opacity: 0.35 },
  acaoPerigo: { color: cores.erro },
  rotulo: { fontSize: 13, color: cores.suave, marginBottom: 6 },
  tipos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  tipo: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tipoSelecionado: { backgroundColor: cores.acao, borderColor: cores.acao },
  tipoTexto: { fontSize: 12, color: cores.texto },
  tipoTextoSelecionado: { color: cores.fundoBotaoTexto },
  linhaSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  linhaBotoes: { flexDirection: 'row', gap: 10 },
  metade: { flex: 1 },
  rodape: { marginTop: 12, gap: 10 },
});
