import { Component, ErrorInfo, ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Botao } from './componentes';
import { cores } from './cores';

interface Props {
  children: ReactNode;
  /** Para onde escapar: uma tela que sabidamente funciona. */
  aoVoltar: () => void;
}

interface Estado {
  falha: Error | null;
  origem: string | null;
}

/**
 * Rede de seguranca da navegacao.
 *
 * Sem isto, uma excecao no render desmonta a arvore inteira e deixa a tela
 * branca — levando junto o cabecalho, que e onde mora o botao de voltar. O
 * entrevistador fica sem saida e sem nada para relatar, e quem da suporte
 * recebe "ficou branco".
 *
 * Aqui o erro vira texto legivel na propria tela. Em APK de release nao ha
 * console para abrir nem cabo USB no campo: esta e a unica via pela qual a
 * mensagem chega ate a coordenacao.
 */
export class LimiteDeErro extends Component<Props, Estado> {
  state: Estado = { falha: null, origem: null };

  static getDerivedStateFromError(falha: Error): Partial<Estado> {
    return { falha };
  }

  componentDidCatch(_falha: Error, info: ErrorInfo) {
    this.setState({ origem: info.componentStack ?? null });
  }

  private voltar = () => {
    this.setState({ falha: null, origem: null });
    this.props.aoVoltar();
  };

  render() {
    const { falha, origem } = this.state;

    if (!falha) {
      return this.props.children;
    }

    return (
      <View style={estilos.raiz}>
        <ScrollView contentContainerStyle={estilos.conteudo}>
          <Text style={estilos.titulo}>Esta tela falhou</Text>
          <Text style={estilos.texto}>
            O restante do aplicativo continua funcionando. Nenhuma resposta ja gravada no aparelho
            foi perdida.
          </Text>

          <View style={estilos.caixa}>
            <Text style={estilos.rotulo}>Mensagem</Text>
            <Text style={estilos.mensagem} selectable>
              {falha.message || String(falha)}
            </Text>
          </View>

          {origem ? (
            <View style={estilos.caixa}>
              <Text style={estilos.rotulo}>Onde</Text>
              {/* Selecionavel de proposito: o entrevistador copia e manda. */}
              <Text style={estilos.pilha} selectable>
                {origem.trim().split('\n').slice(0, 6).join('\n')}
              </Text>
            </View>
          ) : null}

          <Text style={estilos.texto}>
            Envie este texto para a coordenacao — e o que permite achar a causa.
          </Text>

          <Botao titulo="Voltar ao inicio" aoTocar={this.voltar} />
        </ScrollView>
      </View>
    );
  }
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: 24, paddingBottom: 48, gap: 16 },
  titulo: { fontSize: 20, fontWeight: '600', color: cores.texto },
  texto: { fontSize: 14, color: cores.suave, lineHeight: 20 },
  caixa: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 10,
    backgroundColor: cores.cartao,
    padding: 16,
    gap: 6,
  },
  rotulo: { fontSize: 12, color: cores.suave },
  mensagem: { fontSize: 14, color: cores.erro, lineHeight: 20 },
  pilha: { fontSize: 12, color: cores.texto, lineHeight: 18 },
});
