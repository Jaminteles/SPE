import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { tokenDoLink } from '../../coleta/link-de-coleta';
import { Botao, Campo, Cartao, Mensagem } from '../../ui/componentes';
import { cores } from '../../ui/cores';

interface Props {
  aoAbrir: (token: string) => void;
  aoAbrirConta: () => void;
  carregando: boolean;
  erro: string | null;
  pendentes: number;
  aoReenviarPendentes: () => void;
}

/** O mesmo formato que a API gera: 22 caracteres base64url. */
const CODIGO_SOZINHO = /^[A-Za-z0-9_-]{22}$/;

/**
 * Extrai o código do que a pessoa colou.
 *
 * Aceita o link inteiro — que é o que ela recebeu — e também o código sozinho,
 * porque a página `r.html` mostra o código para digitar quando o aparelho não
 * abre o link direto. Exigir um formato só obrigaria a editar o texto colado.
 */
export function codigoDoTextoColado(texto: string): string | null {
  const limpo = texto.trim();
  if (!limpo) {
    return null;
  }
  return CODIGO_SOZINHO.test(limpo) ? limpo : tokenDoLink(limpo);
}

/**
 * Porta de entrada do aplicativo: responder uma pesquisa.
 *
 * A coleta é o que a maioria de quem abre este app vem fazer, e não exige conta
 * nenhuma — por isso ela é a primeira tela, e não a de login. Quem cria
 * pesquisa é minoria e sabe que precisa entrar.
 */
export function TelaAbertura({
  aoAbrir,
  aoAbrirConta,
  carregando,
  erro,
  pendentes,
  aoReenviarPendentes,
}: Props) {
  const [colado, setColado] = useState('');

  const codigo = codigoDoTextoColado(colado);
  const preenchido = colado.trim().length > 0;

  return (
    <ScrollView contentContainerStyle={estilos.conteudo}>
      <Text style={estilos.titulo}>Responder uma pesquisa</Text>
      <Text style={estilos.ajuda}>
        Cole abaixo o link que você recebeu. Não é preciso ter conta: a resposta é anônima.
      </Text>

      <Campo
        rotulo="Link da pesquisa"
        value={colado}
        onChangeText={setColado}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        keyboardType="url"
        multiline
        placeholder="https://…/r.html?t=…"
      />

      {/* Só reclama depois de a pessoa digitar algo: campo vazio não é erro. */}
      {preenchido && !codigo ? (
        <Mensagem texto="Não encontrei o código neste texto. Cole o link inteiro, do começo ao fim." />
      ) : null}

      {erro ? <Mensagem texto={erro} /> : null}

      <Botao
        titulo="Abrir pesquisa"
        aoTocar={() => codigo && aoAbrir(codigo)}
        desabilitado={!codigo}
        carregando={carregando}
      />

      {pendentes > 0 ? (
        <Cartao>
          <Text style={estilos.pendentesTitulo}>
            {pendentes === 1
              ? '1 resposta aguardando envio'
              : `${pendentes} respostas aguardando envio`}
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
        <TouchableOpacity onPress={aoAbrirConta} accessibilityRole="button">
          <Text style={estilos.conta}>Criar/Gerenciar pesquisas</Text>
        </TouchableOpacity>
        <Text style={estilos.contaAjuda}>
          Para quem monta a pesquisa e acompanha os resultados.
        </Text>
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
  rodape: {
    marginTop: 32,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
    paddingTop: 18,
    alignItems: 'center',
  },
  conta: { fontSize: 15, color: cores.texto, fontWeight: '600' },
  contaAjuda: { fontSize: 12, color: cores.suave, marginTop: 4, textAlign: 'center' },
});
