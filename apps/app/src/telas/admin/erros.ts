import { ErroApi, ErroDeRede } from '../../api/cliente';
import { SessaoEncerrada } from '../../api/cliente-autenticado';

/**
 * Traduz a falha para uma frase util na tela.
 * Nunca expoe detalhe interno: o que a API mandou ja vem tratado pelo filtro central.
 */
export function mensagemDeFalha(falha: unknown): string {
  if (falha instanceof SessaoEncerrada || falha instanceof ErroDeRede) {
    return falha.message;
  }
  if (falha instanceof ErroApi) {
    return falha.message;
  }
  return 'Nao foi possivel concluir a operacao.';
}

/** A sessao morreu: a tela precisa devolver o usuario ao login. */
export function ehSessaoEncerrada(falha: unknown): boolean {
  return falha instanceof SessaoEncerrada;
}
