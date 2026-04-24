# ---------------------------------------------------------------------------
# Stage 1 — Install dependencies and build
# ---------------------------------------------------------------------------
# NOTE (audit L5): pin the base image by SHA-256 digest in production
# Dockerfiles, e.g.:
#
#   FROM node:20-alpine@sha256:<full-digest>
#
# The CI/CD pipeline should resolve `node:20-alpine` to its digest at build
# time, sign the resulting image with cosign, and verify the signature
# during deployment.  Tag-only references are mutable and can be
# back-dated by an attacker who controls the registry mirror.
FROM node:25-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2 — Production image
# ---------------------------------------------------------------------------
FROM node:25-alpine

# Run as non-root for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY migrations ./migrations

# Switch to non-root user
USER appuser

EXPOSE 3001

CMD ["node", "dist/index.js"]
