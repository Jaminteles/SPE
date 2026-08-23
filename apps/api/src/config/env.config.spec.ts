import { validarAmbiente } from './env.config';

const BASE = {
  DATABASE_URL: 'postgresql://spe:spe@localhost:5432/spe_test?schema=public',
  JWT_SECRET: 'segredo-de-teste-com-32-caracteres-ou-mais',
  DEVICE_HASH_PEPPER: 'pepper-de-teste-com-32-caracteres-ou-mais',
};

describe('validarAmbiente', () => {
  it('não sobe a aplicação sem DATABASE_URL', () => {
    expect(() => validarAmbiente({})).toThrow('DATABASE_URL não configurada.');
  });

  it('não sobe a aplicação sem JWT_SECRET', () => {
    const semSegredo = {
      DATABASE_URL: BASE.DATABASE_URL,
      DEVICE_HASH_PEPPER: BASE.DEVICE_HASH_PEPPER,
    };
    expect(() => validarAmbiente(semSegredo)).toThrow('JWT_SECRET não configurado.');
  });

  it('recusa JWT_SECRET curto', () => {
    expect(() => validarAmbiente({ ...BASE, JWT_SECRET: 'curto' })).toThrow('curto demais');
  });

  it('exige HTTPS por padrão em produção e não em desenvolvimento', () => {
    expect(validarAmbiente({ ...BASE, NODE_ENV: 'production' }).TLS_OBRIGATORIO).toBe(true);
    expect(validarAmbiente(BASE).TLS_OBRIGATORIO).toBe(false);
  });

  it('não sobe a aplicação sem DEVICE_HASH_PEPPER', () => {
    const semPepper = { DATABASE_URL: BASE.DATABASE_URL, JWT_SECRET: BASE.JWT_SECRET };
    expect(() => validarAmbiente(semPepper)).toThrow('DEVICE_HASH_PEPPER não configurado.');
  });

  it('recusa DEVICE_HASH_PEPPER curto', () => {
    expect(() => validarAmbiente({ ...BASE, DEVICE_HASH_PEPPER: 'curto' })).toThrow('curto demais');
  });

  it('recusa NODE_ENV desconhecido', () => {
    expect(() => validarAmbiente({ ...BASE, NODE_ENV: 'staging' })).toThrow('NODE_ENV inválido');
  });

  it('recusa valor não numérico em PORT', () => {
    expect(() => validarAmbiente({ ...BASE, PORT: 'abc' })).toThrow('PORT inválida');
  });

  it('quebra CORS_ORIGINS em lista e aplica os padrões', () => {
    const env = validarAmbiente({
      ...BASE,
      CORS_ORIGINS: 'http://localhost:5173, https://painel.exemplo.br ',
    });

    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173', 'https://painel.exemplo.br']);
    expect(env.PORT).toBe(3000);
    expect(env.THROTTLE_LIMIT).toBe(60);
    expect(env.THROTTLE_TTL_MS).toBe(60_000);
    expect(env.JWT_ACCESS_TTL_MIN).toBe(15);
    expect(env.SESSAO_INATIVIDADE_MIN).toBe(30);
    expect(env.SESSAO_ABSOLUTA_HORAS).toBe(8);
  });
});
