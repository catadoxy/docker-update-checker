# ─── Build the frontend bundle ────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY frontend/ ./frontend/
RUN npm run build

# ─── Runtime image ────────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Application files (server + modules live in src/ after the restructure)
COPY src/ ./
COPY docker-update-checker.html ./
COPY --from=builder /app/app.js ./

EXPOSE 3456

CMD ["node", "server.js"]
