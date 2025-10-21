# Build stage
FROM node:20-alpine AS builder

# Install build dependencies (python3, make, g++ needed for some npm packages)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client and build application
RUN npx prisma generate && npm run build

# Production stage - smaller final image
FROM node:20-alpine

# Install dumb-init for proper signal handling and curl for health checks
RUN apk add --no-cache dumb-init curl

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install only production dependencies
RUN npm ci --omit=dev && \
    npx prisma generate && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Switch to non-root user
USER nodejs

# Railway will set PORT env variable, default to 3000
EXPOSE ${PORT:-3000}

# Health check using curl for better reliability
# Check /health/live endpoint which is simpler and faster
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/health/live || exit 1

# Start application with signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]