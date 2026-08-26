import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { UsuarioLogado } from '../auth/servico-auth';
import { Botao, Cartao } from '../ui/componentes';
import { cores } from '../ui/cores';

interface Props {
  usuario: UsuarioLogado;
  aoSair: () => void;
  aoAbrirFormularios: () => void;
  aoAbrirResultados: () => void;
}

const NOME_DO_PERFIL: Record<UsuarioLogado['perfil'], string> = {
  ADMINISTRADOR: 'Administrador',
  ANALISTA: 'Analista',
  PESQUISADOR: 'Pesquisador',
};

/**
 * Tela inicial da área autenticada.
 * O menu mostra só o que o perfil usa — mas quem recusa de fato é o guard da API.
 */
export function TelaInicio({
  usuario,
  aoSair,
  aoAbrirFormularios,
  aoAbrirResultados,
}: Props) {
  /**
   * Quem monta pesquisa. O Pesquisador monta as próprias — o que ele não tem é
   * alcance sobre a pesquisa dos outros, e disso quem cuida é o guard da API,
   * não este menu.
   */
  const podeMontarPesquisa =
    usuario.perfil === 'ADMINISTRADOR' || usuario.perfil === 'PESQUISADOR';

  return (
    <ScrollView contentContainerStyle={estilos.conteudo}>
      <View>
        <Text style={estilos.saudacao}>Olá, {usuario.nome}</Text>
        <Text style={estilos.perfil}>{NOME_DO_PERFIL[usuario.perfil]}</Text>
      </View>

      {podeMontarPesquisa ? (
        <Cartao>
          <Text style={estilos.cartaoTitulo}>Pesquisas</Text>
          <Text style={estilos.cartaoTexto}>
            Monte o formulário, defina as perguntas e publique quando estiver pronto.
          </Text>
          <View style={estilos.acao}>
            <Botao titulo="Abrir pesquisas" aoTocar={aoAbrirFormularios} />
          </View>
        </Cartao>
      ) : null}

      <Cartao>
        <Text style={estilos.cartaoTitulo}>Resultados</Text>
        <Text style={estilos.cartaoTexto}>
          {podeMontarPesquisa
            ? 'Indicadores, distribuição por pergunta e evolução da coleta.'
            : 'Indicadores, distribuição por pergunta e evolução da coleta. Montar formulário é de quem cria a pesquisa.'}
        </Text>
        <View style={estilos.acao}>
          <Botao titulo="Ver resultados" aoTocar={aoAbrirResultados} />
        </View>
      </Cartao>

      <Cartao>
        <Text style={estilos.cartaoTitulo}>Sessão ativa</Text>
        <Text style={estilos.cartaoTexto}>
          A sessão é encerrada automaticamente após um período sem uso. Ao voltar, será preciso
          entrar de novo.
        </Text>
      </Cartao>

      <Botao titulo="Sair" variante="secundario" aoTocar={aoSair} />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  conteudo: {
    padding: 24,
    paddingTop: 72,
    paddingBottom: 48,
    gap: 20,
    backgroundColor: cores.fundo,
  },
  saudacao: { fontSize: 20, fontWeight: '600', color: cores.texto },
  perfil: { fontSize: 14, color: cores.suave, marginTop: 2 },
  cartaoTitulo: { fontSize: 13, color: cores.suave, marginBottom: 6 },
  cartaoTexto: { fontSize: 14, color: cores.texto, lineHeight: 20 },
  acao: { marginTop: 14 },
});
