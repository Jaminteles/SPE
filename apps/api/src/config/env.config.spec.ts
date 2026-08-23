import { validarAmbiente } from './env.config';

const BASE = { DATABASE_URL: 'postgresql://spe:spe@localhost:5432/spe_test?schema=public' };

describe('validarAmbiente', () => {
  it('não sobe a aplicação sem DATABASE_URL', () => {
    expect(() => validarAmbiente({})).toThrow('DATABASE_URL não configurada.');
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
  });
});
