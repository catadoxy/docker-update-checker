#!/bin/bash

# Docker Update Checker - Docker Compose Quick Setup
# This script automates the entire setup process

set -e  # Exit on any error

echo "╔════════════════════════════════════════╗"
echo "║  Docker Update Checker - Setup        ║"
echo "║  Docker Compose Method                ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${YELLOW}→${NC} $1"
}

# Detect which docker-compose command to use
DOCKER_COMPOSE_CMD=""
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
elif docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="docker compose"
fi

# Check prerequisites
print_info "Checking prerequisites..."

# Check Docker
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed!"
    echo "Please install Docker from https://docs.docker.com/get-docker/"
    exit 1
fi
print_success "Docker is installed"

# Check if Docker is running
if ! docker ps &> /dev/null; then
    print_error "Docker is not running!"
    echo "Please start Docker and try again"
    exit 1
fi
print_success "Docker is running"

# Check Docker Compose
if [ -z "$DOCKER_COMPOSE_CMD" ]; then
    print_error "Docker Compose is not installed!"
    echo "Please install Docker Compose from https://docs.docker.com/compose/install/"
    exit 1
fi
print_success "Docker Compose is installed (using: $DOCKER_COMPOSE_CMD)"

echo ""

# Verify required files exist
print_info "Checking required files..."

REQUIRED_FILES=("docker-compose.yml" "Dockerfile" "package.json" "server.js" "docker-update-checker.html")
MISSING_FILES=()

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        MISSING_FILES+=("$file")
    fi
done

if [ ${#MISSING_FILES[@]} -gt 0 ]; then
    print_error "Missing required files:"
    for file in "${MISSING_FILES[@]}"; do
        echo "  - $file"
    done
    echo ""
    echo "Please make sure all files are in the current directory."
    exit 1
fi
print_success "All required files present"

echo ""

# Check if container is already running
if docker ps -a --format '{{.Names}}' | grep -q "^docker-update-checker$"; then
    print_info "Existing container found. Removing it..."
    $DOCKER_COMPOSE_CMD down 2>/dev/null || true
    print_success "Old container removed"
fi

echo ""

# Build the image
print_info "Building Docker image (this may take a few minutes)..."
if $DOCKER_COMPOSE_CMD build --no-cache; then
    print_success "Docker image built successfully"
else
    print_error "Failed to build Docker image"
    exit 1
fi

echo ""

# Start the container
print_info "Starting container..."
if $DOCKER_COMPOSE_CMD up -d; then
    print_success "Container started successfully"
else
    print_error "Failed to start container"
    exit 1
fi

echo ""

# Wait a moment for the server to start
print_info "Waiting for server to start..."
sleep 3

# Check if container is running
if docker ps --format '{{.Names}}' | grep -q "^docker-update-checker$"; then
    print_success "Container is running"
else
    print_error "Container is not running"
    echo ""
    echo "Check logs with: $DOCKER_COMPOSE_CMD logs"
    exit 1
fi

echo ""

# Test the API
print_info "Testing API connection..."
if curl -s http://localhost:3456/api/health > /dev/null; then
    print_success "API is responding"
else
    print_error "API is not responding"
    echo ""
    echo "The container is running but the API is not accessible."
    echo "Check logs with: $DOCKER_COMPOSE_CMD logs"
    exit 1
fi

echo ""
echo "╔════════════════════════════════════════╗"
echo "║  Setup Complete! 🎉                   ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "📡 Backend API: http://localhost:3456"
echo "🌐 Web Interface: Open docker-update-checker.html in your browser"
echo ""
echo "Useful commands:"
echo "  View logs:        $DOCKER_COMPOSE_CMD logs -f"
echo "  Stop service:     $DOCKER_COMPOSE_CMD down"
echo "  Restart service:  $DOCKER_COMPOSE_CMD restart"
echo "  View containers:  $DOCKER_COMPOSE_CMD ps"
echo ""
print_info "Opening web interface in 5 seconds..."
sleep 2

# Try to open the HTML file in the default browser
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    open docker-update-checker.html 2>/dev/null || print_info "Please open docker-update-checker.html manually"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    xdg-open docker-update-checker.html 2>/dev/null || print_info "Please open docker-update-checker.html manually"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    # Windows
    start docker-update-checker.html 2>/dev/null || print_info "Please open docker-update-checker.html manually"
else
    print_info "Please open docker-update-checker.html in your browser"
fi

echo ""
print_success "All done! Your Docker Update Checker is running."
