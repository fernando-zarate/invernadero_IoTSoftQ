FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY backend/nestjs/package*.json ./
RUN npm ci --no-audit --no-fund
COPY backend/nestjs/tsconfig*.json backend/nestjs/nest-cli.json ./
COPY backend/nestjs/src ./src
RUN npm run build

FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY backend/nestjs/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production NESTJS_PORT=3000
WORKDIR /app
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node backend/nestjs/package.json backend/nestjs/openapi.json ./
COPY --chown=node:node backend/nestjs/scripts/smoke-metrics.cjs ./scripts/smoke-metrics.cjs
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
