FROM node:20-alpine

WORKDIR /app

# Copy only the health server
COPY okx-health-server.js .

# No dependencies needed - pure Node.js
EXPOSE 3000

ENV PORT=3000

CMD ["node", "okx-health-server.js"]
