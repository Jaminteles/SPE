/** Paleta minima do aplicativo. A identidade visual entra depois do protótipo aprovado. */
export const cores = {
  fundo: '#ffffff',
  cartao: '#fbfbfc',
  texto: '#16202a',
  suave: '#6b7b8b',
  borda: '#d7dee6',
  acao: '#16202a',
  fundoBotaoTexto: '#ffffff',
  erro: '#a3231f',
} as const;

/**
 * Série categórica dos gráficos. Ordem fixa: a mesma alternativa mantém a mesma
 * cor entre o gráfico de barras e o de pizza da mesma pergunta. Alternativas
 * além da oitava repetem a sequência — nenhuma pergunta da pesquisa passa disso,
 * e repetir é melhor que gerar cor ilegível por interpolação.
 */
export const coresDeSerie = [
  '#2f6f9f',
  '#c9722c',
  '#4f8a5b',
  '#8d5aa8',
  '#a3231f',
  '#31808a',
  '#8a7326',
  '#6b7b8b',
] as const;

export function corDaSerie(indice: number): string {
  return coresDeSerie[indice % coresDeSerie.length];
}
