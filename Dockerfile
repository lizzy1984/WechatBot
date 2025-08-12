# Multi-stage build for optimized performance
FROM node:18-alpine AS dependencies

# Set working directory
WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy package files
COPY package*.json ./

# Install dependencies with optimizations
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# Build stage
FROM node:18-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies including dev dependencies for build
RUN npm ci --ignore-scripts

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S wechat-bot -u 1001

WORKDIR /app

# Copy production dependencies
COPY --from=dependencies --chown=wechat-bot:nodejs /app/node_modules ./node_modules

# Copy built application
COPY --from=build --chown=wechat-bot:nodejs /app/dist ./dist

# Copy package.json for metadata
COPY --chown=wechat-bot:nodejs package.json ./

# Switch to non-root user
USER wechat-bot

# Expose port (if needed for health checks)
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/main.js"]