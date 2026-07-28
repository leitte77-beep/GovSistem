# Backend do ChatGov (Node + Baileys).
#
# Reconstruido em 2026-07-28 a partir da imagem em execucao (`modulo-chatgov-backend`),
# porque o Dockerfile original havia sido perdido do disco junto com o src.
# Base, versao do Node, workdir e CMD conferem com a imagem que roda em producao.
FROM node:20-alpine

WORKDIR /app

# A conversao de audio usa o binario do pacote `ffmpeg-static`, nao o do sistema.
# `bcrypt` compila via node-gyp quando nao ha prebuild para a plataforma; as
# ferramentas ficam so nesta camada e saem no mesmo RUN.
COPY package.json package-lock.json ./
RUN apk add --no-cache --virtual .build python3 make g++ \
    && npm ci --omit=dev \
    && apk del .build

COPY src ./src

RUN mkdir -p /app/uploads

EXPOSE 3050

CMD ["node", "src/index.js"]
