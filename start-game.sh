#!/bin/bash

# 100 Men vs Gorilla - Quick Start Script
echo "Starting 100 Men vs Gorilla..."
echo "========================================"

# Check if terminal supports colors
if [ -t 1 ]; then
  GREEN="\033[0;32m"
  YELLOW="\033[1;33m"
  BLUE="\033[0;34m"
  RED="\033[0;31m"
  NC="\033[0m" # No Color
else
  GREEN=""
  YELLOW=""
  BLUE=""
  RED=""
  NC=""
fi

# Kill any existing servers
pkill -f "node server.js" 2>/dev/null || true
echo "${BLUE}Cleaned up any existing server processes${NC}"

# Function to check if command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Start server in background
echo "${GREEN}Starting server on port 3000...${NC}"
cd server && node server.js &
SERVER_PID=$!

# Wait a bit for server to initialize
sleep 2

# Start client using npm
echo "${GREEN}Starting client on port 3001...${NC}"
cd ../client && npm run dev &
CLIENT_PID=$!

# Print multiplayer instructions
echo ""
echo "${YELLOW}========================================"
echo "MULTIPLAYER INSTRUCTIONS"
echo "========================================${NC}"
echo ""
echo "Local multiplayer: Open multiple tabs at ${BLUE}http://localhost:3001${NC}"
echo ""
echo "${YELLOW}For online multiplayer with friends:${NC}"

# Check if ngrok is installed
if command_exists ngrok; then
  echo "1. In a NEW TERMINAL, run: ${BLUE}ngrok http 3000${NC}"
  echo "2. Copy the https URL (like https://xxxx-xxx-xxx.ngrok-free.app)"
  echo "3. Share this URL with friends to play together!"
  echo ""
  echo "${GREEN}Ready to set up ngrok! Run in a new terminal:${NC}"
  echo "${BLUE}ngrok http 3000${NC}"
else
  echo "${RED}ngrok not found!${NC} For online multiplayer, install ngrok:"
  echo "1. Visit ${BLUE}https://ngrok.com/download${NC} and follow instructions"
  echo "2. Create a free account at ${BLUE}https://dashboard.ngrok.com/signup${NC}"
  echo "3. Add your authtoken with: ${BLUE}ngrok config add-authtoken YOUR_TOKEN${NC}"
  echo "4. Then run: ${BLUE}ngrok http 3000${NC}"
fi

echo ""
echo "${GREEN}Game is starting! Open ${BLUE}http://localhost:3001${NC} in your browser.${NC}"
echo ""
echo "Press Ctrl+C to stop the game"

# Wait for user to press Ctrl+C
wait $CLIENT_PID

# Clean up
echo ""
echo "${YELLOW}Shutting down...${NC}"
kill $SERVER_PID 2>/dev/null || true
echo "${GREEN}Game stopped. Thanks for playing!${NC}" 