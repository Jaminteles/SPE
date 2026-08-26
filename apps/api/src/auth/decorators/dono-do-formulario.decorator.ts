import { SetMetadata } from '@nestjs/common';

export const CHAVE_DONO_DO_FORMULARIO = 'dono_do_formulario';

/**
 * Exige que o formulário da rota pertença a quem está pedindo.
 *
 * O argumento é o nome do parâmetro de rota que carrega o id do formulário —
 * `:id` nas rotas de montagem, `:formularioId` nas de resultado e exportação.
 *
 * Perfis que enxergam tudo passam direto; quem não enxerga recebe 404, nunca
 * 403: responder "existe, mas não é seu" transformaria a rota num verificador
 * de existência de pesquisa alheia.
 */
export const DonoDoFormulario = (parametro = 'formularioId') =>
  SetMetadata(CHAVE_DONO_DO_FORMULARIO, parametro);
