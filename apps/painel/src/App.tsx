import { useCallback, useEffect, useState } from 'react';

import { UsuarioLogado, sessao } from './auth/sessao';
import { Login } from './paginas/Login';
import { Painel } from './paginas/Painel';

export function App() {
  const [usuario, setUsuario] = useState<UsuarioLogado | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;

    sessao
      .retomar()
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

  return <Painel usuario={usuario} aoSair={sair} aoPerderSessao={perderSessao} />;
}
