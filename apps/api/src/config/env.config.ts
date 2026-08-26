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
  PAINEL_URL: string;
  EXPORTACAO_PDF_HABILITADO: boolean;
  EXPORTACAO_PDF_TIMEOUT_MS: number;
  PUPPETEER_EXECUTABLE_PATH: string | undefined;
  EXPORTACAO_PDF_TLS_INVALIDO: boolean;
  EXPURGO_ANOS: number;
  EXPURGO_INTERVALO_HORAS: number;
  EXPURGO_LOTE: number;
  EXPURGO_LOTES_POR_CICLO: number;
  APP_VERSAO_ATUAL: string;
  APP_VERSAO_MINIMA: string;
  APP_URL_DOWNLOAD: string;
  APP_URL_APK: string | undefined;
  APP_APK_SHA256: string | undefined;
  APP_NOTAS_DA_VERSAO: string | undefined;
  DEVICE_HASH_PEPPER: string;
  TURNSTILE_SECRET: string | undefined;
  TURNSTILE_OBRIGATORIO: boolean;
  TURNSTILE_EXIGIR_NO_APLICATIVO: boolean;
  CADASTRO_ABERTO: boolean;
  BREVO_API_KEY: string | undefined;
  EMAIL_REMETENTE: string;
  EMAIL_REMETENTE_NOME: string;
  CONFIRMACAO_EMAIL_TTL_HORAS: number;
  COLETA_LIMITE_POR_APARELHO_HORA: number;
  LIMITE_PESQUISAS_EM_COLETA: number;
}

const AMBIENTES = ['development', 'test', 'production'] as const;

/** Comprimento mínimo de qualquer segredo de ambiente. */
const SEGREDO_MINIMO = 32;

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

  const pepper = bruto.DEVICE_HASH_PEPPER as string | undefined;
  if (!pepper) {
    throw new Error('DEVICE_HASH_PEPPER não configurado.');
  }
  if (pepper.length < SEGREDO_MINIMO) {
    throw new Error(`DEVICE_HASH_PEPPER curto demais: mínimo de ${SEGREDO_MINIMO} caracteres.`);
  }

  const jwtSecret = bruto.JWT_SECRET as string | undefined;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET não configurado.');
  }
  if (jwtSecret.length < SEGREDO_MINIMO) {
    throw new Error(`JWT_SECRET curto demais: mínimo de ${SEGREDO_MINIMO} caracteres.`);
  }

  // Cadastro aberto sem envio de e-mail configurado aceitaria cadastro e nunca
  // entregaria o link de confirmação: toda conta nova nasceria trancada, e a
  // falha apareceria como "não recebi o e-mail" no suporte, não no log.
  const cadastroAberto = booleano(bruto.CADASTRO_ABERTO, false);
  if (cadastroAberto) {
    const faltando = ['BREVO_API_KEY', 'EMAIL_REMETENTE'].filter(
      (nome) => !String(bruto[nome] ?? '').trim(),
    );
    if (faltando.length > 0) {
      throw new Error(
        `CADASTRO_ABERTO=true exige ${faltando.join(' e ')}. ` +
          'Sem envio de e-mail, nenhuma conta nova consegue confirmar o cadastro.',
      );
    }
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
    // Origem do painel: é a única página que o renderizador de PDF abre.
    PAINEL_URL: String(bruto.PAINEL_URL ?? 'http://localhost:5173').replace(/\/+$/, ''),
    // O PDF exige Chromium no contêiner. Desligado por padrão para a imagem
    // caber em hospedagem pequena; CSV e XLSX não dependem de navegador.
    EXPORTACAO_PDF_HABILITADO: booleano(bruto.EXPORTACAO_PDF_HABILITADO, false),
    EXPORTACAO_PDF_TIMEOUT_MS: inteiro(
      bruto.EXPORTACAO_PDF_TIMEOUT_MS as string | undefined,
      45_000,
      'EXPORTACAO_PDF_TIMEOUT_MS',
    ),
    // Caminho do navegador quando a imagem já traz um Chromium instalado.
    PUPPETEER_EXECUTABLE_PATH: (bruto.PUPPETEER_EXECUTABLE_PATH as string | undefined) || undefined,
    EXPORTACAO_PDF_TLS_INVALIDO: booleano(bruto.EXPORTACAO_PDF_TLS_INVALIDO, false),
    // Retenção das respostas: 4 anos depois do encerramento da coleta. É prazo
    // legal, não ajuste de operação — mexer aqui é decisão de conformidade.
    EXPURGO_ANOS: inteiro(bruto.EXPURGO_ANOS as string | undefined, 4, 'EXPURGO_ANOS'),
    EXPURGO_INTERVALO_HORAS: inteiro(
      bruto.EXPURGO_INTERVALO_HORAS as string | undefined,
      24,
      'EXPURGO_INTERVALO_HORAS',
    ),
    EXPURGO_LOTE: inteiro(bruto.EXPURGO_LOTE as string | undefined, 1_000, 'EXPURGO_LOTE'),
    EXPURGO_LOTES_POR_CICLO: inteiro(
      bruto.EXPURGO_LOTES_POR_CICLO as string | undefined,
      20,
      'EXPURGO_LOTES_POR_CICLO',
    ),
    // Distribuição do APK: sem loja, a versão publicada é declarada aqui e o
    // aplicativo confere na abertura.
    APP_VERSAO_ATUAL: String(bruto.APP_VERSAO_ATUAL ?? '0.1.0'),
    APP_VERSAO_MINIMA: String(bruto.APP_VERSAO_MINIMA ?? '0.1.0'),
    APP_URL_DOWNLOAD: String(bruto.APP_URL_DOWNLOAD ?? 'http://localhost:5173/download.html'),
    APP_URL_APK: (bruto.APP_URL_APK as string | undefined) || undefined,
    APP_APK_SHA256: (bruto.APP_APK_SHA256 as string | undefined) || undefined,
    APP_NOTAS_DA_VERSAO: (bruto.APP_NOTAS_DA_VERSAO as string | undefined) || undefined,
    DEVICE_HASH_PEPPER: pepper,
    // Sem segredo o desafio fica desligado; em produção, ligue o obrigatório.
    TURNSTILE_SECRET: (bruto.TURNSTILE_SECRET as string | undefined) || undefined,
    TURNSTILE_OBRIGATORIO: booleano(bruto.TURNSTILE_OBRIGATORIO, false),
    TURNSTILE_EXIGIR_NO_APLICATIVO: booleano(bruto.TURNSTILE_EXIGIR_NO_APLICATIVO, false),
    // Cadastro aberto: desligado por padrão. Quem liga assume que qualquer
    // pessoa passa a criar conta e pesquisa nesta instalação.
    CADASTRO_ABERTO: cadastroAberto,
    BREVO_API_KEY: (bruto.BREVO_API_KEY as string | undefined) || undefined,
    EMAIL_REMETENTE: String(bruto.EMAIL_REMETENTE ?? ''),
    EMAIL_REMETENTE_NOME: String(bruto.EMAIL_REMETENTE_NOME ?? 'Pesquisa Eleitoral'),
    // Prazo curto de propósito: o link é credencial de acesso à conta, e
    // caixa de e-mail esquecida aberta é risco que não precisa durar dias.
    CONFIRMACAO_EMAIL_TTL_HORAS: inteiro(
      bruto.CONFIRMACAO_EMAIL_TTL_HORAS as string | undefined,
      24,
      'CONFIRMACAO_EMAIL_TTL_HORAS',
    ),
    // Teto de respostas por aparelho por hora. Recusa o envio, ao contrario das
    // marcacoes automaticas, que so mandam para conferencia humana.
    COLETA_LIMITE_POR_APARELHO_HORA: inteiro(
      bruto.COLETA_LIMITE_POR_APARELHO_HORA as string | undefined,
      10,
      'COLETA_LIMITE_POR_APARELHO_HORA',
    ),
    // Pesquisas simultaneamente em coleta por conta. Rascunho nao conta;
    // encerrar devolve a vaga.
    LIMITE_PESQUISAS_EM_COLETA: inteiro(
      bruto.LIMITE_PESQUISAS_EM_COLETA as string | undefined,
      10,
      'LIMITE_PESQUISAS_EM_COLETA',
    ),
  };
}
