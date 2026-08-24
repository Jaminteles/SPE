import { FormEvent, useState } from 'react';

import { ErroApi, ErroDeRede } from '../api/cliente';
import { UsuarioLogado, sessao } from '../auth/sessao';

interface Props {
  aoEntrar: (usuario: UsuarioLogado) => void;
}

const TAMANHO_MINIMO_SENHA = 12;

export function Login({ aoEntrar }: Props) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const podeEnviar = email.includes('@') && senha.length >= TAMANHO_MINIMO_SENHA && !enviando;

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!podeEnviar) {
      return;
    }

    setEnviando(true);
    setErro(null);
    try {
      aoEntrar(await sessao.entrar(email, senha));
    } catch (falha) {
      if (falha instanceof ErroDeRede) {
        setErro(falha.message);
      } else if (falha instanceof ErroApi && falha.status === 429) {
        setErro('Muitas tentativas. Espere um minuto e tente de novo.');
      } else {
        // Mensagem única: o painel não diz se o problema foi o e-mail ou a senha.
        setErro('E-mail ou senha inválidos.');
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login">
      <form className="cartao" onSubmit={enviar}>
        <h1>Painel de Resultados</h1>
        <p className="subtitulo">Sistema de Pesquisa Eleitoral — Bahia</p>

        <div className="campo">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
            autoComplete="username"
            disabled={enviando}
          />
        </div>

        <div className="campo">
          <label htmlFor="senha">Senha</label>
          <input
            id="senha"
            type="password"
            value={senha}
            onChange={(evento) => setSenha(evento.target.value)}
            autoComplete="current-password"
            disabled={enviando}
          />
        </div>

        {erro ? <p className="erro">{erro}</p> : null}

        <button className="botao" type="submit" disabled={!podeEnviar}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>

        <p className="aviso">
          Acesso restrito a Administrador e Analista. O respondente não tem conta e não é
          identificado em nenhum momento.
        </p>
      </form>
    </div>
  );
}
