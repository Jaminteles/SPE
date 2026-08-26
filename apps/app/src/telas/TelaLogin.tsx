import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
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
  aoVoltar: () => void;
  /** Só oferece registro onde a instalação aceita: botão que sempre falha é pior que ausente. */
  cadastroAberto: boolean;
}

type Aba = 'entrar' | 'registrar';

const TAMANHO_MINIMO_SENHA = 12;

/** As mesmas regras que a API aplica; conferir aqui evita uma ida à rede para nada. */
function problemasDaSenha(senha: string): string[] {
  const problemas: string[] = [];
  if (senha.length < TAMANHO_MINIMO_SENHA) {
    problemas.push(`ao menos ${TAMANHO_MINIMO_SENHA} caracteres`);
  }
  if (!/[a-zà-ÿ]/.test(senha)) {
    problemas.push('uma letra minúscula');
  }
  if (!/[A-ZÀ-Ý]/.test(senha)) {
    problemas.push('uma letra maiúscula');
  }
  if (!/\d/.test(senha)) {
    problemas.push('um número');
  }
  return problemas;
}

function mensagemDeFalha(falha: unknown, generica: string): string {
  if (falha instanceof ErroDeRede) {
    return falha.message;
  }
  if (falha instanceof ErroApi) {
    if (falha.status === 429) {
      return 'Muitas tentativas. Espere um pouco e tente de novo.';
    }
    // 400 e 403 aqui trazem texto útil da API (senha fraca, cadastro fechado,
    // e-mail não confirmado) e podem ser mostrados como vieram.
    if (falha.status === 400 || falha.status === 403) {
      return falha.message;
    }
  }
  return generica;
}

/**
 * Área de conta: entrar ou criar uma.
 *
 * Deixou de ser a primeira tela do aplicativo. Quem abre o app vem responder
 * pesquisa, o que não exige conta nenhuma — aqui chega só quem monta.
 */
export function TelaLogin({ aoEntrar, aoVoltar, cadastroAberto }: Props) {
  const [aba, setAba] = useState<Aba>('entrar');

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const emailValido = email.includes('@');
  const faltasDaSenha = problemasDaSenha(senha);

  const podeEntrar = emailValido && senha.length >= TAMANHO_MINIMO_SENHA && !enviando;
  const podeRegistrar =
    nome.trim().length >= 3 && emailValido && faltasDaSenha.length === 0 && !enviando;

  function trocarAba(nova: Aba) {
    setAba(nova);
    setErro(null);
    setAviso(null);
  }

  async function executar(acao: () => Promise<void>, generica: string) {
    setEnviando(true);
    setErro(null);
    setAviso(null);
    try {
      await acao();
    } catch (falha) {
      setErro(mensagemDeFalha(falha, generica));
    } finally {
      setEnviando(false);
    }
  }

  const entrar = () =>
    podeEntrar &&
    // Mensagem única no genérico: o app não diz se o problema foi e-mail ou senha.
    executar(async () => aoEntrar(await servicoAuth.entrar(email, senha)), 'E-mail ou senha inválidos.');

  const registrar = () =>
    podeRegistrar &&
    executar(async () => {
      setAviso(await servicoAuth.registrar({ nome, email, senha }));
    }, 'Não foi possível concluir o cadastro.');

  const reenviar = () =>
    emailValido &&
    executar(async () => {
      setAviso(await servicoAuth.reenviarConfirmacao(email));
    }, 'Não foi possível reenviar a confirmação.');

  const registrando = aba === 'registrar';

  return (
    <KeyboardAvoidingView
      style={estilos.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={estilos.rolagem} keyboardShouldPersistTaps="handled">
        <View style={estilos.cartao}>
          <Text style={estilos.titulo}>Pesquisa Eleitoral</Text>
          <Text style={estilos.subtitulo}>
            {registrando ? 'Criar uma conta' : 'Entrar para criar e gerenciar pesquisas'}
          </Text>

          {cadastroAberto ? (
            <View style={estilos.abas}>
              <Aba rotulo="Entrar" ativa={!registrando} aoTocar={() => trocarAba('entrar')} />
              <Aba
                rotulo="Registrar-se"
                ativa={registrando}
                aoTocar={() => trocarAba('registrar')}
              />
            </View>
          ) : null}

          {registrando ? (
            <>
              <Text style={estilos.rotulo}>Nome</Text>
              <TextInput
                style={estilos.campo}
                value={nome}
                onChangeText={setNome}
                editable={!enviando}
                placeholder="Nome e sobrenome"
                placeholderTextColor={cores.suave}
              />
            </>
          ) : null}

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
            textContentType={registrando ? 'newPassword' : 'password'}
            editable={!enviando}
            onSubmitEditing={registrando ? registrar : entrar}
            returnKeyType="go"
          />

          {/* Só cobra a senha no cadastro: no login a regra é do que já existe. */}
          {registrando && senha.length > 0 && faltasDaSenha.length > 0 ? (
            <Text style={estilos.dica}>A senha precisa de {faltasDaSenha.join(', ')}.</Text>
          ) : null}

          {erro ? <Text style={estilos.erro}>{erro}</Text> : null}
          {aviso ? <Text style={estilos.aviso}>{aviso}</Text> : null}

          <TouchableOpacity
            style={[
              estilos.botao,
              !(registrando ? podeRegistrar : podeEntrar) && estilos.botaoDesabilitado,
            ]}
            onPress={registrando ? registrar : entrar}
            disabled={!(registrando ? podeRegistrar : podeEntrar)}
            accessibilityRole="button"
          >
            {enviando ? (
              <ActivityIndicator color={cores.fundoBotaoTexto} />
            ) : (
              <Text style={estilos.botaoTexto}>{registrando ? 'Criar conta' : 'Entrar'}</Text>
            )}
          </TouchableOpacity>

          {cadastroAberto ? (
            <TouchableOpacity
              onPress={reenviar}
              disabled={!emailValido || enviando}
              accessibilityRole="button"
              style={estilos.secundaria}
            >
              <Text style={[estilos.secundariaTexto, !emailValido && estilos.textoApagado]}>
                Reenviar confirmação de e-mail
              </Text>
            </TouchableOpacity>
          ) : null}

          <Text style={estilos.rodape}>
            Quem responde a pesquisa não precisa de conta.
          </Text>

          <TouchableOpacity style={estilos.voltar} onPress={aoVoltar} accessibilityRole="button">
            <Text style={estilos.voltarTexto}>Voltar para responder uma pesquisa</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Aba({
  rotulo,
  ativa,
  aoTocar,
}: {
  rotulo: string;
  ativa: boolean;
  aoTocar: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={aoTocar}
      accessibilityRole="button"
      accessibilityState={{ selected: ativa }}
      style={[estilos.aba, ativa && estilos.abaAtiva]}
    >
      <Text style={[estilos.abaTexto, ativa && estilos.abaTextoAtivo]}>{rotulo}</Text>
    </TouchableOpacity>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  rolagem: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  cartao: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 10,
    padding: 20,
    backgroundColor: cores.cartao,
  },
  titulo: { fontSize: 20, fontWeight: '600', color: cores.texto },
  subtitulo: { fontSize: 14, color: cores.suave, marginBottom: 16 },

  abas: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  aba: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  abaAtiva: { backgroundColor: cores.acao, borderColor: cores.acao },
  abaTexto: { fontSize: 13, color: cores.texto },
  abaTextoAtivo: { color: cores.fundoBotaoTexto, fontWeight: '600' },

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
  dica: { fontSize: 12, color: cores.suave, marginTop: 6, lineHeight: 17 },
  erro: { color: cores.erro, marginTop: 14, fontSize: 13, lineHeight: 18 },
  aviso: { color: cores.texto, marginTop: 14, fontSize: 13, lineHeight: 18 },
  botao: {
    backgroundColor: cores.acao,
    borderRadius: 6,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 20,
  },
  botaoDesabilitado: { opacity: 0.5 },
  botaoTexto: { color: cores.fundoBotaoTexto, fontWeight: '600', fontSize: 15 },

  secundaria: { marginTop: 14, alignItems: 'center' },
  secundariaTexto: { fontSize: 13, color: cores.texto },
  textoApagado: { opacity: 0.45 },

  rodape: { fontSize: 12, color: cores.suave, marginTop: 18, lineHeight: 17 },
  voltar: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
    paddingTop: 16,
    alignItems: 'center',
  },
  voltarTexto: { fontSize: 14, color: cores.texto, fontWeight: '600' },
});
