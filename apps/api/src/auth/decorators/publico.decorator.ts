import { SetMetadata } from '@nestjs/common';

export const CHAVE_ROTA_PUBLICA = 'rota_publica';

/**
 * Marca a rota como publica. Sem esta marca, toda rota exige token:
 * o padrao do projeto e negar.
 */
export const Publico = () => SetMetadata(CHAVE_ROTA_PUBLICA, true);
