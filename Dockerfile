# ── Stage 1: Build Angular app ─────────────────────────────────────────
FROM node:20-alpine AS ng-builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline
COPY . .
RUN npm run build:prod

# ── Stage 2: Build Node server ──────────────────────────────────────────
FROM node:20-alpine AS srv-builder

WORKDIR /srv
COPY server/package.json server/package-lock.json* ./
RUN npm ci --prefer-offline
COPY server/ .
RUN npm run build

# ── Stage 3: Runtime ────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Copy server production deps
COPY --from=srv-builder /srv/package*.json ./
RUN npm ci --omit=dev

# Copy compiled server
COPY --from=srv-builder /srv/dist ./dist

# Copy Angular build as static files (served by Express)
COPY --from=ng-builder /app/dist/newton-game/browser ./public

ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/server.js"]
