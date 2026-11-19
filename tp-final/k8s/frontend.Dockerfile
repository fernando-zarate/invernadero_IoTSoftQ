FROM node:22-alpine AS builder
WORKDIR /app
COPY frontend/dashboard/package*.json ./
RUN npm ci --legacy-peer-deps
COPY frontend/dashboard/ ./
ARG APP_VERSION=1.0.0
ARG NEXT_PUBLIC_API_URL=http://api.terrasense.local
ARG VCS_REF=unknown
ENV APP_VERSION=${APP_VERSION} NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} NEXT_TELEMETRY_DISABLED=1
RUN case "$APP_VERSION" in 1.0.0|1.1.0) ;; *) exit 1;; esac \
    && mkdir -p public && printf '%s\n' "$APP_VERSION" > public/version.txt \
    && npm run build

FROM node:22-alpine
ARG APP_VERSION=1.0.0
ARG VCS_REF=unknown
LABEL org.opencontainers.image.version=${APP_VERSION} org.opencontainers.image.revision=${VCS_REF}
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
