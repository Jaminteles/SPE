import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Polyline, G } from 'react-native-svg';

import { corDaSerie, cores } from './cores';

/**
 * Gráficos do aplicativo. Tela de celular é estreita e o dedo é impreciso: as
 * barras são horizontais (rótulo cabe inteiro, sem texto girado) e nenhum
 * gráfico depende de toque para ser lido — o número aparece escrito ao lado.
 */

export interface Fatia {
  chave: string;
  rotulo: string;
  total: number;
  percentual: number;
}

function formatarPercentual(valor: number): string {
  return `${valor.toFixed(valor >= 10 ? 0 : 1).replace('.', ',')}%`;
}

// ---------------------------------------------------------------------------

/**
 * Barras horizontais. Sem SVG de propósito: uma View com largura percentual
 * desenha isso melhor, acompanha o tamanho da fonte do sistema e não custa
 * nada em memória.
 */
export function GraficoDeBarras({ fatias }: { fatias: Fatia[] }) {
  const maior = Math.max(...fatias.map((f) => f.percentual), 1);

  return (
    <View style={estilos.barras}>
      {fatias.map((fatia, indice) => (
        <View key={fatia.chave} style={estilos.linhaDaBarra}>
          <View style={estilos.rotuloDaBarra}>
            <Text style={estilos.textoDoRotulo} numberOfLines={2}>
              {fatia.rotulo}
            </Text>
            <Text style={estilos.valorDaBarra}>
              {formatarPercentual(fatia.percentual)} · {fatia.total}
            </Text>
          </View>
          <View style={estilos.trilho}>
            <View
              style={[
                estilos.preenchimento,
                {
                  // Proporcional à maior fatia: com percentuais baixos, barras
                  // todas curtas não deixam comparar nada.
                  width: `${Math.max((fatia.percentual / maior) * 100, 1)}%`,
                  backgroundColor: corDaSerie(indice),
                },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------

const TAMANHO_PIZZA = 180;
const RAIO = TAMANHO_PIZZA / 2 - 4;

function arco(centro: number, raio: number, inicio: number, fim: number): string {
  const x1 = centro + raio * Math.cos(inicio);
  const y1 = centro + raio * Math.sin(inicio);
  const x2 = centro + raio * Math.cos(fim);
  const y2 = centro + raio * Math.sin(fim);
  const maior = fim - inicio > Math.PI ? 1 : 0;
  return `M ${centro} ${centro} L ${x1} ${y1} A ${raio} ${raio} 0 ${maior} 1 ${x2} ${y2} Z`;
}

/** Distribuição percentual. Legenda embaixo: rótulo dentro da fatia não cabe. */
export function GraficoDePizza({ fatias }: { fatias: Fatia[] }) {
  const setores = useMemo(() => {
    const total = fatias.reduce((soma, f) => soma + f.total, 0);
    if (total === 0) {
      return [];
    }

    let angulo = -Math.PI / 2;
    return fatias
      .filter((fatia) => fatia.total > 0)
      .map((fatia, indice) => {
        const fatiaEmRadianos = (fatia.total / total) * Math.PI * 2;
        const inicio = angulo;
        angulo += fatiaEmRadianos;
        return { fatia, indice, caminho: arco(TAMANHO_PIZZA / 2, RAIO, inicio, angulo) };
      });
  }, [fatias]);

  if (setores.length === 0) {
    return null;
  }

  // Uma fatia só: o arco de 360° degenera e some. Um círculo resolve.
  const unica = setores.length === 1;

  return (
    <View style={estilos.pizza}>
      <Svg width={TAMANHO_PIZZA} height={TAMANHO_PIZZA}>
        <G>
          {unica ? (
            <Circle
              cx={TAMANHO_PIZZA / 2}
              cy={TAMANHO_PIZZA / 2}
              r={RAIO}
              fill={corDaSerie(setores[0].indice)}
            />
          ) : (
            setores.map(({ fatia, indice, caminho }) => (
              <Path key={fatia.chave} d={caminho} fill={corDaSerie(indice)} />
            ))
          )}
        </G>
      </Svg>

      <View style={estilos.legenda}>
        {setores.map(({ fatia, indice }) => (
          <View key={fatia.chave} style={estilos.itemDaLegenda}>
            <View style={[estilos.marcador, { backgroundColor: corDaSerie(indice) }]} />
            <Text style={estilos.textoDaLegenda} numberOfLines={1}>
              {fatia.rotulo} — {formatarPercentual(fatia.percentual)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------

const ALTURA_EVOLUCAO = 120;

/** Evolução acumulada da coleta. Um ponto por dia, na ordem que a API devolve. */
export function GraficoDeEvolucao({
  pontos,
  largura,
}: {
  pontos: { dia: string; acumulado: number }[];
  largura: number;
}) {
  if (pontos.length < 2) {
    return (
      <Text style={estilos.vazio}>
        A evolução aparece a partir do segundo dia com resposta.
      </Text>
    );
  }

  const maior = Math.max(...pontos.map((p) => p.acumulado), 1);
  const passo = largura / (pontos.length - 1);

  const coordenadas = pontos
    .map((ponto, indice) => {
      const x = indice * passo;
      const y = ALTURA_EVOLUCAO - (ponto.acumulado / maior) * (ALTURA_EVOLUCAO - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const primeiro = pontos[0];
  const ultimo = pontos[pontos.length - 1];

  return (
    <View>
      <Svg width={largura} height={ALTURA_EVOLUCAO}>
        <Polyline
          points={coordenadas}
          fill="none"
          stroke={corDaSerie(0)}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
      <View style={estilos.eixoDaEvolucao}>
        <Text style={estilos.textoDoEixo}>{primeiro.dia}</Text>
        <Text style={estilos.textoDoEixo}>
          {ultimo.dia} · {ultimo.acumulado}
        </Text>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  barras: { gap: 12 },
  linhaDaBarra: { gap: 4 },
  rotuloDaBarra: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  textoDoRotulo: { flex: 1, fontSize: 13, color: cores.texto },
  valorDaBarra: { fontSize: 13, color: cores.suave, fontVariant: ['tabular-nums'] },
  trilho: { height: 8, borderRadius: 4, backgroundColor: cores.borda, overflow: 'hidden' },
  preenchimento: { height: 8, borderRadius: 4 },

  pizza: { alignItems: 'center', gap: 12 },
  legenda: { alignSelf: 'stretch', gap: 6 },
  itemDaLegenda: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  marcador: { width: 10, height: 10, borderRadius: 2 },
  textoDaLegenda: { flex: 1, fontSize: 13, color: cores.texto },

  eixoDaEvolucao: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  textoDoEixo: { fontSize: 12, color: cores.suave },
  vazio: { fontSize: 13, color: cores.suave, lineHeight: 20 },
});
