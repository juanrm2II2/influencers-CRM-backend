# syntax=docker/dockerfile:1.7

# ─── deps stage ─────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS deps
WORKDIR /app
ENV NODE_ENV=development
COPY package.json package-lock.json* ./
# Use npm ci when a lockfile exists, otherwise fall back to npm install so the
# image builds cleanly in a fresh checkout. CI is expected to commit a lockfile.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ─── build stage ────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS build
WORKDIR /app
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build \
  && npm prune --omit=dev

# ─── runtime stage ──────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# Run as the unprivileged `node` user that ships with the image.
USER node
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/package.json ./package.json

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+ (process.env.PORT||8080) +'/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
