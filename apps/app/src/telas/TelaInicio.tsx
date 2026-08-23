import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { UsuarioLogado } from '../auth/servico-auth';
import { cores } from '../ui/cores';

interface Props {
  usuario: UsuarioLogado;
  aoSair: () => void;
}

const NOME_DO_PERFIL: Record<UsuarioLogado['perfil'], string> = {
  ADMINISTRADOR: 'Administrador',
  ANALISTA: 'Analista',
};

/**
 * Tela inicial da área autenticada (Sprint 1).
 * O menu de formulários e o de coleta entram nas sprints seguintes.
 */
export function TelaInicio({ usuario, aoSair }: Props) {
  return (
    <View style={estilos.container}>
      <View>
        <Text style={estilos.saudacao}>Olá, {usuario.nome}</Text>
        <Text style={estilos.perfil}>{NOME_DO_PERFIL[usuario.perfil]}</Text>
      </View>

      <View style={estilos.cartao}>
        <Text style={estilos.cartaoTitulo}>Sessão ativa</Text>
        <Text style={estilos.cartaoTexto}>
          A sessão é encerrada automaticamente após um período sem uso. Ao voltar, será preciso
          entrar de novo.
        </Text>
      </View>

      <TouchableOpacity style={estilos.botao} onPress={aoSair} accessibilityRole="button">
        <Text style={estilos.botaoTexto}>Sair</Text>
      </TouchableOpacity>
    </View>
  );
}

const estilos = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 72,
    gap: 24,
    backgroundColor: cores.fundo,
  },
  saudacao: { fontSize: 20, fontWeight: '600', color: cores.texto },
  perfil: { fontSize: 14, color: cores.suave, marginTop: 2 },
  cartao: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 10,
    padding: 16,
    backgroundColor: cores.cartao,
  },
  cartaoTitulo: { fontSize: 13, color: cores.suave, marginBottom: 6 },
  cartaoTexto: { fontSize: 14, color: cores.texto, lineHeight: 20 },
  botao: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
  botaoTexto: { color: cores.texto, fontWeight: '600' },
});
