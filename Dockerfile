# =============================================================================
# AstroLumina BookingAPI - Dockerfile
# =============================================================================

FROM node:24.22.1-alpine3.24 AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --only=production

FROM node:24.22.1-alpine3.24 AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:24.22.1-alpine3.24 AS runner
WORKDIR /app

# Release identifier baked per image build so Sentry events carry the same
# release the CI job uploaded source maps for.
ARG SENTRY_RELEASE=""
ENV SENTRY_RELEASE=${SENTRY_RELEASE}

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Strip npm from the runtime image: its bundled deps (undici, tar) carry HIGH
# CVEs, and nothing here executes npm (CMD runs node directly). Build stages
# above keep npm for `npm ci` / `npm run build`.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

LABEL org.opencontainers.image.title="AstroLumina BookingAPI" \
    org.opencontainers.image.description="Booking API Express Server" \
    org.opencontainers.image.vendor="AstroLumina" \
    org.opencontainers.image.licenses="MIT"

RUN chown -R nodejs:nodejs /app
USER nodejs

CMD ["node", "dist/server.js"]