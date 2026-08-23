import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { UsuarioLogado, servicoAuth } from './src/auth/servico-auth';
import { TelaInicio } from './src/telas/TelaInicio';
import { TelaLogin } from './src/telas/TelaLogin';
import { cores } from './src/ui/cores';

export default function App() {
  const [usuario, setUsuario] = useState<UsuarioLogado | null>(null);
  const [carregando, setCarregando] = useState(true);

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

  const sair = useCallback(async () => {
    await servicoAuth.sair();
    setUsuario(null);
  }, []);

  if (carregando) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator color={cores.acao} />
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <View style={estilos.raiz}>
      {usuario ? (
        <TelaInicio usuario={usuario} aoSair={sair} />
      ) : (
        <TelaLogin aoEntrar={setUsuario} />
      )}
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
