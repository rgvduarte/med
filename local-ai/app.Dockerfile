# Compila a aplicação (Vite + React) e serve o dist/ com nginx.
# Construída por docker-compose.yml (contexto = raiz do repositório).
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY public ./public
COPY src ./src
# Predefinições lidas por src/store/settings.ts (import.meta.env): esta cópia arranca já em modo local.
ARG VITE_DEFAULT_PROVIDER=openai-compatible
ARG VITE_LOCAL_BASE_URL=http://localhost:11434/v1
ARG VITE_LOCAL_MODEL=medgemma
ENV VITE_DEFAULT_PROVIDER=$VITE_DEFAULT_PROVIDER \
    VITE_LOCAL_BASE_URL=$VITE_LOCAL_BASE_URL \
    VITE_LOCAL_MODEL=$VITE_LOCAL_MODEL
RUN npm run build

FROM nginx:1.30-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
