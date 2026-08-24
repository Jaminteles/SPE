/**
 * Ambiente dos testes E2E, carregado antes dos imports das specs.
 * Os limites de rate limit ficam altos o bastante para a suite rodar, mas
 * finitos: o teste de rajada continua provando que o corte existe.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'segredo-de-teste-com-32-caracteres-ou-mais';
process.env.DEVICE_HASH_PEPPER ??= 'pepper-de-teste-com-32-caracteres-ou-mais';
process.env.THROTTLE_LIMIT ??= '5000';
process.env.COLETA_THROTTLE_LIMITE_ABERTURA ??= '200';
process.env.COLETA_THROTTLE_LIMITE_ENVIO ??= '40';

// A analise de suspeita por tempo fica desligada por padrao: a suite envia em
// milissegundos. A suite de integridade liga os limites de proposito.
process.env.COLETA_SEGUNDOS_MINIMOS ??= '0';
process.env.COLETA_SEGUNDOS_POR_PERGUNTA ??= '0';

process.env.EXPORTACAO_THROTTLE_LIMITE ??= '200';
