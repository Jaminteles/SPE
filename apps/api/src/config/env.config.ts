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
  JWT_SECRET: string;
  JWT_ACCESS_TTL_MIN: number;
  SESSAO_INATIVIDADE_MIN: number;
  SESSAO_ABSOLUTA_HORAS: number;
  TLS_OBRIGATORIO: boolean;
  COLETA_BASE_URL: string;
}

const AMBIENTES = ['development', 'test', 'production'] as const;

/** Comprimento mínimo do segredo de assinatura do token. */
const JWT_SECRET_MINIMO = 32;

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

function booleano(valor: string | unknown, padrao: boolean): boolean {
  if (valor === undefined || valor === '') {
    return padrao;
  }
  return String(valor).toLowerCase() === 'true';
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

  const jwtSecret = bruto.JWT_SECRET as string | undefined;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET não configurado.');
  }
  if (jwtSecret.length < JWT_SECRET_MINIMO) {
    throw new Error(`JWT_SECRET curto demais: mínimo de ${JWT_SECRET_MINIMO} caracteres.`);
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
    JWT_SECRET: jwtSecret,
    JWT_ACCESS_TTL_MIN: inteiro(
      bruto.JWT_ACCESS_TTL_MIN as string | undefined,
      15,
      'JWT_ACCESS_TTL_MIN',
    ),
    SESSAO_INATIVIDADE_MIN: inteiro(
      bruto.SESSAO_INATIVIDADE_MIN as string | undefined,
      30,
      'SESSAO_INATIVIDADE_MIN',
    ),
    SESSAO_ABSOLUTA_HORAS: inteiro(
      bruto.SESSAO_ABSOLUTA_HORAS as string | undefined,
      8,
      'SESSAO_ABSOLUTA_HORAS',
    ),
    // Em produção o padrão é exigir HTTPS; o proxy encerra o TLS e informa o esquema.
    TLS_OBRIGATORIO: booleano(bruto.TLS_OBRIGATORIO, nodeEnv === 'production'),
    // Base do link público de coleta, sem barra no fim.
    COLETA_BASE_URL: String(bruto.COLETA_BASE_URL ?? 'http://localhost:5173').replace(/\/+$/, ''),
  };
}
