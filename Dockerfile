FROM node:20-alpine

# Install onchainos CLI
RUN npm install -g onchainos

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies
RUN npm ci --only=production || npm install

# Copy source files
COPY src/ ./src/
COPY okx-agent-server.js ./

# Copy heartbeat scripts
COPY entrypoint.sh /app/entrypoint.sh
COPY heartbeat.sh /app/heartbeat.sh
RUN chmod +x /app/entrypoint.sh /app/heartbeat.sh

# Build TypeScript
RUN npx tsc --noEmit || echo "Build warning: continuing with tsx runtime"

# Environment
ENV NODE_ENV=production
ENV PORT=8080
ENV X402_ENABLED=false

EXPOSE 8080

# Entrypoint handles heartbeat + A2MCP
ENTRYPOINT ["/app/entrypoint.sh"]
