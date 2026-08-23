import { ItemParaEnvio, PerguntaPublica, RespostasEmAndamento } from './tipos';

/**
 * Mesma regra do servidor: sem condição a pergunta sempre aparece; com condição,
 * aparece quando a alternativa que a habilita foi escolhida — e desde que a
 * própria pergunta de origem esteja visível.
 *
 * A ordem importa: a origem de uma condição é sempre anterior, então percorrer
 * na ordem resolve encadeamento sem precisar de segunda passada.
 */
export function perguntasVisiveis(
  perguntas: PerguntaPublica[],
  respostas: RespostasEmAndamento,
): PerguntaPublica[] {
  const visiveis: PerguntaPublica[] = [];
  const idsVisiveis = new Set<string>();

  for (const pergunta of perguntas) {
    if (!pergunta.condicaoAlternativaId || !pergunta.condicaoPerguntaId) {
      visiveis.push(pergunta);
      idsVisiveis.add(pergunta.id);
      continue;
    }

    if (!idsVisiveis.has(pergunta.condicaoPerguntaId)) {
      continue;
    }

    const respostaDaOrigem = respostas[pergunta.condicaoPerguntaId];
    const habilitou =
      respostaDaOrigem?.tipo === 'alternativa' &&
      respostaDaOrigem.alternativaId === pergunta.condicaoAlternativaId;

    if (habilitou) {
      visiveis.push(pergunta);
      idsVisiveis.add(pergunta.id);
    }
  }

  return visiveis;
}

/**
 * Perguntas que já foram respondidas mas deixaram de aparecer. Precisam sair do
 * rascunho: resposta de pergunta oculta é recusada pelo servidor, e com razão.
 */
export function respostasOrfas(
  perguntas: PerguntaPublica[],
  respostas: RespostasEmAndamento,
): string[] {
  const visiveis = new Set(perguntasVisiveis(perguntas, respostas).map((p) => p.id));
  return Object.keys(respostas).filter(
    (perguntaId) => respostas[perguntaId] !== undefined && !visiveis.has(perguntaId),
  );
}

/** Uma pergunta obrigatória visível sem resposta trava o avanço. */
export function faltaResponder(
  pergunta: PerguntaPublica,
  respostas: RespostasEmAndamento,
): boolean {
  if (!pergunta.obrigatoria) {
    return false;
  }
  const valor = respostas[pergunta.id];
  if (!valor) {
    return true;
  }
  if (valor.tipo === 'alternativas') {
    return valor.alternativaIds.length === 0;
  }
  if (valor.tipo === 'texto') {
    return valor.valor.trim().length === 0;
  }
  return false;
}

export function pendenciasObrigatorias(
  perguntas: PerguntaPublica[],
  respostas: RespostasEmAndamento,
): PerguntaPublica[] {
  return perguntasVisiveis(perguntas, respostas).filter((pergunta) =>
    faltaResponder(pergunta, respostas),
  );
}

/** Converte o rascunho no formato que a API espera. */
export function montarItens(
  perguntas: PerguntaPublica[],
  respostas: RespostasEmAndamento,
): ItemParaEnvio[] {
  const itens: ItemParaEnvio[] = [];

  for (const pergunta of perguntasVisiveis(perguntas, respostas)) {
    const valor = respostas[pergunta.id];
    if (!valor) {
      continue;
    }

    switch (valor.tipo) {
      case 'alternativa':
        itens.push({ perguntaId: pergunta.id, alternativaId: valor.alternativaId });
        break;
      case 'alternativas':
        for (const alternativaId of valor.alternativaIds) {
          itens.push({ perguntaId: pergunta.id, alternativaId });
        }
        break;
      case 'numero':
        itens.push({ perguntaId: pergunta.id, valorNumero: valor.valor });
        break;
      case 'texto':
        if (valor.valor.trim().length > 0) {
          itens.push({ perguntaId: pergunta.id, valorTexto: valor.valor.trim() });
        }
        break;
    }
  }

  return itens;
}
