FROM node:20-alpine

WORKDIR /app

# Copy dashboard and server files
COPY dashboard/ ./dashboard/
COPY scripts/ ./scripts/

# Create empty lifecycle_log.json if it doesn't exist
RUN echo '[]' > lifecycle_log.json

# No dependencies needed - pure Node.js
EXPOSE 3000

ENV PORT=3000

CMD ["node", "scripts/dashboard-server.js"]
