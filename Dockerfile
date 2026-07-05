FROM node:20-alpine

WORKDIR /app

<<<<<<< Updated upstream
# Copy the working server
COPY okx-agent-server.js .

# No dependencies needed - pure Node.js
EXPOSE 8080

ENV PORT=8080

CMD ["node", "okx-agent-server.js"]
=======
# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install ALL dependencies (full solana-tx-stack)
RUN npm ci --only=production || npm install

# Copy source files
COPY src/ ./src/
COPY okx-agent-server.js ./

# Build TypeScript
RUN npx tsc --noEmit || echo "Build warning: continuing with tsx runtime"

# Environment
ENV NODE_ENV=production
ENV PORT=8080
ENV X402_ENABLED=false

EXPOSE 8080

# Run the A2MCP server via tsx (runtime compilation)
CMD ["npx", "tsx", "src/a2mcp-server.ts"]
>>>>>>> Stashed changes
