# Imagem de produção: build isolado, execução sem ferramenta de build.
FROM node:22-alpine AS dependencias
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS construcao
WORKDIR /app
COPY --from=dependencias /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS producao
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=construcao --chown=app:app /app/.next ./.next
COPY --from=construcao --chown=app:app /app/public ./public
COPY --from=construcao --chown=app:app /app/node_modules ./node_modules
COPY --from=construcao --chown=app:app /app/package.json ./package.json
COPY --from=construcao --chown=app:app /app/prisma ./prisma
COPY --from=construcao --chown=app:app /app/src/gerado ./src/gerado
USER app
EXPOSE 3000
CMD ["npm", "run", "start"]
