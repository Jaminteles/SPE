import { useState } from 'react';

import { FormatoDeExportacao } from '../api/servico-exportacao';

interface Props {
  aoExportar: (formato: FormatoDeExportacao) => Promise<void>;
}

const FORMATOS: { formato: FormatoDeExportacao; rotulo: string; descricao: string }[] = [
  { formato: 'csv', rotulo: 'CSV', descricao: 'tabela única, para reprocessar' },
  { formato: 'xlsx', rotulo: 'XLSX', descricao: 'planilha com uma aba por bloco' },
  { formato: 'pdf', rotulo: 'PDF', descricao: 'este painel, com gráficos e tabelas' },
];

/**
 * Exportação do recorte que está na tela. Um clique por formato, e o arquivo
 * sai com os mesmos filtros do painel — o total do arquivo é o total daqui.
 *
 * Toda exportação fica registrada em auditoria com usuário, data e hora.
 */
export function Exportacao({ aoExportar }: Props) {
  const [gerando, setGerando] = useState<FormatoDeExportacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const exportar = async (formato: FormatoDeExportacao) => {
    setGerando(formato);
    setErro(null);
    try {
      await aoExportar(formato);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível gerar o arquivo.');
    } finally {
      setGerando(null);
    }
  };

  return (
    <div className="cartao exportacao">
      <h2>Exportar</h2>
      <div className="acoes">
        {FORMATOS.map((item) => (
          <button
            key={item.formato}
            className="botao secundario"
            disabled={gerando !== null}
            onClick={() => void exportar(item.formato)}
            title={item.descricao}
          >
            {gerando === item.formato ? `Gerando ${item.rotulo}…` : item.rotulo}
          </button>
        ))}
      </div>

      {erro ? <p className="erro">{erro}</p> : null}

      <p className="aviso">
        O arquivo sai com o recorte atual dos filtros. Só agregados são exportados — nenhuma
        resposta individual. Toda exportação entra no log de auditoria.
      </p>
    </div>
  );
}
