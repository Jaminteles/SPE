import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Botao, Campo, Cartao, Mensagem } from '../../ui/componentes';
import { cores } from '../../ui/cores';

interface Props {
  aoAbrir: (token: string) => void;
  aoVoltar: () => void;
  carregando: boolean;
  erro: string | null;
  pendentes: number;
  aoReenviarPendentes: () => void;
}

const TAMANHO_DO_TOKEN = 22;

/**
 * Entrada da coleta: o respondente informa o código do link recebido.
 * Não há conta, não há cadastro — o respondente nunca se identifica.
 */
export function TelaAbertura({
  aoAbrir,
  aoVoltar,
  carregando,
  erro,
  pendentes,
  aoReenviarPendentes,
}: Props) {
  const [codigo, setCodigo] = useState('');

  const limpo = codigo.trim();
  const valido = limpo.length === TAMANHO_DO_TOKEN;

  return (
    <ScrollView contentContainerStyle={estilos.conteudo}>
      <Text style={estilos.titulo}>Responder uma pesquisa</Text>
      <Text style={estilos.ajuda}>
        Informe o código que aparece no fim do link recebido, ou abra o link direto no aparelho.
      </Text>

      <Campo
        rotulo="Código da pesquisa"
        value={codigo}
        onChangeText={setCodigo}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={TAMANHO_DO_TOKEN}
        placeholder="22 caracteres"
      />

      {erro ? <Mensagem texto={erro} /> : null}

      <Botao
        titulo="Abrir pesquisa"
        aoTocar={() => aoAbrir(limpo)}
        desabilitado={!valido}
        carregando={carregando}
      />

      {pendentes > 0 ? (
        <Cartao>
          <Text style={estilos.pendentesTitulo}>
            {pendentes === 1 ? '1 resposta aguardando envio' : `${pendentes} respostas aguardando envio`}
          </Text>
          <Text style={estilos.pendentesTexto}>
            Elas são enviadas sozinhas quando houver conexão. Se preferir, tente agora.
          </Text>
          <View style={estilos.acaoPendentes}>
            <Botao titulo="Enviar agora" variante="secundario" aoTocar={aoReenviarPendentes} />
          </View>
        </Cartao>
      ) : null}

      <View style={estilos.rodape}>
        <Botao titulo="Voltar" variante="secundario" aoTocar={aoVoltar} />
      </View>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: 24, paddingTop: 72, paddingBottom: 48 },
  titulo: { fontSize: 20, fontWeight: '600', color: cores.texto, marginBottom: 6 },
  ajuda: { fontSize: 14, color: cores.suave, lineHeight: 20, marginBottom: 22 },
  pendentesTitulo: { fontSize: 14, fontWeight: '600', color: cores.texto, marginBottom: 6 },
  pendentesTexto: { fontSize: 13, color: cores.suave, lineHeight: 19 },
  acaoPendentes: { marginTop: 12 },
  rodape: { marginTop: 28 },
});
