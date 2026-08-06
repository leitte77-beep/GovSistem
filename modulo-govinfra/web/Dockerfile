FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_GOVINFRA_API_URL=http://127.0.0.1:43101
ARG VITE_ENABLE_SAAS_LOGIN=false
ENV VITE_GOVINFRA_API_URL=$VITE_GOVINFRA_API_URL
ENV VITE_ENABLE_SAAS_LOGIN=$VITE_ENABLE_SAAS_LOGIN
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
