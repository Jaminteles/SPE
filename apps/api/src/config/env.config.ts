/**
 * Validação das variáveis de ambiente na subida da aplicação.
 * Nenhum valor padrão de segredo: se faltar, a API não sobe.
 */
export interface AppEnv {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  API_PREFIX: string;
  DATABASE_URL: string;
  CORS_ORIGINS: string[];
  THROTTLE_TTL_MS: number;
  THROTTLE_LIMIT: number;
}

const AMBIENTES = ['development', 'test', 'production'] as const;

function inteiro(valor: string | undefined, padrao: number, nome: string): number {
  if (valor === undefined || valor === '') {
    return padrao;
  }
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new Error(`Variável de ambiente ${nome} inválida: esperado inteiro positivo.`);
  }
  return numero;
}

export function validarAmbiente(bruto: Record<string, unknown>): AppEnv {
  const nodeEnv = (bruto.NODE_ENV as AppEnv['NODE_ENV']) ?? 'development';
  if (!AMBIENTES.includes(nodeEnv)) {
    throw new Error(`NODE_ENV inválido: ${String(bruto.NODE_ENV)}`);
  }

  const databaseUrl = bruto.DATABASE_URL as string | undefined;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL não configurada.');
  }

  const corsOrigins = String(bruto.CORS_ORIGINS ?? '')
    .split(',')
    .map((origem) => origem.trim())
    .filter((origem) => origem.length > 0);

  return {
    NODE_ENV: nodeEnv,
    PORT: inteiro(bruto.PORT as string | undefined, 3000, 'PORT'),
    API_PREFIX: String(bruto.API_PREFIX ?? 'api'),
    DATABASE_URL: databaseUrl,
    CORS_ORIGINS: corsOrigins,
    THROTTLE_TTL_MS: inteiro(
      bruto.THROTTLE_TTL_MS as string | undefined,
      60_000,
      'THROTTLE_TTL_MS',
    ),
    THROTTLE_LIMIT: inteiro(bruto.THROTTLE_LIMIT as string | undefined, 60, 'THROTTLE_LIMIT'),
  };
}
