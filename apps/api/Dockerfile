# ---- base ----------------------------------------------------------------
FROM node:20-alpine AS base
WORKDIR /app
# Chromium do sistema: a exportacao em PDF renderiza o painel no Puppeteer, e o
# Chromium que ele baixa por padrao e compilado para glibc — nao roda em Alpine.
RUN apk add --no-cache openssl chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PUPPETEER_SKIP_DOWNLOAD=true     PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# ---- dependencias --------------------------------------------------------
FROM base AS deps
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# ---- desenvolvimento -----------------------------------------------------
FROM deps AS development
COPY . .
RUN npx prisma generate
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

# ---- build ---------------------------------------------------------------
FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build && npm prune --omit=dev

# ---- producao / homologacao ---------------------------------------------
FROM base AS production
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
