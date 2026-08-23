import * as Location from 'expo-location';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

import { PerguntaPublica, RespostasEmAndamento } from '../../coleta/tipos';
import { perguntasVisiveis } from '../../coleta/logica-condicional';
import { Botao, Cartao, Mensagem } from '../../ui/componentes';
import { cores } from '../../ui/cores';

interface Props {
  perguntas: PerguntaPublica[];
  respostas: RespostasEmAndamento;
  nomeDoMunicipio: string;
  localizacao: { latitude: number; longitude: number } | null;
  enviando: boolean;
  erro: string | null;
  aoDefinirLocalizacao: (posicao: { latitude: number; longitude: number } | null) => void;
  aoEnviar: () => void;
  aoVoltar: () => void;
  aoIrParaPergunta: (perguntaId: string) => void;
}

/**
 * Revisão antes do envio.
 *
 * A geolocalização é pedida aqui, de forma explícita e opcional: serve apenas
 * para conferência da coleta e recusar não impede o envio.
 */
export function TelaRevisao({
  perguntas,
  respostas,
  nomeDoMunicipio,
  localizacao,
  enviando,
  erro,
  aoDefinirLocalizacao,
  aoEnviar,
  aoVoltar,
  aoIrParaPergunta,
}: Props) {
  const [pedindoLocal, setPedindoLocal] = useState(false);
  const [avisoLocal, setAvisoLocal] = useState<string | null>(null);

  const visiveis = perguntasVisiveis(perguntas, respostas);

  function descrever(pergunta: PerguntaPublica): string {
    const valor = respostas[pergunta.id];
    if (!valor) {
      return 'Não respondida';
    }
    if (valor.tipo === 'alternativa') {
      return (
        pergunta.alternativas.find((alternativa) => alternativa.id === valor.alternativaId)?.texto ??
        'Não respondida'
      );
    }
    if (valor.tipo === 'alternativas') {
      return pergunta.alternativas
        .filter((alternativa) => valor.alternativaIds.includes(alternativa.id))
        .map((alternativa) => alternativa.texto)
        .join(', ');
    }
    if (valor.tipo === 'numero') {
      return String(valor.valor);
    }
    return valor.valor;
  }

  async function alternarLocalizacao(ligado: boolean) {
    setAvisoLocal(null);

    if (!ligado) {
      aoDefinirLocalizacao(null);
      return;
    }

    setPedindoLocal(true);
    try {
      const permissao = await Location.requestForegroundPermissionsAsync();
      if (permissao.status !== Location.PermissionStatus.GRANTED) {
        setAvisoLocal('Sem permissão de localização. Você pode enviar a resposta assim mesmo.');
        aoDefinirLocalizacao(null);
        return;
      }

      const posicao = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      aoDefinirLocalizacao({
        latitude: posicao.coords.latitude,
        longitude: posicao.coords.longitude,
      });
    } catch {
      setAvisoLocal('Não foi possível obter a localização. Você pode enviar a resposta assim mesmo.');
      aoDefinirLocalizacao(null);
    } finally {
      setPedindoLocal(false);
    }
  }

  return (
    <View style={estilos.container}>
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <TouchableOpacity onPress={aoVoltar} accessibilityRole="button">
          <Text style={estilos.voltar}>‹ Voltar</Text>
        </TouchableOpacity>

        <Text style={estilos.titulo}>Confira antes de enviar</Text>

        <Cartao>
          <Text style={estilos.rotulo}>Município</Text>
          <Text style={estilos.valor}>{nomeDoMunicipio}</Text>
        </Cartao>

        {visiveis.map((pergunta, indice) => (
          <TouchableOpacity
            key={pergunta.id}
            onPress={() => aoIrParaPergunta(pergunta.id)}
            accessibilityRole="button"
          >
            <Cartao>
              <Text style={estilos.rotulo}>
                {indice + 1}. {pergunta.enunciado}
              </Text>
              <Text style={estilos.valor}>{descrever(pergunta)}</Text>
            </Cartao>
          </TouchableOpacity>
        ))}

        <Cartao>
          <View style={estilos.linhaSwitch}>
            <Text style={estilos.rotuloLocal}>Permitir usar minha localização (opcional)</Text>
            <Switch
              value={localizacao !== null}
              onValueChange={alternarLocalizacao}
              disabled={pedindoLocal || enviando}
            />
          </View>
          <Text style={estilos.ajudaLocal}>
            Serve apenas para conferência da pesquisa. Recusar não impede o envio e não muda sua
            resposta.
          </Text>
          {avisoLocal ? <Mensagem texto={avisoLocal} tipo="aviso" /> : null}
        </Cartao>

        {erro ? <Mensagem texto={erro} /> : null}
      </ScrollView>

      <View style={estilos.rodape}>
        <Botao titulo="Enviar respostas" aoTocar={aoEnviar} carregando={enviando} />
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: 24, paddingTop: 64, paddingBottom: 24 },
  voltar: { color: cores.suave, fontSize: 14, marginBottom: 16 },
  titulo: { fontSize: 20, fontWeight: '600', color: cores.texto, marginBottom: 18 },
  rotulo: { fontSize: 12, color: cores.suave, marginBottom: 6, lineHeight: 17 },
  valor: { fontSize: 15, color: cores.texto },
  linhaSwitch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rotuloLocal: { flex: 1, fontSize: 14, color: cores.texto, paddingRight: 12 },
  ajudaLocal: { fontSize: 12, color: cores.suave, marginTop: 8, lineHeight: 17 },
  rodape: { padding: 24, borderTopWidth: 1, borderTopColor: cores.borda },
});
