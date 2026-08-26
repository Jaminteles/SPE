/**
 * Leitura do link de coleta.
 *
 * O link que a pesquisa gera é `<painel>/r.html?t=<token>`, e a página que ele
 * abre oferece `spe://responder?t=<token>` para cair aqui dentro. As duas
 * formas trazem o token no mesmo parâmetro, então uma função só resolve as
 * duas — e ainda aceita o token no fim do caminho, que é o formato antigo do
 * link e pode estar impresso em algum QR Code já distribuído.
 *
 * Feito com regex e não com `URL`: o Hermes, motor JS do Android, não traz o
 * parser de URL completo, e `spe://` não é esquema que ele saiba dissecar.
 */

/** 22 caracteres base64url — o mesmo formato que a API gera e valida. */
const TOKEN = /^[A-Za-z0-9_-]{22}$/;

export function tokenDoLink(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  // O espaço em branco encerra a captura porque o texto colado quase nunca é só
  // o link: chega como "Responda a pesquisa: <link> obrigado". Sem isso, o que
  // vem depois do link entraria no token e derrubaria a validação.
  const parametro = /[?&]t=([^&#\s]+)/.exec(url);
  const candidato = parametro
    ? decodeURIComponent(parametro[1])
    : (/\/r\/([^/?#\s]+)/.exec(url)?.[1] ?? '');

  return TOKEN.test(candidato) ? candidato : null;
}
