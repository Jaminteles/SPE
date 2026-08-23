import { ReactNode } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';

import { cores } from './cores';

interface BotaoProps {
  titulo: string;
  aoTocar: () => void;
  variante?: 'primario' | 'secundario' | 'perigo';
  desabilitado?: boolean;
  carregando?: boolean;
}

export function Botao({
  titulo,
  aoTocar,
  variante = 'primario',
  desabilitado,
  carregando,
}: BotaoProps) {
  const inativo = desabilitado || carregando;
  return (
    <TouchableOpacity
      style={[estilos.botao, estilos[variante], inativo && estilos.inativo]}
      onPress={aoTocar}
      disabled={inativo}
      accessibilityRole="button"
    >
      {carregando ? (
        <ActivityIndicator color={variante === 'primario' ? cores.fundoBotaoTexto : cores.texto} />
      ) : (
        <Text style={[estilos.botaoTexto, variante !== 'primario' && estilos.botaoTextoEscuro]}>
          {titulo}
        </Text>
      )}
    </TouchableOpacity>
  );
}

interface CampoProps extends TextInputProps {
  rotulo: string;
  dica?: string;
}

export function Campo({ rotulo, dica, ...resto }: CampoProps) {
  return (
    <View style={estilos.campoBloco}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <TextInput
        style={[estilos.campo, resto.multiline && estilos.campoAlto]}
        placeholderTextColor={cores.suave}
        {...resto}
      />
      {dica ? <Text style={estilos.dica}>{dica}</Text> : null}
    </View>
  );
}

export function Cartao({ children }: { children: ReactNode }) {
  return <View style={estilos.cartao}>{children}</View>;
}

export function Etiqueta({ texto }: { texto: string }) {
  return (
    <View style={estilos.etiqueta}>
      <Text style={estilos.etiquetaTexto}>{texto}</Text>
    </View>
  );
}

export function Mensagem({ texto, tipo = 'erro' }: { texto: string; tipo?: 'erro' | 'aviso' }) {
  return (
    <Text style={[estilos.mensagem, tipo === 'aviso' && estilos.mensagemAviso]}>{texto}</Text>
  );
}

export function Cabecalho({
  titulo,
  subtitulo,
  aoVoltar,
}: {
  titulo: string;
  subtitulo?: string;
  aoVoltar?: () => void;
}) {
  return (
    <View style={estilos.cabecalho}>
      {aoVoltar ? (
        <TouchableOpacity onPress={aoVoltar} accessibilityRole="button">
          <Text style={estilos.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
      ) : null}
      <Text style={estilos.titulo}>{titulo}</Text>
      {subtitulo ? <Text style={estilos.subtitulo}>{subtitulo}</Text> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  botao: {
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  primario: { backgroundColor: cores.acao, borderColor: cores.acao },
  secundario: { backgroundColor: 'transparent', borderColor: cores.borda },
  perigo: { backgroundColor: 'transparent', borderColor: cores.erro },
  inativo: { opacity: 0.45 },
  botaoTexto: { color: cores.fundoBotaoTexto, fontWeight: '600', fontSize: 14 },
  botaoTextoEscuro: { color: cores.texto },

  campoBloco: { marginBottom: 14 },
  rotulo: { fontSize: 13, color: cores.suave, marginBottom: 4 },
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
  campoAlto: { minHeight: 88, textAlignVertical: 'top' },
  dica: { fontSize: 12, color: cores.suave, marginTop: 4 },

  cartao: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 10,
    padding: 14,
    backgroundColor: cores.cartao,
    marginBottom: 12,
  },

  etiqueta: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  etiquetaTexto: { fontSize: 11, color: cores.suave },

  mensagem: { color: cores.erro, fontSize: 13, marginBottom: 12 },
  mensagemAviso: { color: cores.suave },

  cabecalho: { marginBottom: 18 },
  voltar: { color: cores.suave, fontSize: 14, marginBottom: 10 },
  titulo: { fontSize: 20, fontWeight: '600', color: cores.texto },
  subtitulo: { fontSize: 13, color: cores.suave, marginTop: 2 },
});
