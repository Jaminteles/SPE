import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';

import { ErroApi, ErroDeRede } from '../../api/cliente';
import { bancoLocal } from '../../coleta/banco-local';
import { filaDeEnvio } from '../../coleta/fila-de-envio';
import {
  faltaResponder,
  montarItens,
  pendenciasObrigatorias,
  perguntasVisiveis,
  respostasOrfas,
} from '../../coleta/logica-condicional';
import { obterDispositivoId, servicoColeta } from '../../coleta/servico-coleta';
import {
  FormularioPublico,
  PacoteDeEnvio,
  RespostasEmAndamento,
  ValorDaResposta,
} from '../../coleta/tipos';
import { cores } from '../../ui/cores';
import { TelaAbertura } from './TelaAbertura';
import { TelaConclusao } from './TelaConclusao';
import { TelaConsentimento } from './TelaConsentimento';
import { TelaMunicipio } from './TelaMunicipio';
import { TelaPerguntaColeta } from './TelaPerguntaColeta';
import { TelaRevisao } from './TelaRevisao';

type Etapa =
  | 'abertura'
  | 'carregando'
  | 'consentimento'
  | 'municipio'
  | 'perguntas'
  | 'revisao'
  | 'enviada'
  | 'pendente';

interface Props {
  aoSair: () => void;
  /** Token trazido pelo link de coleta, quando a entrada veio de fora do app. */
  tokenInicial?: string | null;
}

/**
 * Fluxo de coleta de ponta a ponta.
 *
 * Ordem fixa: consentimento → município → perguntas → revisão → envio.
 * Cada passo é gravado em SQLite no aparelho, então fechar o app no meio do
 * preenchimento não perde nada: ao reabrir a mesma pesquisa, o rascunho é
 * retomado no ponto em que parou.
 */
export function FluxoDeColeta({ aoSair, tokenInicial }: Props) {
  const [etapa, setEtapa] = useState<Etapa>('abertura');
  const [formulario, setFormulario] = useState<FormularioPublico | null>(null);
  const [respostaId, setRespostaId] = useState<string | null>(null);
  const [consentimentoEm, setConsentimentoEm] = useState<string | null>(null);
  const [municipio, setMunicipio] = useState<number | null>(null);
  const [municipioNome, setMunicipioNome] = useState<string | null>(null);
  const [respostas, setRespostas] = useState<RespostasEmAndamento>({});
  const [indice, setIndice] = useState(0);
  const [localizacao, setLocalizacao] = useState<{ latitude: number; longitude: number } | null>(
    null,
  );
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendentes, setPendentes] = useState(0);

  const visiveis = useMemo(
    () => (formulario ? perguntasVisiveis(formulario.perguntas, respostas) : []),
    [formulario, respostas],
  );

  const atualizarPendentes = useCallback(async () => {
    setPendentes(await bancoLocal.contarPendentes());
  }, []);

  useEffect(() => {
    void (async () => {
      await bancoLocal.iniciar();
      await filaDeEnvio.processar();
      await atualizarPendentes();
    })();
  }, [atualizarPendentes]);

  /**
   * Reenvio automático: toda volta do app ao primeiro plano é uma chance de a
   * conexão ter voltado. O backoff da fila evita insistência inútil.
   */
  useEffect(() => {
    const assinatura = AppState.addEventListener('change', (estado) => {
      if (estado !== 'active') {
        return;
      }
      void (async () => {
        await filaDeEnvio.processar();
        await atualizarPendentes();
      })();
    });

    return () => assinatura.remove();
  }, [atualizarPendentes]);

  /** Abre a pesquisa e retoma o rascunho, se existir. */
  const abrir = useCallback(async (token: string) => {
    setCarregando(true);
    setErro(null);
    try {
      const publico = await servicoColeta.abrir(token);
      setFormulario(publico);

      const rascunho = await bancoLocal.buscarRascunho(token);
      if (rascunho) {
        setRespostaId(rascunho.respostaId);
        setConsentimentoEm(rascunho.consentimentoEm);
        setMunicipio(rascunho.municipioCodigoIbge);
        setMunicipioNome(rascunho.municipioNome);
        setRespostas(rascunho.respostas);
        setIndice(rascunho.indiceAtual);
        setLocalizacao(
          rascunho.latitude !== null && rascunho.longitude !== null
            ? { latitude: rascunho.latitude, longitude: rascunho.longitude }
            : null,
        );
        // Retoma exatamente onde parou.
        setEtapa(
          !rascunho.consentimentoEm
            ? 'consentimento'
            : rascunho.municipioCodigoIbge === null
              ? 'municipio'
              : 'perguntas',
        );
        return;
      }

      setRespostaId(Crypto.randomUUID());
      setConsentimentoEm(null);
      setMunicipio(null);
      setMunicipioNome(null);
      setRespostas({});
      setIndice(0);
      setLocalizacao(null);
      setEtapa('consentimento');
    } catch (falha) {
      setErro(
        falha instanceof ErroApi
          ? falha.message
          : 'Não foi possível abrir a pesquisa. Verifique a conexão.',
      );
    } finally {
      setCarregando(false);
    }
  }, []);

  /**
   * Entrada pelo link: abre a pesquisa sem passar pela digitação do código.
   * Se falhar, a tela de abertura aparece com o erro e o campo à mão — o link
   * pode ter chegado truncado, e aí digitar o código é a saída.
   */
  useEffect(() => {
    if (tokenInicial) {
      void abrir(tokenInicial);
    }
  }, [tokenInicial, abrir]);

  async function aceitarConsentimento() {
    if (!formulario || !respostaId) {
      return;
    }
    const agora = new Date().toISOString();
    await bancoLocal.abrirRascunho({
      token: formulario.token,
      respostaId,
      titulo: formulario.titulo,
      consentimentoEm: agora,
    });
    setConsentimentoEm(agora);
    setEtapa('municipio');
  }

  async function escolherMunicipio(codigoIbge: number, nome: string) {
    setMunicipio(codigoIbge);
    setMunicipioNome(nome);
    if (formulario) {
      await bancoLocal.definirMunicipio(formulario.token, codigoIbge, nome);
    }
  }

  /**
   * Grava a resposta e limpa o que a lógica condicional acabou de ocultar:
   * resposta de pergunta oculta é recusada pelo servidor, e com razão.
   */
  async function responder(perguntaId: string, valor: ValorDaResposta | undefined) {
    if (!formulario) {
      return;
    }

    const atualizadas = { ...respostas, [perguntaId]: valor };
    const orfas = respostasOrfas(formulario.perguntas, atualizadas);
    for (const orfa of orfas) {
      delete atualizadas[orfa];
    }

    setRespostas(atualizadas);
    await bancoLocal.gravarResposta(formulario.token, perguntaId, valor);
    if (orfas.length > 0) {
      await bancoLocal.removerRespostas(formulario.token, orfas);
    }
  }

  async function avancar() {
    if (!formulario) {
      return;
    }
    const proximo = indice + 1;
    if (proximo >= visiveis.length) {
      setEtapa('revisao');
      return;
    }
    setIndice(proximo);
    await bancoLocal.definirIndice(formulario.token, proximo);
  }

  async function voltarPergunta() {
    if (!formulario) {
      return;
    }
    if (indice === 0) {
      setEtapa('municipio');
      return;
    }
    const anterior = indice - 1;
    setIndice(anterior);
    await bancoLocal.definirIndice(formulario.token, anterior);
  }

  async function definirLocalizacao(posicao: { latitude: number; longitude: number } | null) {
    setLocalizacao(posicao);
    if (formulario) {
      await bancoLocal.definirLocalizacao(
        formulario.token,
        posicao?.latitude ?? null,
        posicao?.longitude ?? null,
      );
    }
  }

  async function enviar() {
    if (!formulario || !respostaId || !consentimentoEm || municipio === null) {
      return;
    }

    const faltando = pendenciasObrigatorias(formulario.perguntas, respostas);
    if (faltando.length > 0) {
      setErro(`Ainda falta responder a pergunta ${faltando[0].ordem}.`);
      const posicao = visiveis.findIndex((pergunta) => pergunta.id === faltando[0].id);
      setIndice(posicao >= 0 ? posicao : 0);
      setEtapa('perguntas');
      return;
    }

    setEnviando(true);
    setErro(null);
    try {
      const pacote: PacoteDeEnvio = {
        respostaId,
        // A sessão vem da abertura da pesquisa e mede o início do preenchimento.
        sessao: formulario.sessao,
        consentimento: true,
        consentimentoEm,
        municipioCodigoIbge: municipio,
        dispositivoId: await obterDispositivoId(),
        coletadoEm: new Date().toISOString(),
        origem: 'APLICATIVO',
        itens: montarItens(formulario.perguntas, respostas),
        ...(localizacao ? { latitude: localizacao.latitude, longitude: localizacao.longitude } : {}),
      };

      const confirmado = await filaDeEnvio.enviarOuEnfileirar(formulario.token, pacote);
      await bancoLocal.descartarRascunho(formulario.token);
      await atualizarPendentes();
      setEtapa(confirmado ? 'enviada' : 'pendente');
    } catch (falha) {
      // Falha definitiva: o pacote foi recusado e não adianta reenviar.
      setErro(
        falha instanceof ErroDeRede
          ? falha.message
          : falha instanceof ErroApi
            ? falha.message
            : 'Não foi possível enviar a resposta.',
      );
    } finally {
      setEnviando(false);
    }
  }

  async function reenviarPendentes() {
    setEnviando(true);
    try {
      await filaDeEnvio.processar();
      await atualizarPendentes();
    } finally {
      setEnviando(false);
    }
  }

  function encerrar() {
    setFormulario(null);
    setRespostaId(null);
    setRespostas({});
    setIndice(0);
    setEtapa('abertura');
    void atualizarPendentes();
  }

  if (etapa === 'carregando') {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator color={cores.acao} />
      </View>
    );
  }

  if (etapa === 'abertura' || !formulario) {
    return (
      <TelaAbertura
        aoAbrir={(token) => void abrir(token)}
        aoVoltar={aoSair}
        carregando={carregando}
        erro={erro}
        pendentes={pendentes}
        aoReenviarPendentes={() => void reenviarPendentes()}
      />
    );
  }

  if (etapa === 'consentimento') {
    return (
      <TelaConsentimento
        titulo={formulario.titulo}
        descricao={formulario.descricao}
        aoAceitar={() => void aceitarConsentimento()}
        aoRecusar={encerrar}
      />
    );
  }

  if (etapa === 'municipio') {
    return (
      <TelaMunicipio
        selecionado={municipio}
        aoSelecionar={(codigoIbge, nome) => void escolherMunicipio(codigoIbge, nome)}
        aoContinuar={() => setEtapa('perguntas')}
        aoVoltar={() => setEtapa('consentimento')}
      />
    );
  }

  if (etapa === 'perguntas') {
    const posicao = Math.min(indice, Math.max(visiveis.length - 1, 0));
    const pergunta = visiveis[posicao];

    if (!pergunta) {
      // Nenhuma pergunta visível (tudo oculto pela condição): vai direto revisar.
      return (
        <TelaRevisao
          perguntas={formulario.perguntas}
          respostas={respostas}
          nomeDoMunicipio={rotuloDoMunicipio(municipioNome, municipio)}
          localizacao={localizacao}
          enviando={enviando}
          erro={erro}
          aoDefinirLocalizacao={(posicaoGeo) => void definirLocalizacao(posicaoGeo)}
          aoEnviar={() => void enviar()}
          aoVoltar={() => setEtapa('municipio')}
          aoIrParaPergunta={() => setEtapa('municipio')}
        />
      );
    }

    return (
      <TelaPerguntaColeta
        pergunta={pergunta}
        valor={respostas[pergunta.id]}
        posicao={posicao + 1}
        total={visiveis.length}
        podeAvancar={!faltaResponder(pergunta, respostas)}
        aoResponder={(valor) => void responder(pergunta.id, valor)}
        aoAvancar={() => void avancar()}
        aoVoltar={() => void voltarPergunta()}
      />
    );
  }

  if (etapa === 'revisao') {
    return (
      <TelaRevisao
        perguntas={formulario.perguntas}
        respostas={respostas}
        nomeDoMunicipio={rotuloDoMunicipio(municipioNome, municipio)}
        localizacao={localizacao}
        enviando={enviando}
        erro={erro}
        aoDefinirLocalizacao={(posicao) => void definirLocalizacao(posicao)}
        aoEnviar={() => void enviar()}
        aoVoltar={() => setEtapa('perguntas')}
        aoIrParaPergunta={(perguntaId) => {
          const posicao = visiveis.findIndex((pergunta) => pergunta.id === perguntaId);
          setIndice(posicao >= 0 ? posicao : 0);
          setEtapa('perguntas');
        }}
      />
    );
  }

  return (
    <TelaConclusao
      situacao={etapa === 'enviada' ? 'enviada' : 'pendente'}
      aoConcluir={encerrar}
      aoTentarAgora={() => void reenviarPendentes()}
      tentando={enviando}
    />
  );
}

/** Rótulo de tela. A apuração usa exclusivamente o código IBGE. */
function rotuloDoMunicipio(nome: string | null, codigo: number | null): string {
  if (codigo === null) {
    return 'Não informado';
  }
  return nome ?? `Código IBGE ${codigo}`;
}

const estilos = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: cores.fundo },
});
