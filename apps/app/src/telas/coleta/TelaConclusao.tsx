import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Botao, Cartao } from '../../ui/componentes';
import { cores } from '../../ui/cores';

interface Props {
  situacao: 'enviada' | 'pendente';
  aoConcluir: () => void;
  aoTentarAgora?: () => void;
  tentando?: boolean;
}

/**
 * Fim do fluxo.
 *
 * Duas situações: o servidor confirmou, ou a resposta está guardada no aparelho
 * esperando conexão. Em nenhuma delas a resposta se perde.
 */
export function TelaConclusao({ situacao, aoConcluir, aoTentarAgora, tentando }: Props) {
  const enviada = situacao === 'enviada';

  return (
    <ScrollView contentContainerStyle={estilos.conteudo}>
      <View style={estilos.simbolo}>
        <Text style={estilos.simboloTexto}>{enviada ? '✓' : '⏱'}</Text>
      </View>

      <Text style={estilos.titulo}>
        {enviada ? 'Resposta registrada' : 'Resposta guardada no aparelho'}
      </Text>

      <Text style={estilos.texto}>
        {enviada
          ? 'Obrigado por participar. Sua resposta é anônima e já foi contabilizada.'
          : 'Não foi possível falar com o servidor agora. Sua resposta está salva e será enviada sozinha assim que a conexão voltar — pode fechar o app.'}
      </Text>

      <Cartao>
        <Text style={estilos.aviso}>
          Este aparelho já respondeu esta pesquisa. Uma segunda resposta não será aceita.
        </Text>
      </Cartao>

      <View style={estilos.acoes}>
        {!enviada && aoTentarAgora ? (
          <Botao
            titulo="Tentar enviar agora"
            variante="secundario"
            aoTocar={aoTentarAgora}
            carregando={tentando}
          />
        ) : null}
        <Botao titulo="Concluir" aoTocar={aoConcluir} />
      </View>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: 24, paddingTop: 96, paddingBottom: 48, alignItems: 'stretch' },
  simbolo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: cores.acao,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 24,
  },
  simboloTexto: { fontSize: 28, color: cores.acao },
  titulo: {
    fontSize: 20,
    fontWeight: '600',
    color: cores.texto,
    textAlign: 'center',
    marginBottom: 12,
  },
  texto: {
    fontSize: 15,
    color: cores.suave,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  aviso: { fontSize: 13, color: cores.suave, lineHeight: 19 },
  acoes: { gap: 10, marginTop: 12 },
});
