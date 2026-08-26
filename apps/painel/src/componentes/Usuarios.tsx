import { useCallback, useEffect, useState } from 'react';

import { ErroApi } from '../api/cliente';
import { Usuario, servicoUsuarios } from '../api/servico-usuarios';
import { Perfil, SessaoEncerrada, UsuarioLogado } from '../auth/sessao';

interface Props {
  usuario: UsuarioLogado;
  aoPerderSessao: () => void;
}

const PERFIS: { codigo: Perfil; nome: string; explica: string }[] = [
  {
    codigo: 'ADMINISTRADOR',
    nome: 'Administrador',
    explica: 'Monta pesquisa, gerencia contas e enxerga tudo.',
  },
  {
    codigo: 'ANALISTA',
    nome: 'Analista',
    explica: 'Só lê resultado e exporta. Enxerga todas as pesquisas.',
  },
  {
    codigo: 'PESQUISADOR',
    nome: 'Pesquisador',
    explica: 'Monta e acompanha as próprias pesquisas. Não enxerga a dos outros.',
  },
];

const TAMANHO_MINIMO_SENHA = 12;

/** As mesmas regras da API. Conferir aqui poupa uma ida à rede para nada. */
function problemasDaSenha(senha: string): string[] {
  const problemas: string[] = [];
  if (senha.length < TAMANHO_MINIMO_SENHA) {
    problemas.push(`ao menos ${TAMANHO_MINIMO_SENHA} caracteres`);
  }
  if (!/[a-zà-ÿ]/.test(senha)) problemas.push('uma letra minúscula');
  if (!/[A-ZÀ-Ý]/.test(senha)) problemas.push('uma letra maiúscula');
  if (!/\d/.test(senha)) problemas.push('um número');
  return problemas;
}

const doisDigitos = (valor: number) => String(valor).padStart(2, '0');

function dataCurta(iso: string | null): string {
  if (!iso) return '—';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';
  return [doisDigitos(data.getDate()), doisDigitos(data.getMonth() + 1), data.getFullYear()].join(
    '/',
  );
}

/**
 * Administração de contas.
 *
 * Existe porque a API sempre teve estas rotas e nenhuma tela as alcançava:
 * criar um login exigia chamar a API à mão. Só o Administrador chega aqui.
 *
 * Nenhuma senha é exibida depois de criada — nem para quem a definiu. Redefinir
 * gera uma nova, e é a única forma de recuperar acesso de alguém.
 */
export function Usuarios({ usuario, aoPerderSessao }: Props) {
  const [lista, setLista] = useState<Usuario[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [novoNome, setNovoNome] = useState('');
  const [novoEmail, setNovoEmail] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [novoPerfil, setNovoPerfil] = useState<Perfil>('PESQUISADOR');

  const executar = useCallback(
    async (acao: () => Promise<void>) => {
      setOcupado(true);
      setErro(null);
      setAviso(null);
      try {
        await acao();
      } catch (falha) {
        if (falha instanceof SessaoEncerrada) {
          aoPerderSessao();
          return;
        }
        setErro(
          falha instanceof ErroApi ? falha.message : 'Não foi possível concluir a operação.',
        );
      } finally {
        setOcupado(false);
      }
    },
    [aoPerderSessao],
  );

  const carregar = useCallback(async () => {
    await executar(async () => {
      const { itens } = await servicoUsuarios.listar();
      setLista(itens);
    });
  }, [executar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const faltasDaSenha = problemasDaSenha(novaSenha);
  const podeCriar =
    novoNome.trim().length >= 3 &&
    novoEmail.includes('@') &&
    faltasDaSenha.length === 0 &&
    !ocupado;

  async function criar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!podeCriar) return;

    await executar(async () => {
      const criado = await servicoUsuarios.criar({
        nome: novoNome,
        email: novoEmail,
        senha: novaSenha,
        perfil: novoPerfil,
      });
      setNovoNome('');
      setNovoEmail('');
      setNovaSenha('');
      setAviso(
        `Conta de ${criado.nome} criada. Passe a senha por um caminho seguro — ela não ` +
          'aparece mais nesta tela.',
      );
      const { itens } = await servicoUsuarios.listar();
      setLista(itens);
    });
  }

  async function alterar(acao: () => Promise<unknown>, mensagem: string) {
    await executar(async () => {
      await acao();
      setAviso(mensagem);
      const { itens } = await servicoUsuarios.listar();
      setLista(itens);
    });
  }

  function redefinir(alvo: Usuario) {
    const senha = window.prompt(
      `Nova senha para ${alvo.nome} (mínimo ${TAMANHO_MINIMO_SENHA} caracteres, com maiúscula, ` +
        'minúscula e número):',
    );
    if (senha === null) return;

    const faltas = problemasDaSenha(senha);
    if (faltas.length > 0) {
      setErro(`A senha precisa de ${faltas.join(', ')}.`);
      return;
    }

    void alterar(
      () => servicoUsuarios.redefinirSenha(alvo.id, senha),
      `Senha de ${alvo.nome} redefinida. As sessões abertas continuam válidas até expirarem.`,
    );
  }

  return (
    <div className="cartao">
      <h2>Usuários</h2>

      <form className="filtros" onSubmit={criar}>
        <div className="campo">
          <label htmlFor="usuario-nome">Nome</label>
          <input
            id="usuario-nome"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            disabled={ocupado}
            placeholder="Nome e sobrenome"
          />
        </div>

        <div className="campo">
          <label htmlFor="usuario-email">E-mail</label>
          <input
            id="usuario-email"
            type="email"
            value={novoEmail}
            onChange={(e) => setNovoEmail(e.target.value)}
            disabled={ocupado}
            placeholder="pessoa@exemplo.br"
          />
        </div>

        <div className="campo">
          <label htmlFor="usuario-senha">Senha provisória</label>
          <input
            id="usuario-senha"
            type="password"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            disabled={ocupado}
            autoComplete="new-password"
          />
        </div>

        <div className="campo">
          <label htmlFor="usuario-perfil">Perfil</label>
          <select
            id="usuario-perfil"
            value={novoPerfil}
            onChange={(e) => setNovoPerfil(e.target.value as Perfil)}
            disabled={ocupado}
          >
            {PERFIS.map((perfil) => (
              <option key={perfil.codigo} value={perfil.codigo}>
                {perfil.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <button className="botao" type="submit" disabled={!podeCriar}>
            Criar conta
          </button>
        </div>
      </form>

      <p className="aviso">{PERFIS.find((p) => p.codigo === novoPerfil)?.explica}</p>

      {novaSenha.length > 0 && faltasDaSenha.length > 0 ? (
        <p className="aviso">A senha precisa de {faltasDaSenha.join(', ')}.</p>
      ) : null}

      {erro ? <p className="erro">{erro}</p> : null}
      {aviso ? <p className="aviso">{aviso}</p> : null}

      {lista === null ? (
        <p className="aviso">Carregando…</p>
      ) : (
        <table className="tabela">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Perfil</th>
              <th>Último acesso</th>
              <th>Situação</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((linha) => {
              // A própria conta não se desativa nem troca o próprio perfil — a
              // API recusa, e oferecer o botão só produziria erro.
              const ehVoce = linha.id === usuario.id;

              return (
                <tr key={linha.id}>
                  <td>
                    {linha.nome}
                    {ehVoce ? ' (você)' : ''}
                  </td>
                  <td>{linha.email}</td>
                  <td>
                    <select
                      value={linha.perfil}
                      disabled={ocupado || ehVoce}
                      onChange={(e) =>
                        void alterar(
                          () => servicoUsuarios.alterarPerfil(linha.id, e.target.value as Perfil),
                          `Perfil de ${linha.nome} alterado.`,
                        )
                      }
                    >
                      {PERFIS.map((perfil) => (
                        <option key={perfil.codigo} value={perfil.codigo}>
                          {perfil.nome}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{dataCurta(linha.ultimoLoginEm)}</td>
                  <td>{linha.ativo ? 'Ativa' : 'Desativada'}</td>
                  <td>
                    <button
                      className="botao secundario"
                      disabled={ocupado || ehVoce}
                      onClick={() =>
                        void alterar(
                          () => servicoUsuarios.definirAtivo(linha.id, !linha.ativo),
                          linha.ativo
                            ? `Conta de ${linha.nome} desativada. As sessões abertas dela foram encerradas.`
                            : `Conta de ${linha.nome} reativada.`,
                        )
                      }
                    >
                      {linha.ativo ? 'Desativar' : 'Reativar'}
                    </button>{' '}
                    <button
                      className="botao secundario"
                      disabled={ocupado}
                      onClick={() => redefinir(linha)}
                    >
                      Redefinir senha
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="aviso">
        Não compartilhe conta: a auditoria só serve se o nome no log for o de quem agiu.
      </p>
    </div>
  );
}
