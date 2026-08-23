import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { chamar } from '../api/cliente';
import { FormularioPublico, Municipio, PacoteDeEnvio, RespostaRegistrada } from './tipos';

const CHAVE_DISPOSITIVO = 'spe.dispositivo_id';

/**
 * Identificador técnico do aparelho.
 *
 * É um uuid aleatório criado na primeira execução e guardado no armazenamento
 * seguro. Não vem de IMEI, MAC, conta ou qualquer coisa ligada à pessoa — serve
 * só para o servidor barrar resposta duplicada, e lá ele vira hash.
 */
export async function obterDispositivoId(): Promise<string> {
  const guardado = await SecureStore.getItemAsync(CHAVE_DISPOSITIVO);
  if (guardado) {
    return guardado;
  }
  const novo = Crypto.randomUUID();
  await SecureStore.setItemAsync(CHAVE_DISPOSITIVO, novo);
  return novo;
}

export const servicoColeta = {
  /** Abre a pesquisa pelo token do link. Rota pública: sem token de sessão. */
  abrir(token: string): Promise<FormularioPublico> {
    return chamar<FormularioPublico>(`/coleta/${token}`);
  },

  enviar(token: string, pacote: PacoteDeEnvio): Promise<RespostaRegistrada> {
    return chamar<RespostaRegistrada>(`/coleta/${token}/respostas`, {
      metodo: 'POST',
      corpo: pacote,
    });
  },

  /** Lista fechada de municípios, sempre por código IBGE. */
  buscarMunicipios(nome?: string): Promise<{ itens: Municipio[]; total: number }> {
    const busca = nome && nome.trim().length >= 2 ? `&nome=${encodeURIComponent(nome.trim())}` : '';
    return chamar<{ itens: Municipio[]; total: number }>(`/municipios?limite=500${busca}`);
  },
};
