FROM node:22-alpine AS builder
WORKDIR /app
COPY backend/nestjs/package*.json ./
RUN npm ci
COPY backend/nestjs/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/openapi.json ./openapi.json
USER node
EXPOSE 3000
CMD ["node", "dist/src/main.js"]
