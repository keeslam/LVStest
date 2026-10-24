# Production image for Coolify (build pack: Dockerfile).
#
# This replaces the Nixpacks build (nixpacks.toml) and mirrors what it did:
# the whole repository plus all node_modules lives in /app, the app is built
# with `npm run build`, and on boot startup-migration.js runs before the server.
#
# Both stages use the same Debian base so native modules compiled or downloaded
# in the builder (canvas) find the same system libraries at runtime.

# ---------------------------------------------------------------------------
# Build stage
# ---------------------------------------------------------------------------
FROM node:20-trixie-slim AS builder

WORKDIR /app

# Install ALL dependencies, devDependencies included: the build needs them, and
# at runtime the server bundle still imports devDependencies (vite in
# server/vite.ts, cross-env in `npm start`). Nixpacks kept them too
# (NPM_CONFIG_PRODUCTION=false).
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build \
 && mkdir -p dist/server/public \
 && cp -r dist/public/* dist/server/public/

# ---------------------------------------------------------------------------
# Runtime stage
# ---------------------------------------------------------------------------
FROM node:20-trixie-slim

# pg_dump and psql are spawned at runtime by the backup service and the restore
# endpoint. pg_dump refuses to dump from a server newer than itself, so the
# client major version must be at least the database server's (PostgreSQL 17).
# Bump this in step with the database. Debian trixie ships PostgreSQL 17.
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-17 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# The whole built repository, as Nixpacks had it. Code reads files relative to
# the working directory at runtime (attached_assets, docs/gebruikershandleiding,
# schema-columns.json, node_modules/pdfjs-dist) and the code backup archives it.
COPY --from=builder /app /app

RUN mkdir -p /app/uploads/vehicle-diagrams /app/uploads/documents /app/uploads/drivers /app/backups /app/temp

ENV NODE_ENV=production
# Coolify routes to port 3000 and sets PORT=3000 itself; this default only
# matters when the image runs without that variable.
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# The migration is chained with || rather than && so a schema step that fails
# cannot stop the app from booting; a failing boot made Coolify restart the
# container in a loop without ever serving traffic.
#
# Never add `npm run db:push` here: drizzle-kit push rewrites the live database
# to match shared/schema.ts and is destructive (it dropped columns and offered
# to TRUNCATE vehicles on 2026-08-30). startup-migration.js applies every
# schema change additively and is the only schema step that belongs in boot.
CMD ["sh", "-c", "echo '=== CAR RENTAL MANAGER STARTING ===' && echo '=== RUNNING STARTUP MIGRATION ===' && (node startup-migration.js || echo '⚠️ startup migration reported errors — continuing') && echo '=== STARTING APPLICATION ===' && exec npm start"]
