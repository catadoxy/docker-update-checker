FROM node:18-alpine

WORKDIR /app

# Copy package.json
COPY package.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy application files (server + modules live in src/ after the restructure)
COPY src/ ./
COPY docker-update-checker.html ./

# Expose the port
EXPOSE 3456

# Run the application
CMD ["node", "server.js"]
