# ---- base ----------------------------------------------------------------
# Sem Chromium: a exportacao em PDF vem desligada (EXPORTACAO_PDF_HABILITADO) e
# e o unico recurso que exigia navegador na imagem. Sem ele, a imagem de
# producao cabe em hospedagem pequena. Ver o estagio `production-pdf`.
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl ca-certificates
ENV PUPPETEER_SKIP_DOWNLOAD=true

# ---- dependencias --------------------------------------------------------
FROM base AS deps
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# ---- desenvolvimento -----------------------------------------------------
# So aqui entra o Chromium do sistema: o Chromium que o Puppeteer baixa por
# padrao e compilado para glibc e nao roda em Alpine.
FROM deps AS development
RUN apk add --no-cache chromium nss freetype harfbuzz ttf-freefont
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
COPY . .
RUN npx prisma generate
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

# ---- tarefas -------------------------------------------------------------
# Estagio para tarefas pontuais de operacao: seed dos municipios, criacao do
# Administrador inicial, populacao da base de carga. Todos sao scripts ts-node,
# e o estagio de producao roda `npm prune --omit=dev` — o ts-node nao sobrevive
# la. Este estagio guarda as devDeps e nao serve requisicao: sobe, roda o
# comando e sai.
FROM deps AS tarefas
COPY . .
RUN npx prisma generate
CMD ["node", "--version"]

# ---- build ---------------------------------------------------------------
FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build && npm prune --omit=dev

# ---- runtime -------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
USER node
EXPOSE 3000
# `start:prod` aplica as migracoes pendentes antes de subir. E o que permite
# apontar para um Postgres novo (Neon, por exemplo) sem passo manual.
CMD ["npm", "run", "start:prod"]

# ---- producao com PDF ----------------------------------------------------
# Alvo opcional, para instancia com memoria sobrando: adiciona o Chromium e o
# Puppeteer (que e devDependency e some no prune). Suba com
# EXPORTACAO_PDF_HABILITADO=true, senao o PDF continua recusando.
FROM runtime AS production-pdf
USER root
RUN apk add --no-cache chromium nss freetype harfbuzz ttf-freefont && npm install --no-save puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
USER node

# ---- producao / homologacao (padrao) -------------------------------------
# Precisa ser o ULTIMO estagio: sem `--target`, o Docker constroi o ultimo, e
# varias hospedagens (Render entre elas) nao deixam escolher o alvo. Se o
# production-pdf ficasse por ultimo, todo deploy carregaria o Chromium junto.
FROM runtime AS production
