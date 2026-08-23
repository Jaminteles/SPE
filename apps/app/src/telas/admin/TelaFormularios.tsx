import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, Text, View } from 'react-native';

import {
  FormularioResumo,
  ROTULO_DO_STATUS,
  servicoFormularios,
} from '../../api/servico-formularios';
import { Botao, Cabecalho, Campo, Cartao, Etiqueta, Mensagem } from '../../ui/componentes';
import { cores } from '../../ui/cores';
import { ehSessaoEncerrada, mensagemDeFalha } from './erros';

interface Props {
  aoAbrir: (formularioId: string) => void;
  aoVoltar: () => void;
  aoPerderSessao: () => void;
}

export function TelaFormularios({ aoAbrir, aoVoltar, aoPerderSessao }: Props) {
  const [itens, setItens] = useState<FormularioResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const lista = await servicoFormularios.listar();
      setItens(lista.itens);
    } catch (falha) {
      if (ehSessaoEncerrada(falha)) {
        aoPerderSessao();
        return;
      }
      setErro(mensagemDeFalha(falha));
    } finally {
      setCarregando(false);
    }
  }, [aoPerderSessao]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function criar() {
    if (titulo.trim().length < 3) {
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const criado = await servicoFormularios.criar({ titulo: titulo.trim() });
      setTitulo('');
      setCriando(false);
      aoAbrir(criado.id);
    } catch (falha) {
      if (ehSessaoEncerrada(falha)) {
        aoPerderSessao();
        return;
      }
      setErro(mensagemDeFalha(falha));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={estilos.conteudo}>
      <Cabecalho
        titulo="Pesquisas"
        subtitulo="Formulários criados por esta administração"
        aoVoltar={aoVoltar}
      />

      {erro ? <Mensagem texto={erro} /> : null}

      {criando ? (
        <Cartao>
          <Campo
            rotulo="Título da pesquisa"
            value={titulo}
            onChangeText={setTitulo}
            placeholder="Ex.: Intenção de voto — 1ª rodada"
            editable={!salvando}
          />
          <View style={estilos.linhaBotoes}>
            <View style={estilos.metade}>
              <Botao
                titulo="Cancelar"
                variante="secundario"
                aoTocar={() => {
                  setCriando(false);
                  setTitulo('');
                }}
              />
            </View>
            <View style={estilos.metade}>
              <Botao
                titulo="Criar rascunho"
                aoTocar={criar}
                carregando={salvando}
                desabilitado={titulo.trim().length < 3}
              />
            </View>
          </View>
        </Cartao>
      ) : (
        <View style={estilos.acaoTopo}>
          <Botao titulo="Nova pesquisa" aoTocar={() => setCriando(true)} />
        </View>
      )}

      {carregando ? (
        <ActivityIndicator color={cores.acao} style={estilos.espera} />
      ) : itens.length === 0 ? (
        <Text style={estilos.vazio}>Nenhuma pesquisa cadastrada ainda.</Text>
      ) : (
        itens.map((formulario) => (
          <TouchableOpacity
            key={formulario.id}
            onPress={() => aoAbrir(formulario.id)}
            accessibilityRole="button"
          >
            <Cartao>
              <Text style={estilos.itemTitulo}>{formulario.titulo}</Text>
              <View style={estilos.itemRodape}>
                <Etiqueta texto={ROTULO_DO_STATUS[formulario.status]} />
                <Text style={estilos.itemInfo}>
                  {formulario.totalPerguntas}{' '}
                  {formulario.totalPerguntas === 1 ? 'pergunta' : 'perguntas'}
                </Text>
              </View>
            </Cartao>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: 24, paddingTop: 64, paddingBottom: 48 },
  acaoTopo: { marginBottom: 18 },
  linhaBotoes: { flexDirection: 'row', gap: 10 },
  metade: { flex: 1 },
  espera: { marginTop: 24 },
  vazio: { color: cores.suave, fontSize: 14, marginTop: 16 },
  itemTitulo: { fontSize: 15, fontWeight: '600', color: cores.texto, marginBottom: 8 },
  itemRodape: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemInfo: { fontSize: 12, color: cores.suave },
});
