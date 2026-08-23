import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { UsuarioLogado, servicoAuth } from './src/auth/servico-auth';
import { TelaFormulario } from './src/telas/admin/TelaFormulario';
import { TelaFormularios } from './src/telas/admin/TelaFormularios';
import { TelaPergunta } from './src/telas/admin/TelaPergunta';
import { TelaPreVisualizacao } from './src/telas/admin/TelaPreVisualizacao';
import { TelaInicio } from './src/telas/TelaInicio';
import { TelaLogin } from './src/telas/TelaLogin';
import { cores } from './src/ui/cores';

/**
 * Navegação da área autenticada.
 * Uma pilha de telas simples resolve o fluxo atual sem trazer biblioteca nova.
 */
type Rota =
  | { tela: 'inicio' }
  | { tela: 'formularios' }
  | { tela: 'formulario'; formularioId: string }
  | { tela: 'pergunta'; formularioId: string; perguntaId: string; editavel: boolean }
  | { tela: 'previa'; formularioId: string };

export default function App() {
  const [usuario, setUsuario] = useState<UsuarioLogado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [rota, setRota] = useState<Rota>({ tela: 'inicio' });

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

  if (!usuario) {
    return (
      <View style={estilos.raiz}>
        <TelaLogin aoEntrar={entrar} />
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <View style={estilos.raiz}>
      {rota.tela === 'inicio' ? (
        <TelaInicio
          usuario={usuario}
          aoSair={sair}
          aoAbrirFormularios={() => setRota({ tela: 'formularios' })}
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
