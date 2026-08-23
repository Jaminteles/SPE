/**
 * Configuracao de ambiente do aplicativo.
 * Nenhum segredo fica no bundle: o APK e distribuido diretamente e e inspecionavel.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000/api';

export const ambiente = {
  apiUrl: API_URL,
} as const;
