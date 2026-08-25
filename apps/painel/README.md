# Painel

React + TypeScript + Vite. Publicado como Worker de assets estáticos na
Cloudflare (`wrangler.jsonc`), sem código rodando no servidor.

## Node

O `.nvmrc` deste diretório pede **Node 22**, e não o Node 20 do `.nvmrc` da raiz.
Não é divergência acidental: o wrangler 4 recusa rodar em Node 20, e o build da
Cloudflare acontece com `apps/painel` como raiz — é este arquivo que ele lê.

Vale só para publicar o painel. A API continua em Node 20 (`node:20-alpine`).

## Variáveis

`VITE_API_URL` é lida **no build**, tanto pelo painel quanto pela
`download.html`. Trocar a URL da API exige um deploy novo; não basta editar a
variável no painel da Cloudflare.

Sem ela, o build não falha — o painel sai apontando para `http://localhost:3000`
e só quebra quando alguém tenta entrar.
