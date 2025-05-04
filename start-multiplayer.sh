#!/bin/bash

# Start multiplayer testing environment
echo "Starting 100 Men vs Gorilla multiplayer testing environment..."

# Function to kill processes using a port
kill_port() {
  local PORT=$1
  if lsof -i :$PORT -t >/dev/null; then
    echo "Port $PORT is in use. Attempting to free it..."
    for PID in $(lsof -i :$PORT -t); do
      echo "Killing process $PID using port $PORT"
      kill -9 $PID 2>/dev/null
    done
    sleep 1
  fi
}

# Kill any existing processes on ports 3000 and 3001
echo "Checking for existing processes on ports 3000 and 3001..."
kill_port 3000
kill_port 3001

# Kill any lingering node processes related to the game
echo "Checking for lingering node processes..."
pkill -f "node server.js" 2>/dev/null

# Store the root directory
ROOT_DIR=$(pwd)

# Clean any previous builds and install if needed
echo "Checking for dependencies..."
if [ ! -d "$ROOT_DIR/node_modules" ]; then
  echo "Installing root dependencies..."
  npm install
fi

if [ ! -d "$ROOT_DIR/client/node_modules" ]; then
  echo "Installing client dependencies..."
  cd "$ROOT_DIR/client" && npm install
  cd "$ROOT_DIR"
fi

if [ ! -d "$ROOT_DIR/server/node_modules" ]; then
  echo "Installing server dependencies..."
  cd "$ROOT_DIR/server" && npm install
  cd "$ROOT_DIR"
fi

# Do a quick check for socket.io versions
echo "Checking Socket.IO versions..."
CLIENT_VERSION=$(grep -o '"socket.io-client": "[^"]*"' "$ROOT_DIR/client/package.json" | grep -o '[0-9.]*')
SERVER_VERSION=$(grep -o '"socket.io": "[^"]*"' "$ROOT_DIR/server/package.json" | grep -o '[0-9.]*')

echo "Socket.IO client version: $CLIENT_VERSION"
echo "Socket.IO server version: $SERVER_VERSION"

if [[ "$CLIENT_VERSION" != "$SERVER_VERSION" ]]; then
  echo "⚠️ Warning: Socket.IO client and server versions do not match!"
  echo "This might cause connection issues."
fi

# Start the server with enhanced logging
echo "Starting server on port 3000..."
cd "$ROOT_DIR/server" && NODE_DEBUG=net,http,socket.io node server.js &
SERVER_PID=$!

# Wait for server to start
echo "Waiting for server to start..."
sleep 5

# Check if server started successfully
if ! lsof -i :3000 -t >/dev/null; then
  echo "Error: Server failed to start on port 3000!"
  echo "Check for errors in the server output above."
  exit 1
fi

# Test server health
echo "Testing server connectivity..."
if curl -s http://localhost:3000/health >/dev/null; then
  echo "Server health check passed! ✅"
else
  echo "Warning: Server health check failed! The server might not be functioning correctly. ⚠️"
fi

# Start the client
echo "Starting client on port 3001..."
cd "$ROOT_DIR/client" && npm run dev &
CLIENT_PID=$!

# Wait for client to start
echo "Waiting for client to start..."
sleep 5

# Check if client started successfully
if ! lsof -i :3001 -t >/dev/null; then
  echo "Error: Client failed to start on port 3001!"
  echo "Check for errors in the client output above."
  # Kill server if client failed
  kill $SERVER_PID 2>/dev/null
  exit 1
fi

echo "Client started successfully! ✅"
echo "Game is running at: http://localhost:3001"
echo ""
echo "Socket.IO Test Page: http://localhost:3000/socket-test"
echo "Server Health Check: http://localhost:3000/health"
echo ""
echo "Press Ctrl+C to stop both server and client"

# Wait for user interrupt
wait $CLIENT_PID

# When client is closed, kill the server
echo "Client closed. Shutting down server (PID: $SERVER_PID)..."
kill $SERVER_PID 2>/dev/null || echo "Server process already terminated."

echo "Multiplayer testing environment stopped." 