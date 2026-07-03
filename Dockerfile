FROM node:20-alpine

WORKDIR /app

# Copy dashboard and server files
COPY dashboard/ ./dashboard/
COPY scripts/ ./scripts/
COPY lifecycle_log.json . 2>/dev/null || true

# No dependencies needed - pure Node.js
EXPOSE 3000

ENV PORT=3000

CMD ["node", "scripts/dashboard-server.js"]
