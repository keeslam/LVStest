# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for building)
RUN npm ci

# Copy source code
COPY . .

# Build the application (frontend + backend)
RUN npm run build

# Production stage
FROM node:20-alpine

# pg_dump and psql are spawned at runtime by the backup service and the restore
# endpoint. The plain node image does not ship them, so without this every
# backup fails with "spawn pg_dump ENOENT" and restore cannot run at all.
# Keep the major version in step with the database server: pg_dump refuses to
# dump from a server newer than itself.
RUN apk add --no-cache postgresql17-client || apk add --no-cache postgresql-client

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy necessary runtime files
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/startup-migration.js ./
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/uploads ./uploads

# Create uploads directory structure if it doesn't exist
RUN mkdir -p /app/uploads/vehicle-diagrams /app/uploads/documents /app/uploads/drivers

# Expose port
EXPOSE 5000

# Set production environment
ENV NODE_ENV=production
ENV PORT=5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application with migration
CMD ["sh", "-c", "node startup-migration.js && npm start"]
