import { useCallback, useEffect, useState } from 'react';

import { UsuarioLogado, sessao } from './auth/sessao';
import { ModoImpressao, lerModoImpressao } from './impressao/modo-impressao';
import { Login } from './paginas/Login';
import { Painel } from './paginas/Painel';

/**
 * Modo de impressão: a API abre esta mesma página no Puppeteer para gerar o
 * PDF. Lido uma vez, fora do React, porque decide qual sessão vale antes do
 * primeiro render.
 */
const impressao: ModoImpressao | null = lerModoImpressao(window.location.search);
if (impressao) {
  sessao.adotarToken(impressao.token);
}

export function App() {
  const [usuario, setUsuario] = useState<UsuarioLogado | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;

    // Na impressão não há refresh token: a identidade é a de quem pediu a
    // exportação, que chegou injetada no contexto da página.
    (impressao ? sessao.usuarioAtual().catch(() => null) : sessao.retomar())
      .then((retomado) => {
        if (ativo) {
          setUsuario(retomado);
        }
      })
      .finally(() => {
        if (ativo) {
          setCarregando(false);
        }
      });

    return () => {
      ativo = false;
    };
  }, []);

  const sair = useCallback(async () => {
    await sessao.sair();
    setUsuario(null);
  }, []);

  /** A sessão morreu no servidor: volta para o login sem tentar mais nada. */
  const perderSessao = useCallback(() => setUsuario(null), []);

  if (carregando) {
    return (
      <div className="pagina">
        <p className="aviso">Carregando…</p>
      </div>
    );
  }

  if (!usuario) {
    return <Login aoEntrar={setUsuario} />;
  }

  return (
    <Painel
      usuario={usuario}
      aoSair={sair}
      aoPerderSessao={perderSessao}
      impressao={
        impressao ? { formularioId: impressao.formularioId, filtros: impressao.filtros } : undefined
      }
    />
  );
}
