# API do CSVSIST — Express + SQLite em arquivo.
#
# O banco é um arquivo, então a imagem só é útil onde há disco persistente
# montado em /dados (Render disk, Railway volume, Fly volume, ou -v numa VPS).
# Sem isso a base recomeça vazia a cada deploy.
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

# As dependências entram antes do código: mudar um arquivo de src não refaz o
# npm ci. O package.json do web vem junto porque a raiz declara os workspaces,
# mas as dependências dele não são instaladas — quem serve a interface é a Vercel.
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace @csvsist/server --include-workspace-root

COPY server/ server/

# O banco fica fora da imagem: a imagem é descartável, o dado não.
ENV DB_PATH=/dados/csvsist.db
VOLUME /dados
EXPOSE 3333

# init-db é idempotente: cria schema, administrador e plano de contas na
# primeira subida e não faz nada nas seguintes. Sem ele, o banco sobe sem
# nenhum usuário e ninguém consegue entrar.
CMD ["sh", "-c", "node server/src/scripts/init-db.js && node server/src/index.js"]
