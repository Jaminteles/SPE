import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Diagnostico } from '../atualizacao/servico-atualizacao';
import { Botao, Cartao, Mensagem } from '../ui/componentes';
import { cores } from '../ui/cores';

interface Props {
  diagnostico: Diagnostico;
  /** Ausente quando a versão instalada está abaixo do mínimo: aí não há saída. */
  aoContinuar?: () => void;
}

/**
 * Aviso de atualização.
 *
 * Sem loja, esta tela é o canal de atualização do aplicativo. Abaixo da versão
 * mínima ela bloqueia: um APK velho pode gravar resposta fora do contrato atual
 * da API, e resposta perdida não se recupera.
 *
 * O hash aparece na tela porque a instalação vem de fora da loja — conferir o
 * arquivo é o que separa "APK do projeto" de "APK que alguém trocou no meio do
 * caminho".
 */
export function TelaAtualizacao({ diagnostico, aoContinuar }: Props) {
  const { publicada, instalada } = diagnostico;
  const bloqueado = diagnostico.estado === 'bloqueado';

  return (
    <ScrollView contentContainerStyle={estilos.raiz}>
      <Text style={estilos.titulo}>
        {bloqueado ? 'Atualização obrigatória' : 'Existe uma versão mais nova'}
      </Text>

      <Mensagem
        tipo={bloqueado ? 'erro' : 'aviso'}
        texto={
          bloqueado
            ? 'Esta versão do aplicativo não é mais aceita pelo servidor. Atualize antes de coletar.'
            : 'Você pode continuar, mas atualize assim que possível.'
        }
      />

      <Cartao>
        <Text style={estilos.linha}>
          Instalada: <Text style={estilos.destaque}>{instalada}</Text>
        </Text>
        <Text style={estilos.linha}>
          Publicada: <Text style={estilos.destaque}>{publicada?.versaoAtual ?? '—'}</Text>
        </Text>
        {publicada?.notas ? <Text style={estilos.notas}>{publicada.notas}</Text> : null}
      </Cartao>

      {publicada?.sha256 ? (
        <Cartao>
          <Text style={estilos.rotulo}>SHA-256 do arquivo</Text>
          <Text style={estilos.hash} selectable>
            {publicada.sha256}
          </Text>
          <Text style={estilos.dica}>
            Confira este código na página de download antes de instalar.
          </Text>
        </Cartao>
      ) : null}

      {publicada?.urlDownload ? (
        <Botao
          titulo="Abrir página de download"
          aoTocar={() => {
            void Linking.openURL(publicada.urlDownload);
          }}
        />
      ) : null}

      {aoContinuar ? (
        <View style={estilos.espaco}>
          <Botao titulo="Continuar assim mesmo" variante="secundario" aoTocar={aoContinuar} />
        </View>
      ) : null}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  raiz: { padding: 20, gap: 12, backgroundColor: cores.fundo, flexGrow: 1 },
  titulo: { fontSize: 22, fontWeight: '700', color: cores.texto, marginBottom: 4 },
  linha: { fontSize: 15, color: cores.texto, marginBottom: 4 },
  destaque: { fontWeight: '700' },
  rotulo: { fontSize: 13, color: cores.suave, marginBottom: 4 },
  hash: { fontSize: 12, color: cores.texto, fontFamily: 'monospace' },
  dica: { fontSize: 13, color: cores.suave, marginTop: 6 },
  notas: { fontSize: 14, color: cores.suave, marginTop: 6 },
  espaco: { marginTop: 4 },
});
