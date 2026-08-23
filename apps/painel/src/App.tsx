import { useEffect, useState } from 'react';

import { obter } from './api/cliente';

type Situacao = 'verificando' | 'disponivel' | 'indisponivel';

interface RespostaHealth {
  status: string;
  banco: string;
}

/**
 * Casca do painel (Sprint 0).
 * As telas de resultado entram nas sprints seguintes, consumindo agregados.
 */
export function App() {
  const [situacao, setSituacao] = useState<Situacao>('verificando');

  useEffect(() => {
    let ativo = true;

    obter<RespostaHealth>('/health')
      .then((resposta) => {
        if (ativo) {
          setSituacao(resposta.status === 'ok' ? 'disponivel' : 'indisponivel');
        }
      })
      .catch(() => {
        if (ativo) {
          setSituacao('indisponivel');
        }
      });

    return () => {
      ativo = false;
    };
  }, []);

  const texto: Record<Situacao, string> = {
    verificando: 'Verificando...',
    disponivel: 'API e banco de dados disponíveis',
    indisponivel: 'API indisponível',
  };

  return (
    <div className="pagina">
      <header className="cabecalho">
        <h1>Painel de Resultados</h1>
        <p>Sistema de Pesquisa Eleitoral — Bahia</p>
      </header>

      <section className="cartao">
        <h2>Ambiente</h2>
        <p>{texto[situacao]}</p>
      </section>
    </div>
  );
}
