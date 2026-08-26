import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { Plugin, defineConfig, loadEnv } from 'vite';

/** Pacote Android do aplicativo de coleta — o mesmo do `app.json`. */
const PACOTE_DO_APLICATIVO = 'br.com.pesquisaeleitoral.coleta';

/** 32 pares hexadecimais separados por dois-pontos, no formato que o Android publica. */
const IMPRESSAO_DIGITAL = /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/;

/**
 * `/.well-known/assetlinks.json`, o arquivo que faz o link de coleta abrir o
 * aplicativo em vez do navegador.
 *
 * O Android baixa este arquivo na instalação e só liga o App Link se a
 * impressão digital daqui bater com a que assinou o APK. Por isso ela é
 * variável de build e não valor versionado: quem publica o painel é quem sabe
 * com qual chave o APK foi assinado, e trocar de chave sem trocar este arquivo
 * derruba a verificação silenciosamente.
 *
 * Sem `SPE_APP_FINGERPRINT` o arquivo simplesmente não é gerado. O link continua
 * funcionando: abre a página `r.html`, que oferece o botão `spe://`. Perde-se o
 * atalho, não o caminho.
 *
 * Com a variável mal formatada o build **falha**. Um arquivo publicado com
 * impressão digital errada não dá erro em lugar nenhum — o Android só ignora o
 * App Link, e a falha apareceria como "o botão não faz nada" no campo, que é
 * caro de diagnosticar.
 */
function assetlinks(fingerprint: string | undefined): Plugin {
  return {
    name: 'spe-assetlinks',
    apply: 'build',
    generateBundle(_opcoes, _pacote) {
      if (!fingerprint) {
        // O `emptyOutDir` do Vite não apaga nada que comece com ponto, então um
        // assetlinks.json de um build anterior sobreviveria aqui — e ficaria
        // publicado apontando para uma chave que talvez nem seja mais a atual.
        const alvo = resolve(__dirname, 'dist/.well-known/assetlinks.json');
        rmSync(alvo, { force: true });

        this.warn(
          existsSync(alvo)
            ? `Sobrou um ${alvo} de um build anterior e não foi possível apagá-lo. Ele ` +
                'declara uma impressão digital que talvez não seja mais a da chave atual: ' +
                'remova o arquivo à mão antes de publicar.'
            : 'SPE_APP_FINGERPRINT não definida: o painel sai sem assetlinks.json e o link ' +
                'de coleta vai abrir no navegador em vez de no aplicativo.',
        );
        return;
      }

      const normalizada = fingerprint.trim().toUpperCase();
      if (!IMPRESSAO_DIGITAL.test(normalizada)) {
        this.error(
          'SPE_APP_FINGERPRINT fora do formato esperado (32 pares hexadecimais separados ' +
            `por ":"). Recebido: "${fingerprint}".`,
        );
        return;
      }

      this.emitFile({
        type: 'asset',
        fileName: '.well-known/assetlinks.json',
        source: `${JSON.stringify(
          [
            {
              relation: ['delegate_permission/common.handle_all_urls'],
              target: {
                namespace: 'android_app',
                package_name: PACOTE_DO_APLICATIVO,
                sha256_cert_fingerprints: [normalizada],
              },
            },
          ],
          null,
          2,
        )}\n`,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Prefixo vazio: `SPE_APP_FINGERPRINT` não vai para o código do cliente e por
  // isso não leva o `VITE_`, mas ainda precisa ser lida de um `.env` local.
  const env = loadEnv(mode, __dirname, '');

  return {
    plugins: [react(), assetlinks(env.SPE_APP_FINGERPRINT)],
    server: {
      host: true,
      port: 5173,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        // A página de download passa pelo pipeline de HTML do Vite (e não fica em
        // public/) só para o %VITE_API_URL% ser substituído no build. Em public/
        // o arquivo seria copiado literalmente, com o placeholder intacto.
        //
        // `r.html` é a ponta do link de coleta. Não fala com a API — o código da
        // pesquisa vem na própria URL —, mas entra aqui junto para as páginas do
        // painel saírem todas do mesmo build. `confirmar.html` é onde cai o
        // link do e-mail de cadastro: fala com a API, então precisa do mesmo
        // `%VITE_API_URL%` que a de download.
        input: {
          index: resolve(__dirname, 'index.html'),
          download: resolve(__dirname, 'download.html'),
          r: resolve(__dirname, 'r.html'),
          confirmar: resolve(__dirname, 'confirmar.html'),
        },
      },
    },
  };
});
