# ── Stage 1: Build Angular app ─────────────────────────────────────────
FROM node:20-alpine AS ng-builder

ARG FIREBASE_API_KEY
ARG FIREBASE_AUTH_DOMAIN=austin-test-450819.firebaseapp.com
ARG FIREBASE_PROJECT_ID=austin-test-450819
ARG FIREBASE_STORAGE_BUCKET=austin-test-450819.firebasestorage.app
ARG FIREBASE_MESSAGING_SENDER_ID=579215986794
ARG FIREBASE_APP_ID=1:579215986794:web:0f0389b9264e1d6271ba13

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline
COPY . .

# Generate environment files from build args
RUN mkdir -p src/environments && \
    printf "export const environment = {\n  production: true,\n  firebase: {\n    apiKey: '%s',\n    authDomain: '%s',\n    projectId: '%s',\n    storageBucket: '%s',\n    messagingSenderId: '%s',\n    appId: '%s',\n  },\n};\n" \
    "$FIREBASE_API_KEY" "$FIREBASE_AUTH_DOMAIN" "$FIREBASE_PROJECT_ID" \
    "$FIREBASE_STORAGE_BUCKET" "$FIREBASE_MESSAGING_SENDER_ID" "$FIREBASE_APP_ID" \
    > src/environments/environment.prod.ts && \
    cp src/environments/environment.prod.ts src/environments/environment.ts

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

# Copy Angular build as static files served by Express
# server.js lives at /app/dist/server.js → __dirname = /app/dist
# path.join(__dirname, '../../public') resolves to /public
COPY --from=ng-builder /app/dist/newton-game/browser /public

ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/server.js"]
