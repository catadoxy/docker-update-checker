#!/bin/bash

# Docker Update Checker - Quick Start Script

echo "╔════════════════════════════════════════╗"
echo "║   Docker Update Checker Setup         ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "Please install Node.js 16+ from https://nodejs.org"
    exit 1
fi

echo "✓ Node.js $(node --version) detected"

# Check if Docker is running
if ! docker ps &> /dev/null; then
    echo "❌ Docker is not running or not accessible!"
    echo "Please start Docker and ensure you have proper permissions"
    exit 1
fi

echo "✓ Docker is running"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✓ Dependencies installed"
echo ""

# Start the server
echo "🚀 Starting Docker Update Checker..."
echo ""
echo "Backend API: http://localhost:3456"
echo "Open docker-update-checker.html in your browser"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm start
