import { SetMetadata } from '@nestjs/common';
import { PerfilCodigo } from '@prisma/client';

export const CHAVE_PERFIS = 'perfis_exigidos';

/** Restringe a rota aos perfis informados. */
export const Perfis = (...perfis: PerfilCodigo[]) => SetMetadata(CHAVE_PERFIS, perfis);
