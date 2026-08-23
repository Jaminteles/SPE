import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

import { ambiente } from './src/config/ambiente';

/**
 * Casca do aplicativo (Sprint 0).
 * As telas de consentimento, coleta e administração entram nas sprints seguintes.
 */
export default function App() {
  return (
    <View style={estilos.container}>
      <Text style={estilos.titulo}>Pesquisa Eleitoral</Text>
      <Text style={estilos.subtitulo}>Bahia</Text>
      <Text style={estilos.rodape}>API: {ambiente.apiUrl}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const estilos = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#ffffff',
  },
  titulo: {
    fontSize: 22,
    fontWeight: '600',
    color: '#16202a',
  },
  subtitulo: {
    fontSize: 15,
    color: '#5b6b7b',
    marginTop: 4,
  },
  rodape: {
    fontSize: 12,
    color: '#8a99a8',
    marginTop: 24,
  },
});
