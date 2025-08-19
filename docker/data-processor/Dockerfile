# Multi-stage build for Node.js data processor
FROM node:18-alpine as builder

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    curl

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Production stage
FROM node:18-alpine as production

# Install runtime dependencies and security updates
RUN apk upgrade --no-cache && \
    apk add --no-cache \
    dumb-init \
    curl \
    ca-certificates && \
    addgroup -g 1001 -S nodejs && \
    adduser -S -D -H -u 1001 -h /app -s /sbin/nologin -G nodejs nodejs

# Set working directory
WORKDIR /app

# Copy application from builder
COPY --from=builder --chown=nodejs:nodejs /app .

# Create necessary directories
RUN mkdir -p /app/logs /app/data /app/models && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose ports
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Set Node.js options
ENV NODE_OPTIONS="--max-old-space-size=1024"
ENV NODE_ENV=production

# Use dumb-init to handle signals
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "index.js", "start"]

# Development stage
FROM node:18-alpine as development

# Install development tools
RUN apk add --no-cache \
    git \
    vim \
    netcat-openbsd

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY . .

# Create directories
RUN mkdir -p logs data models

# Expose ports (including debug)
EXPOSE 3001 9229

# Set development environment
ENV NODE_ENV=development
ENV DEBUG=*

# Start with debugging enabled
CMD ["npm", "run", "dev"]