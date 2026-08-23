import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { PerguntaPublica, ValorDaResposta } from '../../coleta/tipos';
import { Botao } from '../../ui/componentes';
import { cores } from '../../ui/cores';

interface Props {
  pergunta: PerguntaPublica;
  valor: ValorDaResposta | undefined;
  posicao: number;
  total: number;
  podeAvancar: boolean;
  aoResponder: (valor: ValorDaResposta | undefined) => void;
  aoAvancar: () => void;
  aoVoltar: () => void;
}

/**
 * Uma pergunta por tela, com progresso.
 * A resposta é gravada no aparelho a cada mudança — quem fecha o app no meio
 * não perde nada.
 */
export function TelaPerguntaColeta({
  pergunta,
  valor,
  posicao,
  total,
  podeAvancar,
  aoResponder,
  aoAvancar,
  aoVoltar,
}: Props) {
  function alternarMultipla(alternativaId: string) {
    const marcadas = valor?.tipo === 'alternativas' ? valor.alternativaIds : [];
    const novas = marcadas.includes(alternativaId)
      ? marcadas.filter((id) => id !== alternativaId)
      : [...marcadas, alternativaId];
    aoResponder(novas.length > 0 ? { tipo: 'alternativas', alternativaIds: novas } : undefined);
  }

  function renderizarControle() {
    if (pergunta.tipo === 'UNICA_ESCOLHA') {
      return pergunta.alternativas.map((alternativa) => {
        const marcada = valor?.tipo === 'alternativa' && valor.alternativaId === alternativa.id;
        return (
          <TouchableOpacity
            key={alternativa.id}
            style={[estilos.opcao, marcada && estilos.opcaoMarcada]}
            onPress={() => aoResponder({ tipo: 'alternativa', alternativaId: alternativa.id })}
            accessibilityRole="radio"
            accessibilityState={{ selected: marcada }}
          >
            <View style={[estilos.marca, marcada && estilos.marcaAtiva]} />
            <Text style={estilos.opcaoTexto}>{alternativa.texto}</Text>
          </TouchableOpacity>
        );
      });
    }

    if (pergunta.tipo === 'MULTIPLA_ESCOLHA') {
      const marcadas = valor?.tipo === 'alternativas' ? valor.alternativaIds : [];
      return pergunta.alternativas.map((alternativa) => {
        const marcada = marcadas.includes(alternativa.id);
        return (
          <TouchableOpacity
            key={alternativa.id}
            style={[estilos.opcao, marcada && estilos.opcaoMarcada]}
            onPress={() => alternarMultipla(alternativa.id)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: marcada }}
          >
            <View style={[estilos.marca, estilos.marcaQuadrada, marcada && estilos.marcaAtiva]} />
            <Text style={estilos.opcaoTexto}>{alternativa.texto}</Text>
          </TouchableOpacity>
        );
      });
    }

    if (pergunta.tipo === 'ESCALA') {
      const minimo = pergunta.escalaMinimo ?? 0;
      const maximo = pergunta.escalaMaximo ?? 10;
      const notas = Array.from({ length: maximo - minimo + 1 }, (_, indice) => minimo + indice);
      const escolhida = valor?.tipo === 'numero' ? valor.valor : null;

      return (
        <View>
          <View style={estilos.escala}>
            {notas.map((nota) => (
              <TouchableOpacity
                key={nota}
                style={[estilos.nota, escolhida === nota && estilos.notaAtiva]}
                onPress={() => aoResponder({ tipo: 'numero', valor: nota })}
                accessibilityRole="button"
                accessibilityState={{ selected: escolhida === nota }}
              >
                <Text style={[estilos.notaTexto, escolhida === nota && estilos.notaTextoAtivo]}>
                  {nota}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {pergunta.escalaRotuloMinimo || pergunta.escalaRotuloMaximo ? (
            <View style={estilos.rotulos}>
              <Text style={estilos.rotulo}>{pergunta.escalaRotuloMinimo ?? ''}</Text>
              <Text style={estilos.rotulo}>{pergunta.escalaRotuloMaximo ?? ''}</Text>
            </View>
          ) : null}
        </View>
      );
    }

    if (pergunta.tipo === 'NUMERO') {
      return (
        <TextInput
          style={estilos.campo}
          value={valor?.tipo === 'numero' ? String(valor.valor) : ''}
          onChangeText={(texto) => {
            const limpo = texto.replace(/[^0-9]/g, '');
            aoResponder(limpo.length > 0 ? { tipo: 'numero', valor: Number(limpo) } : undefined);
          }}
          keyboardType="number-pad"
          placeholder="Digite um número"
          placeholderTextColor={cores.suave}
          maxLength={9}
        />
      );
    }

    return (
      <>
        <TextInput
          style={[estilos.campo, estilos.campoAlto]}
          value={valor?.tipo === 'texto' ? valor.valor : ''}
          onChangeText={(texto) =>
            aoResponder(texto.length > 0 ? { tipo: 'texto', valor: texto } : undefined)
          }
          multiline
          maxLength={1000}
          placeholder="Escreva sua resposta"
          placeholderTextColor={cores.suave}
        />
        <Text style={estilos.avisoTexto}>
          Não escreva nome, telefone ou qualquer dado que identifique você.
        </Text>
      </>
    );
  }

  return (
    <View style={estilos.container}>
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <TouchableOpacity onPress={aoVoltar} accessibilityRole="button">
          <Text style={estilos.voltar}>‹ Voltar</Text>
        </TouchableOpacity>

        <Text style={estilos.progresso}>
          Pergunta {posicao} de {total}
        </Text>
        <View style={estilos.barra}>
          <View style={[estilos.barraCheia, { width: `${(posicao / total) * 100}%` }]} />
        </View>

        <Text style={estilos.enunciado}>
          {pergunta.enunciado}
          {pergunta.obrigatoria ? <Text style={estilos.obrigatoria}> *</Text> : null}
        </Text>
        {!pergunta.obrigatoria ? (
          <Text style={estilos.opcional}>Responder esta pergunta é opcional.</Text>
        ) : null}

        <View style={estilos.controle}>{renderizarControle()}</View>
      </ScrollView>

      <View style={estilos.rodape}>
        {!podeAvancar ? (
          <Text style={estilos.pendencia}>Escolha uma resposta para continuar.</Text>
        ) : null}
        <Botao
          titulo={posicao === total ? 'Revisar respostas' : 'Avançar'}
          aoTocar={aoAvancar}
          desabilitado={!podeAvancar}
        />
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: 24, paddingTop: 64, paddingBottom: 24 },
  voltar: { color: cores.suave, fontSize: 14, marginBottom: 16 },
  progresso: { fontSize: 12, color: cores.suave, marginBottom: 6 },
  barra: {
    height: 4,
    backgroundColor: cores.borda,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 22,
  },
  barraCheia: { height: '100%', backgroundColor: cores.acao },
  enunciado: { fontSize: 18, color: cores.texto, lineHeight: 25 },
  obrigatoria: { color: cores.erro },
  opcional: { fontSize: 12, color: cores.suave, marginTop: 6 },
  controle: { marginTop: 20, gap: 8 },
  opcao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 8,
    padding: 14,
  },
  opcaoMarcada: { borderColor: cores.acao },
  marca: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: cores.borda },
  marcaQuadrada: { borderRadius: 4 },
  marcaAtiva: { backgroundColor: cores.acao, borderColor: cores.acao },
  opcaoTexto: { flex: 1, fontSize: 15, color: cores.texto },
  escala: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nota: {
    minWidth: 44,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 8,
    alignItems: 'center',
  },
  notaAtiva: { backgroundColor: cores.acao, borderColor: cores.acao },
  notaTexto: { fontSize: 15, color: cores.texto },
  notaTextoAtivo: { color: cores.fundoBotaoTexto },
  rotulos: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  rotulo: { fontSize: 12, color: cores.suave },
  campo: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: cores.texto,
  },
  campoAlto: { minHeight: 120, textAlignVertical: 'top' },
  avisoTexto: { fontSize: 12, color: cores.suave, marginTop: 8, lineHeight: 17 },
  rodape: { padding: 24, borderTopWidth: 1, borderTopColor: cores.borda, gap: 8 },
  pendencia: { fontSize: 12, color: cores.suave },
});
