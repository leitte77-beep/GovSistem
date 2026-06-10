FROM node:20-alpine
WORKDIR /app
# git: dependência transitiva (libsignal via github) | python3/make/g++: build de bcrypt
RUN apk add --no-cache git python3 make g++
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY src/ ./src/
EXPOSE 3000
CMD ["node", "src/index.js"]
