FROM node:18-alpine

WORKDIR /app

# Copy package.json
COPY package.json ./

# Install dependencies
RUN npm install --only=production

# Copy application files
COPY src/server.js ./
COPY docs/docker-update-checker.html ./

# Expose the port
EXPOSE 3456

# Run the application
CMD ["node", "server.js"]
