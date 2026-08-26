import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';

import { Diagnostico, servicoAtualizacao } from './src/atualizacao/servico-atualizacao';
import { tokenDoLink } from './src/coleta/link-de-coleta';
import { UsuarioLogado, servicoAuth } from './src/auth/servico-auth';
import { TelaAtualizacao } from './src/telas/TelaAtualizacao';
import { TelaFormulario } from './src/telas/admin/TelaFormulario';
import { TelaFormularios } from './src/telas/admin/TelaFormularios';
import { TelaPergunta } from './src/telas/admin/TelaPergunta';
import { TelaPreVisualizacao } from './src/telas/admin/TelaPreVisualizacao';
import { FluxoDeColeta } from './src/telas/coleta/FluxoDeColeta';
import { TelaInicio } from './src/telas/TelaInicio';
import { TelaLogin } from './src/telas/TelaLogin';
import { TelaResultado } from './src/telas/resultados/TelaResultado';
import { TelaResultados } from './src/telas/resultados/TelaResultados';
import { cores } from './src/ui/cores';
import { LimiteDeErro } from './src/ui/LimiteDeErro';

/**
 * Navegação da área autenticada.
 * Uma pilha de telas simples resolve o fluxo atual sem trazer biblioteca nova.
 */
type Rota =
  | { tela: 'inicio' }
  | { tela: 'formularios' }
  | { tela: 'formulario'; formularioId: string }
  | { tela: 'pergunta'; formularioId: string; perguntaId: string; editavel: boolean }
  | { tela: 'previa'; formularioId: string }
  | { tela: 'resultados' }
  | { tela: 'resultado'; formularioId: string; titulo: string };

export default function App() {
  const [usuario, setUsuario] = useState<UsuarioLogado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [rota, setRota] = useState<Rota>({ tela: 'inicio' });
  /** A coleta não exige conta: vive fora da área autenticada. */
  const [respondendo, setRespondendo] = useState(false);
  /** Token vindo do link de coleta: pula a digitação do código na abertura. */
  const [tokenDoLinkAberto, setTokenDoLinkAberto] = useState<string | null>(null);
  /** Verificação de versão na abertura — o substituto da atualização da loja. */
  const [versao, setVersao] = useState<Diagnostico | null>(null);
  const [avisoDispensado, setAvisoDispensado] = useState(false);

  useEffect(() => {
    let ativo = true;

    // Não bloqueia a abertura: se o servidor não responder, o app segue.
    servicoAtualizacao
      .verificar()
      .then((diagnostico) => {
        if (ativo) {
          setVersao(diagnostico);
        }
      })
      .catch(() => undefined);

    // Atualização de conteúdo (OTA) baixa em segundo plano e vale na próxima
    // abertura: reiniciar o app no meio de uma coleta perderia resposta.
    void servicoAtualizacao.buscarAtualizacaoDeConteudo();

    return () => {
      ativo = false;
    };
  }, []);

  /**
   * Link de coleta. Vale tanto o app fechado (`getInitialURL`) quanto o app já
   * aberto em segundo plano (o evento): o entrevistador costuma tocar no link
   * com o aplicativo ainda na memória, e só o `getInitialURL` deixaria esse
   * caso sem resposta nenhuma.
   */
  useEffect(() => {
    let ativo = true;

    const aceitar = (url: string | null) => {
      const token = tokenDoLink(url);
      if (ativo && token) {
        setTokenDoLinkAberto(token);
        setRespondendo(true);
      }
    };

    void Linking.getInitialURL().then(aceitar);
    const assinatura = Linking.addEventListener('url', ({ url }) => aceitar(url));

    return () => {
      ativo = false;
      assinatura.remove();
    };
  }, []);

  useEffect(() => {
    let ativo = true;

    servicoAuth
      .retomarSessao()
      .then((retomado) => {
        if (ativo) {
          setUsuario(retomado);
        }
      })
      .finally(() => {
        if (ativo) {
          setCarregando(false);
        }
      });

    return () => {
      ativo = false;
    };
  }, []);

  const entrar = useCallback((autenticado: UsuarioLogado) => {
    setRota({ tela: 'inicio' });
    setUsuario(autenticado);
  }, []);

  const sair = useCallback(async () => {
    await servicoAuth.sair();
    setRota({ tela: 'inicio' });
    setUsuario(null);
  }, []);

  /** Sessão morreu no servidor: volta para o login sem tentar mais nada. */
  const perderSessao = useCallback(() => {
    setRota({ tela: 'inicio' });
    setUsuario(null);
  }, []);

  /** Sair da coleta descarta o token do link: reabrir volta a pedir o código. */
  const sairDaColeta = useCallback(() => {
    setTokenDoLinkAberto(null);
    setRespondendo(false);
  }, []);

  const voltarParaInicio = useCallback(() => setRota({ tela: 'inicio' }), []);
  const voltarParaFormularios = useCallback(() => setRota({ tela: 'formularios' }), []);

  if (carregando) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator color={cores.acao} />
        <StatusBar style="auto" />
      </View>
    );
  }

  // Versão abaixo do mínimo trava aqui, antes de qualquer tela — inclusive a de
  // coleta, que é a que grava dado.
  if (versao && (versao.estado === 'bloqueado' || (versao.estado === 'aviso' && !avisoDispensado))) {
    return (
      <View style={estilos.raiz}>
        <TelaAtualizacao
          diagnostico={versao}
          aoContinuar={
            versao.estado === 'aviso' ? () => setAvisoDispensado(true) : undefined
          }
        />
        <StatusBar style="auto" />
      </View>
    );
  }

  if (respondendo) {
    return (
      <View style={estilos.raiz}>
        <LimiteDeErro aoVoltar={sairDaColeta}>
          <FluxoDeColeta tokenInicial={tokenDoLinkAberto} aoSair={sairDaColeta} />
        </LimiteDeErro>
        <StatusBar style="auto" />
      </View>
    );
  }

  if (!usuario) {
    return (
      <View style={estilos.raiz}>
        <TelaLogin aoEntrar={entrar} aoResponderPesquisa={() => setRespondendo(true)} />
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <View style={estilos.raiz}>
      {/* Falha de render em qualquer rota vira mensagem legivel, nao tela branca. */}
      <LimiteDeErro aoVoltar={voltarParaInicio}>
        {rota.tela === 'inicio' ? (
          <TelaInicio
            usuario={usuario}
            aoSair={sair}
            aoAbrirFormularios={() => setRota({ tela: 'formularios' })}
            aoAbrirResultados={() => setRota({ tela: 'resultados' })}
          />
        ) : null}

        {rota.tela === 'formularios' ? (
          <TelaFormularios
            aoAbrir={(formularioId) => setRota({ tela: 'formulario', formularioId })}
            aoVoltar={voltarParaInicio}
            aoPerderSessao={perderSessao}
          />
        ) : null}

        {rota.tela === 'formulario' ? (
          <TelaFormulario
            formularioId={rota.formularioId}
            aoAbrirPergunta={(perguntaId, editavel) =>
              setRota({ tela: 'pergunta', formularioId: rota.formularioId, perguntaId, editavel })
            }
            aoPreVisualizar={() => setRota({ tela: 'previa', formularioId: rota.formularioId })}
            aoAbrirFormulario={(formularioId) => setRota({ tela: 'formulario', formularioId })}
            aoVoltar={voltarParaFormularios}
            aoPerderSessao={perderSessao}
          />
        ) : null}

        {rota.tela === 'pergunta' ? (
          <TelaPergunta
            formularioId={rota.formularioId}
            perguntaId={rota.perguntaId}
            editavel={rota.editavel}
            aoVoltar={() => setRota({ tela: 'formulario', formularioId: rota.formularioId })}
            aoPerderSessao={perderSessao}
          />
        ) : null}

        {rota.tela === 'previa' ? (
          <TelaPreVisualizacao
            formularioId={rota.formularioId}
            aoVoltar={() => setRota({ tela: 'formulario', formularioId: rota.formularioId })}
            aoPerderSessao={perderSessao}
          />
        ) : null}

        {rota.tela === 'resultados' ? (
          <TelaResultados
            aoAbrir={(formularioId, tituloDaPesquisa) =>
              setRota({ tela: 'resultado', formularioId, titulo: tituloDaPesquisa })
            }
            aoVoltar={voltarParaInicio}
            aoPerderSessao={perderSessao}
          />
        ) : null}

        {rota.tela === 'resultado' ? (
          <TelaResultado
            formularioId={rota.formularioId}
            titulo={rota.titulo}
            aoVoltar={() => setRota({ tela: 'resultados' })}
            aoPerderSessao={perderSessao}
          />
        ) : null}
      </LimiteDeErro>

      <StatusBar style="auto" />
    </View>
  );
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.fundo },
  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: cores.fundo,
  },
});
