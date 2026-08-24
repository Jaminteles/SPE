import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { PerguntaComResultado, PontoDaEvolucao } from '../api/servico-resultados';

/** Séries com contraste suficiente entre vizinhas, claras e escuras. */
const CORES = [
  'var(--serie-1)',
  'var(--serie-2)',
  'var(--serie-3)',
  'var(--serie-4)',
  'var(--serie-5)',
  'var(--serie-6)',
];

const numero = new Intl.NumberFormat('pt-BR');

function corDaSerie(indice: number): string {
  return CORES[indice % CORES.length];
}

function Vazio({ texto }: { texto: string }) {
  return <p className="grafico-vazio">{texto}</p>;
}

interface PropsDePergunta {
  pergunta: PerguntaComResultado | null;
}

/**
 * Barras horizontais: rótulo de candidato é longo e barra deitada preserva o
 * texto legível sem girar a cabeça de quem lê.
 */
export function GraficoDeBarras({ pergunta }: PropsDePergunta) {
  if (!pergunta || pergunta.totalDeRespostas === 0) {
    return (
      <div className="cartao">
        <h2>Intenção por alternativa</h2>
        <Vazio texto="Sem resposta válida no recorte escolhido." />
      </div>
    );
  }

  const dados = [...pergunta.alternativas]
    .sort((a, b) => b.total - a.total)
    .map((alternativa) => ({
      nome: alternativa.texto,
      total: alternativa.total,
      percentual: alternativa.percentual,
    }));

  return (
    <div className="cartao grafico-largo">
      <h2>{pergunta.enunciado}</h2>
      <ResponsiveContainer width="100%" height={Math.max(220, dados.length * 46)}>
        <BarChart data={dados} layout="vertical" margin={{ left: 8, right: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--cor-borda)" horizontal={false} />
          <XAxis type="number" stroke="var(--cor-suave)" fontSize={12} />
          <YAxis
            type="category"
            dataKey="nome"
            width={160}
            stroke="var(--cor-suave)"
            fontSize={12}
          />
          <Tooltip
            formatter={(valor: number, chave: string) =>
              chave === 'total' ? [numero.format(valor), 'Respostas'] : [`${valor}%`, 'Percentual']
            }
            contentStyle={{
              background: 'var(--cor-superficie)',
              border: '1px solid var(--cor-borda)',
              borderRadius: 8,
              color: 'var(--cor-texto)',
            }}
          />
          <Bar dataKey="total" radius={[0, 4, 4, 0]}>
            {dados.map((_, indice) => (
              <Cell key={indice} fill={corDaSerie(indice)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="aviso">
        {numero.format(pergunta.totalDeRespostas)} respostas válidas nesta pergunta. O percentual é
        calculado sobre esse total.
      </p>
    </div>
  );
}

/** Pizza só faz sentido em poucas fatias que somam o todo — é o caso aqui. */
export function GraficoDePizza({ pergunta }: PropsDePergunta) {
  if (!pergunta || pergunta.totalDeRespostas === 0) {
    return (
      <div className="cartao">
        <h2>Distribuição percentual</h2>
        <Vazio texto="Sem resposta válida no recorte escolhido." />
      </div>
    );
  }

  const dados = pergunta.alternativas
    .filter((alternativa) => alternativa.total > 0)
    .map((alternativa) => ({ nome: alternativa.texto, valor: alternativa.percentual }));

  return (
    <div className="cartao">
      <h2>Distribuição percentual</h2>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={dados}
            dataKey="valor"
            nameKey="nome"
            innerRadius={54}
            outerRadius={92}
            paddingAngle={2}
          >
            {dados.map((_, indice) => (
              <Cell key={indice} fill={corDaSerie(indice)} />
            ))}
          </Pie>
          <Legend wrapperStyle={{ fontSize: 12, color: 'var(--cor-suave)' }} />
          <Tooltip
            formatter={(valor: number) => [`${valor}%`, 'Percentual']}
            contentStyle={{
              background: 'var(--cor-superficie)',
              border: '1px solid var(--cor-borda)',
              borderRadius: 8,
              color: 'var(--cor-texto)',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Evolução da coleta: barra diária não cabe, linha acumulada conta a história. */
export function GraficoDeEvolucao({ pontos }: { pontos: PontoDaEvolucao[] }) {
  if (pontos.length === 0) {
    return (
      <div className="cartao">
        <h2>Evolução da coleta</h2>
        <Vazio texto="Nenhuma resposta no período escolhido." />
      </div>
    );
  }

  const dados = pontos.map((ponto) => ({
    dia: new Date(`${ponto.dia}T12:00:00`).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
    }),
    doDia: ponto.respostasValidas,
    acumulado: ponto.acumulado,
  }));

  return (
    <div className="cartao">
      <h2>Evolução da coleta</h2>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={dados} margin={{ left: 4, right: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--cor-borda)" />
          <XAxis dataKey="dia" stroke="var(--cor-suave)" fontSize={12} />
          <YAxis stroke="var(--cor-suave)" fontSize={12} />
          <Tooltip
            formatter={(valor: number, chave: string) => [
              numero.format(valor),
              chave === 'doDia' ? 'No dia' : 'Acumulado',
            ]}
            contentStyle={{
              background: 'var(--cor-superficie)',
              border: '1px solid var(--cor-borda)',
              borderRadius: 8,
              color: 'var(--cor-texto)',
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="acumulado"
            name="Acumulado"
            stroke={corDaSerie(0)}
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="doDia"
            name="No dia"
            stroke={corDaSerie(1)}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
