/**
 * Configuracao do Expo em cima do app.json.
 *
 * O app.json continua sendo a fonte de tudo que e fixo — nome, versao, plugins.
 * Aqui entra so o que depende de onde o painel esta hospedado, que muda por
 * ambiente e por isso nao pode ficar escrito no arquivo versionado.
 *
 * Sem `SPE_PAINEL_URL` nada e adicionado e o build local segue igual ao de
 * antes. O link de coleta continua funcionando pelo esquema `spe://`, que a
 * pagina `r.html` do painel oferece como botao.
 */

/**
 * App Link do link de coleta.
 *
 * Com `autoVerify`, o Android confere `https://<painel>/.well-known/assetlinks.json`
 * na instalacao: se a impressao digital declarada la bater com a que assinou o
 * APK, tocar no link abre o aplicativo direto, sem passar pelo navegador e sem
 * a caixa de "abrir com". Se a verificacao falhar, o Android simplesmente
 * ignora o filtro e o link abre no navegador — que e o comportamento de hoje,
 * entao uma verificacao malsucedida nao quebra nada.
 *
 * Dois caminhos porque a Cloudflare responde 307 de `/r.html` para `/r`: o
 * filtro precisa cobrir os dois para o app pegar o link antes do redirecionamento
 * e depois dele.
 */
function filtrosDoLinkDeColeta(painelUrl) {
  const host = painelUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!host) {
    throw new Error(`SPE_PAINEL_URL nao tem host reconhecivel: "${painelUrl}".`);
  }

  return [
    {
      action: 'VIEW',
      autoVerify: true,
      category: ['BROWSABLE', 'DEFAULT'],
      data: [
        { scheme: 'https', host, pathPrefix: '/r.html' },
        { scheme: 'https', host, path: '/r' },
      ],
    },
  ];
}

module.exports = ({ config }) => {
  const painelUrl = process.env.SPE_PAINEL_URL;
  if (!painelUrl) {
    return config;
  }

  return {
    ...config,
    android: {
      ...config.android,
      intentFilters: [
        ...(config.android?.intentFilters ?? []),
        ...filtrosDoLinkDeColeta(painelUrl),
      ],
    },
  };
};
