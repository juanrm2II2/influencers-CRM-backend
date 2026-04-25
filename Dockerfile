# ---------------------------------------------------------------------------
# Stage 1 — Install dependencies and build
# ---------------------------------------------------------------------------
# Audit L5: the base image is pinned by SHA-256 digest below so that an
# attacker who compromises the registry mirror cannot back-date a malicious
# `node:20-alpine` tag without changing the digest (which would fail the
# `docker build` here and the cosign verification in CD).
#
# To refresh the digest after a Node.js patch release, run:
#
#   docker buildx imagetools inspect node:20-alpine \
#     --format '{{.Manifest.Digest}}'
#
# and update both stages below.  The CI/CD pipeline must additionally sign
# the resulting image with cosign and verify the signature during
# deployment, and CI runs `npm audit signatures` to catch tampered npm
# packages.
# Declared above the first FROM so it is global to the Dockerfile; both
# `FROM ${NODE_IMAGE}` instructions below resolve to the same digest.  The
# default is sufficient — no re-declaration is needed inside the stages
# because NODE_IMAGE is only consumed by the FROM lines themselves.
ARG NODE_IMAGE=node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293

FROM ${NODE_IMAGE} AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2 — Production image
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE}

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
