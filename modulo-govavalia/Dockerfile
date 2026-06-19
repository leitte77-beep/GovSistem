FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY src/ ./src/
COPY web/ ./web/
COPY db/ ./db/
COPY scripts/ ./scripts/
EXPOSE 4000
CMD ["node", "src/index.js"]
