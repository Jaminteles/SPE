import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Botao, Cartao } from '../../ui/componentes';
import { cores } from '../../ui/cores';

interface Props {
  titulo: string;
  descricao: string | null;
  aoAceitar: () => void;
  aoRecusar: () => void;
  enviando?: boolean;
}

/**
 * Termo de consentimento. Antecede a primeira pergunta, sempre: sem aceite
 * registrado nada é gravado, nem no aparelho nem no servidor.
 *
 * O texto abaixo é a base legal mínima (finalidade, anonimato, retenção,
 * voluntariedade) e precisa de validação do responsável pela pesquisa antes
 * da coleta real.
 */
export function TelaConsentimento({ titulo, descricao, aoAceitar, aoRecusar, enviando }: Props) {
  const [aceito, setAceito] = useState(false);

  return (
    <ScrollView contentContainerStyle={estilos.conteudo}>
      <Text style={estilos.titulo}>{titulo}</Text>
      {descricao ? <Text style={estilos.descricao}>{descricao}</Text> : null}

      <Cartao>
        <Text style={estilos.secao}>Antes de começar</Text>

        <Text style={estilos.paragrafo}>
          <Text style={estilos.destaque}>Sua resposta é anônima.</Text> Não pedimos e não guardamos
          nome, CPF, telefone, e-mail nem qualquer dado que identifique você.
        </Text>

        <Text style={estilos.paragrafo}>
          <Text style={estilos.destaque}>Para que serve.</Text> As respostas são somadas com as de
          outras pessoas e usadas apenas para apurar o resultado da pesquisa por município. Nenhuma
          resposta individual é divulgada.
        </Text>

        <Text style={estilos.paragrafo}>
          <Text style={estilos.destaque}>O que é guardado.</Text> O município que você escolher, a
          data e a hora do envio, e um código aleatório do aparelho — usado só para evitar que a
          mesma pessoa responda duas vezes, e guardado de forma irreversível.
        </Text>

        <Text style={estilos.paragrafo}>
          <Text style={estilos.destaque}>Por quanto tempo.</Text> As respostas ficam guardadas por
          até 4 anos após o encerramento da pesquisa e depois são apagadas automaticamente. O código
          do aparelho é apagado assim que a coleta encerra.
        </Text>

        <Text style={estilos.paragrafo}>
          <Text style={estilos.destaque}>É voluntário.</Text> Você pode parar a qualquer momento e
          pode recusar. Responder ou não responder não muda nada para você.
        </Text>
      </Cartao>

      <TouchableOpacity
        style={estilos.aceite}
        onPress={() => setAceito((atual) => !atual)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: aceito }}
      >
        <View style={[estilos.marca, aceito && estilos.marcaAtiva]} />
        <Text style={estilos.aceiteTexto}>
          Li e concordo em participar desta pesquisa de forma anônima.
        </Text>
      </TouchableOpacity>

      <View style={estilos.acoes}>
        <Botao titulo="Começar" aoTocar={aoAceitar} desabilitado={!aceito} carregando={enviando} />
        <Botao titulo="Não quero participar" variante="secundario" aoTocar={aoRecusar} />
      </View>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: 24, paddingTop: 64, paddingBottom: 48 },
  titulo: { fontSize: 20, fontWeight: '600', color: cores.texto, marginBottom: 4 },
  descricao: { fontSize: 14, color: cores.suave, marginBottom: 18, lineHeight: 20 },
  secao: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: cores.suave,
    marginBottom: 12,
  },
  paragrafo: { fontSize: 14, color: cores.texto, lineHeight: 21, marginBottom: 12 },
  destaque: { fontWeight: '600' },
  aceite: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 6, marginBottom: 22 },
  marca: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: cores.borda,
    marginTop: 2,
  },
  marcaAtiva: { backgroundColor: cores.acao, borderColor: cores.acao },
  aceiteTexto: { flex: 1, fontSize: 14, color: cores.texto, lineHeight: 20 },
  acoes: { gap: 10 },
});
