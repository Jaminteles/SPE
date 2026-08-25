const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins');

/**
 * A partir do Android 7 (API 24), aplicativo nao confia em certificado instalado
 * pelo usuario: so o navegador confia. Em homologacao a API roda atras de um
 * certificado autoassinado no IP da rede local, entao sem isto o aplicativo
 * falha no TLS enquanto o navegador do mesmo aparelho abre normalmente.
 *
 * O plugin so age quando SPE_ACEITAR_CA_LOCAL esta definida — variavel que o
 * perfil `homologacao` do eas.json declara e o perfil `producao` nao. Em
 * producao o APK continua aceitando apenas as CAs do sistema.
 *
 * `cleartextTrafficPermitted="false"` e proposital: afrouxamos a origem do
 * certificado, nunca a exigencia de TLS. Credencial de operador nao trafega em
 * texto claro em ambiente nenhum.
 */

const ARQUIVO = 'network_security_config.xml';

const CONTEUDO = `<?xml version="1.0" encoding="utf-8"?>
<!-- Gerado por plugins/confiar-certificado-do-usuario.js — nao editar a mao. -->
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
      <certificates src="user" />
    </trust-anchors>
  </base-config>
</network-security-config>
`;

module.exports = function confiarCertificadoDoUsuario(config) {
  if (!process.env.SPE_ACEITAR_CA_LOCAL) {
    return config;
  }

  const comArquivo = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const destino = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(destino, { recursive: true });
      fs.writeFileSync(path.join(destino, ARQUIVO), CONTEUDO);
      return cfg;
    },
  ]);

  return withAndroidManifest(comArquivo, (cfg) => {
    const aplicacao = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    aplicacao.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return cfg;
  });
};
