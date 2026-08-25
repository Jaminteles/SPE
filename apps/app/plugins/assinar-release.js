const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Assinatura do APK de release.
 *
 * O `prebuild` gera um `build.gradle` que assina o release com a **chave de
 * debug** — o proprio arquivo avisa isso num comentario. APK assim nao serve
 * para distribuir: qualquer um consegue publicar uma atualizacao por cima.
 *
 * Este plugin troca essa configuracao por uma que le a chave de verdade. Os
 * valores vem de variavel de ambiente e sao interpolados pelo Gradle em tempo
 * de build, nunca escritos no arquivo: nem o `build.gradle` gerado no runner
 * chega a conter a senha.
 *
 * Sem `SPE_KEYSTORE_ARQUIVO` o plugin nao age e o build local segue com a chave
 * de debug, como antes. Se agir e nao encontrar os pontos que espera no
 * `build.gradle`, ele **quebra o build**: cair de volta na chave de debug em
 * silencio seria publicar um APK que ninguem consegue atualizar depois.
 */

const CONFIG_DE_ASSINATURA = `        release {
            storeFile file(System.getenv("SPE_KEYSTORE_ARQUIVO"))
            storePassword System.getenv("SPE_KEYSTORE_SENHA")
            keyAlias System.getenv("SPE_KEYSTORE_ALIAS")
            keyPassword System.getenv("SPE_KEYSTORE_SENHA_CHAVE")
        }
`;

const ANCORA_SIGNING_CONFIGS = `    signingConfigs {
`;

const ANCORA_RELEASE_COM_DEBUG = `            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;

function trocar(conteudo, procurado, substituto, oQueE) {
  if (!conteudo.includes(procurado)) {
    throw new Error(
      `assinar-release: nao encontrei ${oQueE} no build.gradle gerado. O template do ` +
        'Expo mudou — ajuste plugins/assinar-release.js antes de publicar, senao o APK ' +
        'sai assinado com a chave de debug.',
    );
  }
  return conteudo.replace(procurado, substituto);
}

module.exports = function assinarRelease(config) {
  if (!process.env.SPE_KEYSTORE_ARQUIVO) {
    return config;
  }

  // versionCode precisa subir a cada publicacao, senao o Android recusa
  // instalar por cima. Quem fornece o numero e o workflow.
  if (process.env.SPE_VERSION_CODE) {
    config.android = {
      ...config.android,
      versionCode: Number(process.env.SPE_VERSION_CODE),
    };
  }

  return withAppBuildGradle(config, (cfg) => {
    let conteudo = cfg.modResults.contents;

    conteudo = trocar(
      conteudo,
      ANCORA_SIGNING_CONFIGS,
      ANCORA_SIGNING_CONFIGS + CONFIG_DE_ASSINATURA,
      'o bloco signingConfigs',
    );

    conteudo = trocar(
      conteudo,
      ANCORA_RELEASE_COM_DEBUG,
      '            signingConfig signingConfigs.release',
      'o release apontando para a chave de debug',
    );

    cfg.modResults.contents = conteudo;
    return cfg;
  });
};
