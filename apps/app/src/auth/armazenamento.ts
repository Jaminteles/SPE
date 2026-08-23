import * as SecureStore from 'expo-secure-store';

const CHAVE_ACCESS = 'spe.access_token';
const CHAVE_REFRESH = 'spe.refresh_token';

/**
 * Guarda de credenciais no armazenamento seguro do dispositivo (Keystore).
 * Token nunca vai para AsyncStorage, arquivo comum ou log.
 */
export const armazenamentoDeSessao = {
  async guardar(accessToken: string, refreshToken: string): Promise<void> {
    await SecureStore.setItemAsync(CHAVE_ACCESS, accessToken);
    await SecureStore.setItemAsync(CHAVE_REFRESH, refreshToken);
  },

  async lerAccessToken(): Promise<string | null> {
    return SecureStore.getItemAsync(CHAVE_ACCESS);
  },

  async lerRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(CHAVE_REFRESH);
  },

  async limpar(): Promise<void> {
    await SecureStore.deleteItemAsync(CHAVE_ACCESS);
    await SecureStore.deleteItemAsync(CHAVE_REFRESH);
  },
};
