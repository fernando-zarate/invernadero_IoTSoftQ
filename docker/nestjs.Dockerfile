# syntax=docker/dockerfile:1
#
# Production image for the NestJS IoT backend (`backend/nestjs`).
# Build from the repository root so paths match the monorepo layout:
#
#   docker build -f docker/nestjs.Dockerfile -t invernadero-backend:1.0 .

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /app

FROM base AS deps
COPY backend/nestjs/package.json backend/nestjs/package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY backend/nestjs/ ./
RUN npm run build

FROM base AS prod-deps
COPY backend/nestjs/package.json backend/nestjs/package-lock.json ./
RUN npm ci --omit=dev

FROM base AS runner
ENV NODE_ENV=production
# Resolve bare `src/...` CommonJS imports emitted by TypeScript against `/app/dist/src`
ENV NODE_PATH=/app/dist

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs nestjs

COPY --from=prod-deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/openapi.json ./openapi.json
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json

USER nestjs

EXPOSE 3000
ENV NESTJS_PORT=3000

CMD ["node", "dist/src/main.js"]
