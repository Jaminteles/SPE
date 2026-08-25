import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ROTULO_DO_STATUS } from '../../api/servico-formularios';
import { FormularioComResultado, servicoResultados } from '../../api/servico-resultados';
import { SessaoEncerrada } from '../../api/cliente-autenticado';
import { Cabecalho, Cartao, Etiqueta, Mensagem } from '../../ui/componentes';
import { cores } from '../../ui/cores';

interface Props {
  aoVoltar: () => void;
  aoAbrir: (formularioId: string, titulo: string) => void;
  aoPerderSessao: () => void;
}

/** Pesquisas que já têm resultado para mostrar. Rascunho não aparece: não coletou nada. */
export function TelaResultados({ aoVoltar, aoAbrir, aoPerderSessao }: Props) {
  const [formularios, setFormularios] = useState<FormularioComResultado[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const { formularios: lista } = await servicoResultados.listarFormularios();
      setFormularios(lista);
    } catch (falha) {
      if (falha instanceof SessaoEncerrada) {
        aoPerderSessao();
        return;
      }
      setFormularios([]);
      setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar os resultados.');
    }
  }, [aoPerderSessao]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <View style={estilos.raiz}>
      <Cabecalho titulo="Resultados" aoVoltar={aoVoltar} />

      {formularios === null ? (
        <View style={estilos.centro}>
          <ActivityIndicator color={cores.acao} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={estilos.conteudo}>
          {erro ? <Mensagem texto={erro} /> : null}

          {formularios.length === 0 && !erro ? (
            <Cartao>
              <Text style={estilos.vazio}>
                Nenhuma pesquisa publicada ainda. Os números aparecem aqui depois que a coleta
                começar.
              </Text>
            </Cartao>
          ) : null}

          {formularios.map((formulario) => (
            <Pressable
              key={formulario.id}
              onPress={() => aoAbrir(formulario.id, formulario.titulo)}
              style={({ pressed }) => [estilos.item, pressed && estilos.itemPressionado]}
            >
              <View style={estilos.itemTopo}>
                <Text style={estilos.itemTitulo}>{formulario.titulo}</Text>
                <Etiqueta texto={ROTULO_DO_STATUS[formulario.status]} />
              </View>
              <Text style={estilos.itemTexto}>
                {formulario.respostasValidas}{' '}
                {formulario.respostasValidas === 1 ? 'resposta válida' : 'respostas válidas'}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.fundo },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  conteudo: { padding: 24, paddingBottom: 48, gap: 12 },
  vazio: { fontSize: 14, color: cores.texto, lineHeight: 20 },
  item: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 10,
    backgroundColor: cores.cartao,
    padding: 16,
    gap: 6,
  },
  itemPressionado: { opacity: 0.6 },
  itemTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  itemTitulo: { flex: 1, fontSize: 15, fontWeight: '600', color: cores.texto },
  itemTexto: { fontSize: 13, color: cores.suave },
});
