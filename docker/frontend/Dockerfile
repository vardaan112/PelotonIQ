# Multi-stage build for React frontend
FROM node:18-alpine as builder

# Install build dependencies
RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies with caching
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Build application
RUN npm run build

# Nginx production stage
FROM nginx:alpine as production

# Install security updates
RUN apk upgrade --no-cache

# Remove default nginx website
RUN rm -rf /usr/share/nginx/html/*

# Copy built application
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx configuration
COPY --from=builder /app/nginx.conf /etc/nginx/nginx.conf

# Copy SSL certificates (if available)
RUN mkdir -p /etc/nginx/ssl

# Create nginx user
RUN addgroup -g 101 -S nginx && adduser -S -D -H -u 101 -h /var/cache/nginx -s /sbin/nologin -G nginx nginx

# Set proper permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /etc/nginx/conf.d

# Create health check endpoint
RUN echo '<!DOCTYPE html><html><head><title>Health Check</title></head><body><h1>OK</h1></body></html>' > /usr/share/nginx/html/health

# Switch to non-root user
USER nginx

# Expose ports
EXPOSE 80 443

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

# Development stage
FROM node:18-alpine as development

# Install development dependencies
RUN apk add --no-cache git

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY . .

# Expose development port
EXPOSE 3000

# Set development environment
ENV NODE_ENV=development
ENV CHOKIDAR_USEPOLLING=true

# Start development server
CMD ["npm", "start"]