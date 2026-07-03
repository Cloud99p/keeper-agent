FROM node:20-alpine

WORKDIR /app

# Copy only the agent server file
COPY okx-agent-server.js .

# No dependencies needed - pure Node.js
EXPOSE 8080

CMD ["node", "okx-agent-server.js"]
