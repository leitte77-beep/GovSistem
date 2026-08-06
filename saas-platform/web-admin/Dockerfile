FROM node:20-alpine AS base
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=http://localhost:9009/api/v1
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "-H", "0.0.0.0"]
