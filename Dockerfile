FROM node:18-alpine

WORKDIR /app

# Copy manifests and install exact, reproducible dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application files (server + modules live in src/ after the restructure)
COPY src/ ./
COPY docker-update-checker.html ./

# Expose the port
EXPOSE 3456

# Run the application
CMD ["node", "server.js"]
