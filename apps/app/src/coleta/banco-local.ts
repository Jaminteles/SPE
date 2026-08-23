import * as SQLite from 'expo-sqlite';

import { PacoteDeEnvio, RespostasEmAndamento, ValorDaResposta } from './tipos';

const ARQUIVO = 'spe-coleta.db';

/**
 * Persistência local da coleta em expo-sqlite.
 *
 * Por que SQLite e não armazenamento chave-valor: a resposta parcial é dado
 * estruturado — item por pergunta, com lógica condicional — e precisa
 * sobreviver ao fechamento do app no meio do preenchimento.
 *
 * O que fica gravado aqui é a resposta em andamento e a fila de reenvio.
 * Nada identifica o respondente: nem nome, nem documento, nem contato.
 */
let conexao: SQLite.SQLiteDatabase | null = null;

async function abrir(): Promise<SQLite.SQLiteDatabase> {
  if (conexao) {
    return conexao;
  }

  const banco = await SQLite.openDatabaseAsync(ARQUIVO);
  await banco.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS rascunho (
      token TEXT PRIMARY KEY NOT NULL,
      resposta_id TEXT NOT NULL,
      titulo TEXT NOT NULL,
      consentimento_em TEXT,
      municipio_codigo_ibge INTEGER,
      municipio_nome TEXT,
      indice_atual INTEGER NOT NULL DEFAULT 0,
      latitude REAL,
      longitude REAL,
      atualizado_em TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rascunho_item (
      token TEXT NOT NULL,
      pergunta_id TEXT NOT NULL,
      alternativa_id TEXT,
      alternativa_ids TEXT,
      valor_texto TEXT,
      valor_numero REAL,
      PRIMARY KEY (token, pergunta_id),
      FOREIGN KEY (token) REFERENCES rascunho (token) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS envio_pendente (
      resposta_id TEXT PRIMARY KEY NOT NULL,
      token TEXT NOT NULL,
      pacote TEXT NOT NULL,
      tentativas INTEGER NOT NULL DEFAULT 0,
      proxima_tentativa_em TEXT NOT NULL,
      ultimo_erro TEXT,
      criado_em TEXT NOT NULL
    );
  `);

  conexao = banco;
  return banco;
}

interface LinhaRascunho {
  token: string;
  resposta_id: string;
  titulo: string;
  consentimento_em: string | null;
  municipio_codigo_ibge: number | null;
  municipio_nome: string | null;
  indice_atual: number;
  latitude: number | null;
  longitude: number | null;
}

interface LinhaItem {
  pergunta_id: string;
  alternativa_id: string | null;
  alternativa_ids: string | null;
  valor_texto: string | null;
  valor_numero: number | null;
}

export interface Rascunho {
  token: string;
  respostaId: string;
  titulo: string;
  consentimentoEm: string | null;
  municipioCodigoIbge: number | null;
  municipioNome: string | null;
  indiceAtual: number;
  latitude: number | null;
  longitude: number | null;
  respostas: RespostasEmAndamento;
}

export interface EnvioPendente {
  respostaId: string;
  token: string;
  pacote: PacoteDeEnvio;
  tentativas: number;
  proximaTentativaEm: string;
  ultimoErro: string | null;
}

function paraValor(linha: LinhaItem): ValorDaResposta | undefined {
  if (linha.alternativa_id) {
    return { tipo: 'alternativa', alternativaId: linha.alternativa_id };
  }
  if (linha.alternativa_ids) {
    return { tipo: 'alternativas', alternativaIds: JSON.parse(linha.alternativa_ids) as string[] };
  }
  if (linha.valor_numero !== null) {
    return { tipo: 'numero', valor: linha.valor_numero };
  }
  if (linha.valor_texto !== null) {
    return { tipo: 'texto', valor: linha.valor_texto };
  }
  return undefined;
}

export const bancoLocal = {
  async iniciar(): Promise<void> {
    await abrir();
  },

  /** Cria o rascunho no aceite do consentimento. Um por pesquisa. */
  async abrirRascunho(dados: {
    token: string;
    respostaId: string;
    titulo: string;
    consentimentoEm: string;
  }): Promise<void> {
    const banco = await abrir();
    await banco.runAsync(
      `INSERT INTO rascunho (token, resposta_id, titulo, consentimento_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (token) DO UPDATE SET
         titulo = excluded.titulo,
         atualizado_em = excluded.atualizado_em`,
      [dados.token, dados.respostaId, dados.titulo, dados.consentimentoEm, new Date().toISOString()],
    );
  },

  async buscarRascunho(token: string): Promise<Rascunho | null> {
    const banco = await abrir();
    const linha = await banco.getFirstAsync<LinhaRascunho>(
      'SELECT * FROM rascunho WHERE token = ?',
      [token],
    );
    if (!linha) {
      return null;
    }

    const itens = await banco.getAllAsync<LinhaItem>(
      'SELECT * FROM rascunho_item WHERE token = ?',
      [token],
    );

    const respostas: RespostasEmAndamento = {};
    for (const item of itens) {
      respostas[item.pergunta_id] = paraValor(item);
    }

    return {
      token: linha.token,
      respostaId: linha.resposta_id,
      titulo: linha.titulo,
      consentimentoEm: linha.consentimento_em,
      municipioCodigoIbge: linha.municipio_codigo_ibge,
      municipioNome: linha.municipio_nome,
      indiceAtual: linha.indice_atual,
      latitude: linha.latitude,
      longitude: linha.longitude,
      respostas,
    };
  },

  /** O nome é só rótulo de tela; a apuração usa exclusivamente o código IBGE. */
  async definirMunicipio(token: string, codigoIbge: number, nome: string): Promise<void> {
    const banco = await abrir();
    await banco.runAsync(
      `UPDATE rascunho
          SET municipio_codigo_ibge = ?, municipio_nome = ?, atualizado_em = ?
        WHERE token = ?`,
      [codigoIbge, nome, new Date().toISOString(), token],
    );
  },

  async definirLocalizacao(
    token: string,
    latitude: number | null,
    longitude: number | null,
  ): Promise<void> {
    const banco = await abrir();
    await banco.runAsync(
      'UPDATE rascunho SET latitude = ?, longitude = ?, atualizado_em = ? WHERE token = ?',
      [latitude, longitude, new Date().toISOString(), token],
    );
  },

  async definirIndice(token: string, indice: number): Promise<void> {
    const banco = await abrir();
    await banco.runAsync(
      'UPDATE rascunho SET indice_atual = ?, atualizado_em = ? WHERE token = ?',
      [indice, new Date().toISOString(), token],
    );
  },

  /** Grava a resposta de uma pergunta. Chamada a cada avanço de tela. */
  async gravarResposta(
    token: string,
    perguntaId: string,
    valor: ValorDaResposta | undefined,
  ): Promise<void> {
    const banco = await abrir();

    if (!valor) {
      await banco.runAsync('DELETE FROM rascunho_item WHERE token = ? AND pergunta_id = ?', [
        token,
        perguntaId,
      ]);
      return;
    }

    await banco.runAsync(
      `INSERT INTO rascunho_item
         (token, pergunta_id, alternativa_id, alternativa_ids, valor_texto, valor_numero)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (token, pergunta_id) DO UPDATE SET
         alternativa_id = excluded.alternativa_id,
         alternativa_ids = excluded.alternativa_ids,
         valor_texto = excluded.valor_texto,
         valor_numero = excluded.valor_numero`,
      [
        token,
        perguntaId,
        valor.tipo === 'alternativa' ? valor.alternativaId : null,
        valor.tipo === 'alternativas' ? JSON.stringify(valor.alternativaIds) : null,
        valor.tipo === 'texto' ? valor.valor : null,
        valor.tipo === 'numero' ? valor.valor : null,
      ],
    );
  },

  /** Apaga respostas de perguntas que deixaram de aparecer pela lógica condicional. */
  async removerRespostas(token: string, perguntaIds: string[]): Promise<void> {
    if (perguntaIds.length === 0) {
      return;
    }
    const banco = await abrir();
    const marcadores = perguntaIds.map(() => '?').join(', ');
    await banco.runAsync(
      `DELETE FROM rascunho_item WHERE token = ? AND pergunta_id IN (${marcadores})`,
      [token, ...perguntaIds],
    );
  },

  async descartarRascunho(token: string): Promise<void> {
    const banco = await abrir();
    await banco.runAsync('DELETE FROM rascunho_item WHERE token = ?', [token]);
    await banco.runAsync('DELETE FROM rascunho WHERE token = ?', [token]);
  },

  // -------------------------------------------------------------------------
  // Fila de reenvio
  // -------------------------------------------------------------------------

  async enfileirar(pacote: PacoteDeEnvio, token: string): Promise<void> {
    const banco = await abrir();
    const agora = new Date().toISOString();
    await banco.runAsync(
      `INSERT INTO envio_pendente
         (resposta_id, token, pacote, tentativas, proxima_tentativa_em, criado_em)
       VALUES (?, ?, ?, 0, ?, ?)
       ON CONFLICT (resposta_id) DO NOTHING`,
      [pacote.respostaId, token, JSON.stringify(pacote), agora, agora],
    );
  },

  async listarPendentes(): Promise<EnvioPendente[]> {
    const banco = await abrir();
    const linhas = await banco.getAllAsync<{
      resposta_id: string;
      token: string;
      pacote: string;
      tentativas: number;
      proxima_tentativa_em: string;
      ultimo_erro: string | null;
    }>('SELECT * FROM envio_pendente ORDER BY criado_em ASC');

    return linhas.map((linha) => ({
      respostaId: linha.resposta_id,
      token: linha.token,
      pacote: JSON.parse(linha.pacote) as PacoteDeEnvio,
      tentativas: linha.tentativas,
      proximaTentativaEm: linha.proxima_tentativa_em,
      ultimoErro: linha.ultimo_erro,
    }));
  },

  async contarPendentes(): Promise<number> {
    const banco = await abrir();
    const linha = await banco.getFirstAsync<{ total: number }>(
      'SELECT COUNT(*) AS total FROM envio_pendente',
    );
    return linha?.total ?? 0;
  },

  async registrarFalha(
    respostaId: string,
    tentativas: number,
    proximaTentativaEm: string,
    erro: string,
  ): Promise<void> {
    const banco = await abrir();
    await banco.runAsync(
      `UPDATE envio_pendente
          SET tentativas = ?, proxima_tentativa_em = ?, ultimo_erro = ?
        WHERE resposta_id = ?`,
      [tentativas, proximaTentativaEm, erro, respostaId],
    );
  },

  async removerPendente(respostaId: string): Promise<void> {
    const banco = await abrir();
    await banco.runAsync('DELETE FROM envio_pendente WHERE resposta_id = ?', [respostaId]);
  },
};
