FROM node:20-alpine AS base
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=http://localhost:9101/api/v1
ENV NEXT_PUBLIC_SAAS_API_URL=http://localhost:9009/api/v1
ENV NEXT_PUBLIC_SAAS_FRONTEND_URL=http://localhost:9002
EXPOSE 3000
CMD ["npm", "run", "dev"]
