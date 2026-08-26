/**
 * Configuração de ambiente do aplicativo.
 *
 * Nenhum segredo fica no bundle: o APK é distribuído diretamente e é inspecionável.
 * Fora de desenvolvimento, a API só é aceita por HTTPS — um APK apontado para
 * texto claro exporia a credencial do operador na rede.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000/api/v1';

const emDesenvolvimento = typeof __DEV__ !== 'undefined' && __DEV__;

if (!emDesenvolvimento && !API_URL.startsWith('https://')) {
  throw new Error('EXPO_PUBLIC_API_URL precisa usar HTTPS em build de distribuição.');
}

export const ambiente = {
  /** Espelha `expo.version` do app.json: e a versao que a verificacao compara. */
  versaoDoAplicativo: '0.1.2',
  apiUrl: API_URL,
  emDesenvolvimento,
  /** Teto de espera de uma chamada; sem isso o app trava em rede ruim. */
  timeoutMs: 15_000,
} as const;
