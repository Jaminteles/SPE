import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Municipio } from '../../coleta/tipos';
import { servicoColeta } from '../../coleta/servico-coleta';
import { Botao, Campo, Mensagem } from '../../ui/componentes';
import { cores } from '../../ui/cores';

interface Props {
  selecionado: number | null;
  aoSelecionar: (codigoIbge: number, nome: string) => void;
  aoContinuar: () => void;
  aoVoltar: () => void;
}

/**
 * Seleção do município em lista fechada.
 *
 * A busca filtra, mas quem escolhe é a lista: não existe digitação livre.
 * O que sai daqui é sempre o código IBGE — grafia divergente inutilizaria a
 * apuração por município, que é o objetivo central do sistema.
 */
export function TelaMunicipio({ selecionado, aoSelecionar, aoContinuar, aoVoltar }: Props) {
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const lista = await servicoColeta.buscarMunicipios();
      setMunicipios(lista.itens);
    } catch {
      setErro('Não foi possível carregar a lista de municípios. Verifique a conexão.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /** Filtro local: a lista inteira da Bahia cabe na memória e responde na hora. */
  const filtrados = useMemo(() => {
    const termo = busca
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
    if (termo.length === 0) {
      return municipios;
    }
    return municipios.filter((municipio) =>
      municipio.nome
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .includes(termo),
    );
  }, [busca, municipios]);

  return (
    <View style={estilos.container}>
      <View style={estilos.topo}>
        <TouchableOpacity onPress={aoVoltar} accessibilityRole="button">
          <Text style={estilos.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={estilos.titulo}>Onde você mora?</Text>
        <Text style={estilos.ajuda}>
          Escolha o seu município na lista. Não é possível digitar um município fora dela.
        </Text>

        <Campo
          rotulo="Buscar"
          value={busca}
          onChangeText={setBusca}
          placeholder="Comece a digitar o nome"
          autoCorrect={false}
        />

        {erro ? <Mensagem texto={erro} /> : null}
      </View>

      {carregando ? (
        <ActivityIndicator color={cores.acao} style={estilos.espera} />
      ) : (
        <FlatList
          style={estilos.lista}
          data={filtrados}
          keyExtractor={(municipio) => String(municipio.codigoIbge)}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={estilos.vazio}>Nenhum município encontrado com esse nome.</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={estilos.item}
              onPress={() => aoSelecionar(item.codigoIbge, item.nome)}
              accessibilityRole="radio"
              accessibilityState={{ selected: selecionado === item.codigoIbge }}
            >
              <View style={[estilos.marca, selecionado === item.codigoIbge && estilos.marcaAtiva]} />
              <Text style={estilos.itemTexto}>{item.nome}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      <View style={estilos.rodape}>
        <Botao titulo="Continuar" aoTocar={aoContinuar} desabilitado={selecionado === null} />
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  topo: { paddingHorizontal: 24, paddingTop: 64 },
  voltar: { color: cores.suave, fontSize: 14, marginBottom: 10 },
  titulo: { fontSize: 20, fontWeight: '600', color: cores.texto },
  ajuda: { fontSize: 13, color: cores.suave, marginTop: 4, marginBottom: 16, lineHeight: 18 },
  espera: { marginTop: 32 },
  lista: { flex: 1, paddingHorizontal: 24 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  marca: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: cores.borda,
  },
  marcaAtiva: { backgroundColor: cores.acao, borderColor: cores.acao },
  itemTexto: { fontSize: 15, color: cores.texto },
  vazio: { fontSize: 14, color: cores.suave, paddingVertical: 20 },
  rodape: { padding: 24, borderTopWidth: 1, borderTopColor: cores.borda },
});
