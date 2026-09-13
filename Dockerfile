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
# A planilha viaja junto para que SEMEAR_DEMO consiga remontar a base sozinho
# num host sem disco. São 900 KB.
COPY docs/ docs/

# O banco fica fora da imagem: a imagem é descartável, o dado não.
ENV DB_PATH=/dados/csvsist.db
VOLUME /dados
EXPOSE 3333

# Prepara o banco (administrador e plano de contas, sempre; base de demonstração
# só quando SEMEAR_DEMO=true e o banco está vazio) e então serve.
CMD ["node", "server/src/scripts/subir.js"]
