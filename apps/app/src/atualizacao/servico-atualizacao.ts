import * as Updates from 'expo-updates';

import { chamar } from '../api/cliente';
import { ambiente } from '../config/ambiente';

export interface VersaoPublicada {
  versaoAtual: string;
  versaoMinima: string;
  urlDownload: string;
  urlArquivo: string | null;
  sha256: string | null;
  notas: string | null;
  /** Se esta instalacao aceita auto-cadastro. Decide se a tela oferece registro. */
  cadastroAberto: boolean;
}

export type EstadoDaVersao = 'ok' | 'aviso' | 'bloqueado' | 'indisponivel';

export interface Diagnostico {
  estado: EstadoDaVersao;
  instalada: string;
  publicada: VersaoPublicada | null;
}

/**
 * Compara duas versões no formato `maior.menor.correcao`.
 *
 * Retorna negativo se `a` for anterior a `b`. Parte faltante conta como zero,
 * então `1.2` e `1.2.0` são a mesma versão.
 */
export function compararVersoes(a: string, b: string): number {
  const partes = (versao: string) =>
    versao
      .trim()
      .split('.')
      .map((parte) => Number.parseInt(parte, 10))
      .map((numero) => (Number.isFinite(numero) ? numero : 0));

  const esquerda = partes(a);
  const direita = partes(b);
  const tamanho = Math.max(esquerda.length, direita.length);

  for (let indice = 0; indice < tamanho; indice += 1) {
    const diferenca = (esquerda[indice] ?? 0) - (direita[indice] ?? 0);
    if (diferenca !== 0) {
      return diferenca;
    }
  }
  return 0;
}

/**
 * Verificação de versão na abertura.
 *
 * O APK é distribuído direto, sem loja: esta verificação é o que substitui a
 * atualização automática que a loja faria. Ela **não** pode virar tela de erro
 * em rede ruim — sem resposta do servidor, o aplicativo abre normalmente e
 * tenta de novo na próxima abertura.
 */
export const servicoAtualizacao = {
  /**
   * Versão instalada. Com `runtimeVersion.policy = "appVersion"` no app.json,
   * o runtime do expo-updates é a própria versão do aplicativo.
   */
  versaoInstalada(): string {
    return Updates.runtimeVersion ?? ambiente.versaoDoAplicativo;
  },

  async verificar(): Promise<Diagnostico> {
    const instalada = this.versaoInstalada();

    let publicada: VersaoPublicada;
    try {
      publicada = await chamar<VersaoPublicada>('/aplicativo/versao');
    } catch {
      // Sem servidor não se decide nada: quem está em campo continua coletando.
      return { estado: 'indisponivel', instalada, publicada: null };
    }

    if (compararVersoes(instalada, publicada.versaoMinima) < 0) {
      return { estado: 'bloqueado', instalada, publicada };
    }
    if (compararVersoes(instalada, publicada.versaoAtual) < 0) {
      return { estado: 'aviso', instalada, publicada };
    }
    return { estado: 'ok', instalada, publicada };
  },

  /**
   * Atualização OTA do pacote JavaScript (expo-updates).
   *
   * Resolve correção de comportamento sem reinstalar APK, mas **não** substitui
   * a troca de versão nativa: mudança de dependência nativa continua exigindo
   * APK novo — por isso a verificação de versão acima existe junto.
   */
  async buscarAtualizacaoDeConteudo(): Promise<boolean> {
    if (!Updates.isEnabled || ambiente.emDesenvolvimento) {
      return false;
    }

    try {
      const resultado = await Updates.checkForUpdateAsync();
      if (!resultado.isAvailable) {
        return false;
      }

      await Updates.fetchUpdateAsync();
      return true;
    } catch {
      // Falha de OTA é irrelevante para quem está coletando: segue com o que tem.
      return false;
    }
  },

  /** Aplica a atualização já baixada, reiniciando o aplicativo. */
  async aplicarAtualizacaoDeConteudo(): Promise<void> {
    await Updates.reloadAsync();
  },
};
