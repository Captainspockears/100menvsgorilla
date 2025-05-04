const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const path = require("path");
const ngrok = require("ngrok");

// Enhanced debug logging with different log levels
function serverLog(message, level = "info", data = null) {
  const timestamp = new Date().toISOString();
  const levelLabels = {
    info: "\x1b[34m[INFO]\x1b[0m", // Blue
    error: "\x1b[31m[ERROR]\x1b[0m", // Red
    warn: "\x1b[33m[WARN]\x1b[0m", // Yellow
    success: "\x1b[32m[SUCCESS]\x1b[0m", // Green
    debug: "\x1b[35m[DEBUG]\x1b[0m", // Magenta
  };

  console.log(
    `[${timestamp}] ${levelLabels[level] || levelLabels.info} ${message}`
  );
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

// Legacy verbose debug function - maintained for compatibility
function verboseDebug(message, data = null) {
  serverLog(message, "debug", data);
}

// Create express app and server
const app = express();
const server = http.createServer(app);

// Connection tracking
const connections = {
  total: 0,
  active: 0,
  history: [],
  errors: [],
};

// Log connection counts every 10 seconds
setInterval(() => {
  serverLog(
    `Active connections: ${connections.active}/${connections.total}`,
    "info"
  );
}, 10000);

// Enhanced Socket.IO configuration with better connection handling
const io = socketIO(server, {
  cors: {
    origin: ["http://localhost:3001", "http://localhost:3000", "*"], // Explicit origins
    methods: ["GET", "POST"],
    credentials: false,
    allowedHeaders: ["Content-Type", "Authorization"],
  },
  transports: ["websocket", "polling"], // Support both transports
  pingTimeout: 60000, // Increased ping timeout for more resilience
  pingInterval: 10000,
  allowEIO3: true, // Support both EIO versions
  maxHttpBufferSize: 1e8, // Increased buffer size for large payloads
  connectTimeout: 45000, // Longer connect timeout
  path: "/socket.io/", // Explicitly set the path
});

// Access the default namespace explicitly
const mainNamespace = io.of("/");

// Log Socket.IO configuration
serverLog("Socket.IO Configuration:", "debug", io._opts);

// Track socket connections by client id
const clientSockets = {};

// Log version info differently to avoid package.json error
const socketIOVersion = "4.7.2"; // Hardcode the version since we can't read it from package.json
serverLog(
  `Socket.IO server initialized with version ${socketIOVersion}`,
  "debug"
);

// Add connection logging middleware to the default namespace
mainNamespace.use((socket, next) => {
  serverLog(
    `New connection attempt from ${socket.handshake.address}`,
    "debug",
    {
      id: socket.id,
      query: socket.handshake.query,
      headers: socket.handshake.headers,
      url: socket.handshake.url,
    }
  );
  next();
});

// Health check endpoint
app.get("/health", (req, res) => {
  serverLog("Health check requested", "debug", {
    ip: req.ip,
    headers: req.headers,
  });

  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: Date.now(),
    connections: Object.keys(players).length,
    host: hostId,
    version: "1.0.2",
    connectionStats: connections,
    socketioVersion: socketIOVersion,
  });
});

// Test endpoint for WebSocket verification
app.get("/socket-test", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Socket.IO Test</title>
      <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
      <script>
        document.addEventListener('DOMContentLoaded', () => {
          const log = (msg) => {
            const el = document.getElementById('log');
            el.innerHTML += msg + '<br>';
          };
          
          log('Attempting to connect to socket server...');
          const socket = io("http://localhost:3000", {
            transports: ["websocket", "polling"]
          });
          
          socket.on('connect', () => {
            log('Connected! Socket ID: ' + socket.id);
          });
          
          socket.on('connect_error', (err) => {
            log('Connection error: ' + err.message);
          });
          
          socket.on('disconnect', (reason) => {
            log('Disconnected: ' + reason);
          });
          
          socket.on('connectionAck', (data) => {
            log('Connection acknowledged by server: ' + JSON.stringify(data));
          });
        });
      </script>
    </head>
    <body>
      <h1>Socket.IO Connection Test</h1>
      <div id="log" style="padding: 10px; background: #f0f0f0; height: 300px; overflow: auto;"></div>
    </body>
    </html>
  `);
});

// CORS middleware for REST endpoints
app.use((req, res, next) => {
  // Log incoming requests
  verboseDebug(`${req.method} request to ${req.url}`, {
    headers: req.headers,
  });

  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

// Serve static files from the client/dist directory
app.use(express.static(path.join(__dirname, "../client/dist")));

// Handle all routes by returning the main index.html (for SPA routing)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/dist", "index.html"));
});

// Fallback route
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "../client/dist", "index.html"));
});

// Store connected players
const players = {};

// Define initial positions of entities
const INITIAL_POSITIONS = {
  gorilla: { x: 10, y: 0, z: 10 },
  bots: Array(10)
    .fill()
    .map((_, i) => {
      const angle = (i / 10) * Math.PI * 2;
      const distance = 5 + Math.random() * 5;
      return {
        x: Math.cos(angle) * distance,
        y: 0,
        z: Math.sin(angle) * distance,
      };
    }),
};

// Store game entities (gorilla and bots)
const gameEntities = {
  gorilla: {
    position: INITIAL_POSITIONS.gorilla,
    rotation: { y: 0 },
    health: 200,
    maxHealth: 200,
    isDead: false,
  },
  bots: INITIAL_POSITIONS.bots.map((pos) => ({
    position: pos,
    rotation: { y: 0 },
    health: 50,
    maxHealth: 50,
    isDead: false,
  })),
};

// Define map boundaries to keep players within a reasonable area
const MAP_BOUNDARIES = {
  minX: -50,
  maxX: 50,
  minZ: -50,
  maxZ: 50,
};

// Track room host (first player becomes host and controls game logic)
let hostId = null;

// Debug helper
function debug(message) {
  const timestamp = new Date().toISOString().substring(11, 19);
  console.log(`[${timestamp}] [Server] ${message}`);
}

// Function to log server state periodically
function logServerState() {
  debug("============ SERVER STATE ============");
  debug(`Connected players: ${Object.keys(players).length}`);
  debug(`Current host: ${hostId || "None"}`);
  debug(
    `Total connections: ${connections.total}, Active: ${connections.active}`
  );

  if (Object.keys(players).length > 0) {
    debug("Player positions:");
    Object.entries(players).forEach(([id, data]) => {
      const pos = data.position;
      debug(
        `- ${id.substring(0, 6)}... (${data.name}): X:${pos.x.toFixed(
          2
        )}, Y:${pos.y.toFixed(2)}, Z:${pos.z.toFixed(2)}`
      );
    });
  }
  debug("======================================");
}

// Log server state every 10 seconds
setInterval(logServerState, 10000);

// Helper function to enforce map boundaries
function enforceMapBoundaries(position) {
  return {
    x: Math.max(MAP_BOUNDARIES.minX, Math.min(MAP_BOUNDARIES.maxX, position.x)),
    y: position.y, // Don't restrict vertical movement
    z: Math.max(MAP_BOUNDARIES.minZ, Math.min(MAP_BOUNDARIES.maxZ, position.z)),
  };
}

// Helper function to generate a random color
function randomColor() {
  const colors = [
    0xff0000, // red
    0x00ff00, // green
    0x0000ff, // blue
    0xffff00, // yellow
    0xff00ff, // magenta
    0x00ffff, // cyan
    0xff8000, // orange
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Handle socket connections on the default namespace
mainNamespace.on("connection", (socket) => {
  // Increment connection counts
  connections.total++;
  connections.active++;
  connections.history.push({
    id: socket.id,
    time: Date.now(),
    transport:
      socket.conn && socket.conn.transport
        ? socket.conn.transport.name
        : "unknown",
  });

  // Now we can safely log transport info since the connection is established
  if (socket.conn && socket.conn.transport) {
    serverLog(
      `Available transports for ${socket.id}: ${Object.keys(
        socket.conn.transport
      ).join(", ")}`,
      "debug"
    );
  }

  // Track this socket
  clientSockets[socket.id] = socket;

  // Log connection
  serverLog(`Client connected: ${socket.id}`, "success", {
    address: socket.handshake.address,
    transport:
      socket.conn && socket.conn.transport
        ? socket.conn.transport.name
        : "unknown",
    time: new Date().toISOString(),
    query: socket.handshake.query,
  });

  // Send acknowledgment to client
  socket.emit("connectionAck", {
    id: socket.id,
    message: "Connected to server",
    timestamp: Date.now(),
    serverInfo: {
      uptime: process.uptime(),
      players: Object.keys(players).length,
      host: hostId,
    },
  });

  // Log transport changes - check if socket.conn exists
  if (socket.conn) {
    socket.conn.on("upgrade", (transport) => {
      serverLog(
        `Client ${socket.id} upgraded transport to: ${
          transport ? transport.name : "unknown"
        }`,
        "info"
      );
    });
  }

  // Handle join event
  socket.on("join", (data) => {
    serverLog(`Player ${socket.id} joining game as ${data.name}`, "info", data);

    // Create player data
    players[socket.id] = {
      id: socket.id,
      name: data.name,
      position: data.position || { x: 0, y: 0, z: 0 },
      rotation: data.rotation || { y: 0 },
      color: randomColor(),
    };

    // Assign host if needed
    if (!hostId) {
      hostId = socket.id;
      socket.emit("hostAssigned", { isHost: true });
      serverLog(`Player ${socket.id} assigned as host`, "info");
    }

    // Send existing players to the new player
    const existingPlayers = Object.values(players).filter(
      (p) => p.id !== socket.id
    );
    socket.emit("existingPlayers", existingPlayers);

    // Notify all players about the new player
    socket.broadcast.emit("playerJoined", players[socket.id]);

    // Debug
    serverLog(`Total players now: ${Object.keys(players).length}`, "info");
  });

  // Handle position update
  socket.on("playerUpdate", (data) => {
    if (!players[socket.id]) return;

    // Update player data
    players[socket.id].position = data.position;
    players[socket.id].rotation = data.rotation;

    // Broadcast to others
    socket.broadcast.emit("playerMoved", {
      id: socket.id,
      position: data.position,
      rotation: data.rotation,
    });
  });

  // Handle host game state
  socket.on("gameStateUpdate", (gameState) => {
    // Only accept updates from host
    if (socket.id !== hostId) return;

    // Broadcast to all clients except host
    socket.broadcast.emit("gameStateUpdate", gameState);
  });

  // Handle chat messages
  socket.on("chatMessage", (message) => {
    if (!players[socket.id]) return;

    serverLog(
      `Chat message from ${players[socket.id].name}: ${message}`,
      "info"
    );

    mainNamespace.emit("chatMessage", {
      sender: players[socket.id].name,
      senderId: socket.id,
      message,
      timestamp: Date.now(),
    });
  });

  // Handle disconnect
  socket.on("disconnect", (reason) => {
    serverLog(`Client disconnected: ${socket.id}, reason: ${reason}`, "warn");

    // Decrement active connections
    connections.active--;

    // Remove from tracking
    delete clientSockets[socket.id];

    if (players[socket.id]) {
      // Broadcast to all clients that this player has left
      mainNamespace.emit("playerLeft", socket.id);

      // Check if this was the host
      if (socket.id === hostId) {
        // Assign a new host if there are other players
        const remainingPlayers = Object.keys(players).filter(
          (id) => id !== socket.id
        );

        if (remainingPlayers.length > 0) {
          hostId = remainingPlayers[0];
          if (clientSockets[hostId]) {
            clientSockets[hostId].emit("hostAssigned", { isHost: true });
            serverLog(`New host assigned: ${hostId}`, "info");
          }
        } else {
          hostId = null;
          serverLog("No players left, resetting host", "info");
        }
      }

      // Remove player from the game
      delete players[socket.id];

      // Debug
      serverLog(`Total players now: ${Object.keys(players).length}`, "info");
    }
  });

  // Handle error
  socket.on("error", (error) => {
    serverLog(`Socket error for ${socket.id}: ${error.message}`, "error");
    connections.errors.push({
      id: socket.id,
      time: Date.now(),
      error: error.message,
    });
  });
});

// Start server on specified port (default: 3000)
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", async () => {
  debug(`Server running on port ${PORT} (all interfaces)`);
  console.log(`\n=====================================================`);
  console.log(`Multiplayer server running at http://localhost:${PORT}`);
  console.log(`Listening on all network interfaces (0.0.0.0:${PORT})`);
  console.log(`=====================================================\n`);

  // Log node version only - don't try to access socket.io package.json
  console.log(`Node.js version: ${process.version}`);
  console.log(`Socket.IO version: ${socketIOVersion}`);

  // We'll use the standalone ngrok command instead
  console.log(`\n=====================================================`);
  console.log(`To expose this server publicly, run in a separate terminal:`);
  console.log(`ngrok http --subdomain=hen-clear-hornet 3000`);
  console.log(`=====================================================\n`);

  /*
  // Start ngrok to make server publicly accessible
  try {
    console.log(`\nAttempting to create public URL with ngrok...`);

    // Create an ngrok tunnel to the server with improved configuration
    const url = await ngrok.connect({
      addr: PORT,
      region: "us", // Can be changed to "eu", "ap", "au", "sa", "jp", or "in" based on your location
      subdomain: "hen-clear-hornet", // Use the static domain you received
      onStatusChange: (status) => {
        console.log(`Ngrok status changed: ${status}`);
      },
      onLogEvent: (data) => {
        serverLog(`Ngrok log: ${data}`, "debug");
      },
    });

    debug(`Server is publicly accessible at: ${url}`);
    console.log(`\n=====================================================`);
    console.log(`✨ MULTIPLAYER SERVER IS NOW PUBLIC! ✨`);
    console.log(`=====================================================`);
    console.log(`Share this URL with friends: ${url}`);
    console.log(`\nThis URL will work as long as this server is running`);
    console.log(`Players can join from anywhere in the world!`);
    console.log(`=====================================================\n`);

    // Store the URL to make it available via API
    app.locals.publicUrl = url;

    // Add a new endpoint to get the public URL
    app.get("/public-url", (req, res) => {
      res.json({ url: app.locals.publicUrl });
    });
  } catch (error) {
    debug(`Failed to start ngrok: ${error.message}`);
    console.error(`\n⚠️ Error creating public URL: ${error.message}`);

    if (
      error.message.includes("failed to start tunnel") ||
      error.message.includes("auth")
    ) {
      console.log(`\nPossible solutions:`);
      console.log(`1. Check your internet connection`);
      console.log(
        `2. You need to authenticate with ngrok using your authtoken. Run this command in your terminal:`
      );
      console.log(`   npx ngrok authtoken YOUR_AUTH_TOKEN`);
      console.log(`   Get your authtoken from: https://dashboard.ngrok.com/get-started/your-authtoken`);
      console.log(`3. Make sure port ${PORT} is not blocked by firewall`);
    }

    // Provide local URL for testing
    console.log(`\n=====================================================`);
    console.log(`For local testing, use multiple browser windows/tabs`);
    console.log(`For network testing, your local IP may work for LAN devices`);
    console.log(`=====================================================\n`);
  }
  */
});

module.exports = server;
