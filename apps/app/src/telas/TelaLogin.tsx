import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { ErroApi, ErroDeRede } from '../api/cliente';
import { UsuarioLogado, servicoAuth } from '../auth/servico-auth';
import { cores } from '../ui/cores';

interface Props {
  aoEntrar: (usuario: UsuarioLogado) => void;
}

const TAMANHO_MINIMO_SENHA = 12;

export function TelaLogin({ aoEntrar }: Props) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const podeEnviar = email.includes('@') && senha.length >= TAMANHO_MINIMO_SENHA && !enviando;

  async function entrar() {
    if (!podeEnviar) {
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      aoEntrar(await servicoAuth.entrar(email, senha));
    } catch (falha) {
      if (falha instanceof ErroDeRede) {
        setErro(falha.message);
      } else if (falha instanceof ErroApi && falha.status === 429) {
        setErro('Muitas tentativas. Espere um minuto e tente de novo.');
      } else {
        // Mensagem única: o app não diz se o problema foi o e-mail ou a senha.
        setErro('E-mail ou senha inválidos.');
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={estilos.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={estilos.cartao}>
        <Text style={estilos.titulo}>Pesquisa Eleitoral</Text>
        <Text style={estilos.subtitulo}>Acesso da equipe</Text>

        <Text style={estilos.rotulo}>E-mail</Text>
        <TextInput
          style={estilos.campo}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          editable={!enviando}
          placeholder="voce@exemplo.br"
          placeholderTextColor={cores.suave}
        />

        <Text style={estilos.rotulo}>Senha</Text>
        <TextInput
          style={estilos.campo}
          value={senha}
          onChangeText={setSenha}
          secureTextEntry
          autoCapitalize="none"
          textContentType="password"
          editable={!enviando}
          onSubmitEditing={entrar}
          returnKeyType="go"
        />

        {erro ? <Text style={estilos.erro}>{erro}</Text> : null}

        <TouchableOpacity
          style={[estilos.botao, !podeEnviar && estilos.botaoDesabilitado]}
          onPress={entrar}
          disabled={!podeEnviar}
          accessibilityRole="button"
        >
          {enviando ? (
            <ActivityIndicator color={cores.fundoBotaoTexto} />
          ) : (
            <Text style={estilos.botaoTexto}>Entrar</Text>
          )}
        </TouchableOpacity>

        <Text style={estilos.aviso}>
          O respondente não precisa de conta. Esta tela é apenas para Administrador e Analista.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: cores.fundo,
  },
  cartao: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 10,
    padding: 20,
    backgroundColor: cores.cartao,
  },
  titulo: { fontSize: 20, fontWeight: '600', color: cores.texto },
  subtitulo: { fontSize: 14, color: cores.suave, marginBottom: 20 },
  rotulo: { fontSize: 13, color: cores.suave, marginBottom: 4, marginTop: 12 },
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
  erro: { color: cores.erro, marginTop: 14, fontSize: 13 },
  botao: {
    backgroundColor: cores.acao,
    borderRadius: 6,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 20,
  },
  botaoDesabilitado: { opacity: 0.5 },
  botaoTexto: { color: cores.fundoBotaoTexto, fontWeight: '600', fontSize: 15 },
  aviso: { fontSize: 12, color: cores.suave, marginTop: 18, lineHeight: 17 },
});
