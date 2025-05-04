import * as THREE from "three";
// We'll manually add the script tag instead of importing, as import may be failing with Vite

import { Player } from "../entities/Player.js";
import { Gorilla } from "../entities/Gorilla.js";
import { Bot } from "../entities/Bot.js";

// DEBUG HELPERS
function debugLog(message, type = "info") {
  const timestamp = new Date().toISOString().substring(11, 19);
  const styles = {
    info: "color: #2196F3; font-weight: bold;",
    error: "color: #f44336; font-weight: bold;",
    success: "color: #4CAF50; font-weight: bold;",
    warning: "color: #ff9800; font-weight: bold;",
  };
  console.log(`%c[${timestamp}] [Multiplayer] ${message}`, styles[type]);

  // Also log to a DOM element for easier debugging
  const logContainer = document.getElementById("multiplayer-log");
  if (!logContainer) {
    const container = document.createElement("div");
    container.id = "multiplayer-log";
    container.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      max-width: 500px;
      max-height: 300px;
      overflow: auto;
      background: rgba(0,0,0,0.7);
      color: white;
      padding: 10px;
      font-family: monospace;
      font-size: 12px;
      z-index: 9999;
      border-radius: 5px;
    `;
    document.body.appendChild(container);
  }

  const logEntry = document.createElement("div");
  logEntry.innerHTML = `<span style="color:${
    type === "info"
      ? "#2196F3"
      : type === "error"
      ? "#f44336"
      : type === "success"
      ? "#4CAF50"
      : "#ff9800"
  }">[${timestamp}]</span> ${message}`;
  if (document.getElementById("multiplayer-log")) {
    document.getElementById("multiplayer-log").appendChild(logEntry);
    document.getElementById("multiplayer-log").scrollTop =
      document.getElementById("multiplayer-log").scrollHeight;
  }
}

// Load socket.io from CDN without integrity check
function loadSocketIO() {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (typeof io !== "undefined") {
      debugLog("Socket.IO already loaded in global scope", "success");
      return resolve(io);
    }

    debugLog("Loading Socket.IO from CDN without integrity", "info");
    // Add script tag manually without integrity check
    const script = document.createElement("script");
    script.src = "https://cdn.socket.io/4.7.2/socket.io.js"; // Use .js not .min.js to avoid integrity issues
    script.async = true;

    script.onload = () => {
      debugLog("Socket.IO loaded successfully from CDN", "success");
      resolve(window.io);
    };

    script.onerror = (err) => {
      debugLog(`Failed to load Socket.IO: ${err}`, "error");
      reject(new Error("Failed to load Socket.IO from CDN"));
    };

    document.head.appendChild(script);
  });
}

// Enhanced debug logging for socket.io events - trace all important events
function traceSocketEvents(socket) {
  if (!socket) {
    debugLog("Cannot trace events - socket is null", "error");
    return;
  }

  debugLog(`Setting up extensive event tracing for socket`, "info");

  // Basic connection events
  socket.on("connect", () => {
    debugLog(`CONNECTED with ID: ${socket.id}`, "success");
    console.log("Socket connected:", socket);
  });

  socket.on("connect_error", (err) => {
    debugLog(`Connection ERROR: ${err.message}`, "error");
    console.error("Connection error details:", err);
  });

  socket.on("disconnect", (reason) => {
    debugLog(`DISCONNECTED. Reason: ${reason}`, "warning");
  });

  // More detailed connection debugging
  socket.io?.on("reconnect_attempt", (attemptNumber) => {
    debugLog(`Reconnect attempt #${attemptNumber}`, "info");
  });

  socket.io?.on("reconnect_error", (err) => {
    debugLog(`Reconnect error: ${err.message}`, "error");
  });

  socket.io?.on("reconnect_failed", () => {
    debugLog("Reconnect failed after all attempts", "error");
  });

  socket.io?.on("reconnect", (attemptNumber) => {
    debugLog(`Reconnected after ${attemptNumber} attempts`, "success");
  });

  // Engine events if available
  if (socket.io?.engine) {
    try {
      // Transport details
      debugLog(`Initial transport: ${socket.io.engine.transport.name}`, "info");

      // Engine events
      socket.io.engine.on("upgrade", (transport) => {
        debugLog(`Transport upgraded to: ${transport.name}`, "info");
      });

      socket.io.engine.on("upgradeError", (err) => {
        debugLog(`Transport upgrade error: ${err.message}`, "error");
      });

      socket.io.engine.on("error", (err) => {
        debugLog(`Engine error: ${err.message}`, "error");
      });
    } catch (err) {
      debugLog(
        `Error setting up engine event tracking: ${err.message}`,
        "error"
      );
    }
  } else {
    debugLog(
      "Engine object not available for detailed transport debugging",
      "warning"
    );
  }

  // Game-specific events
  const gameEvents = [
    "connectionAck",
    "existingPlayers",
    "playerJoined",
    "playerLeft",
    "hostAssigned",
  ];
  gameEvents.forEach((event) => {
    socket.on(event, (data) => {
      debugLog(`Game event: ${event}`, "info");
      console.log(`Game event data [${event}]:`, data);
    });
  });
}

export class MultiplayerManager {
  constructor(scene, modelLoader, soundManager) {
    debugLog("MultiplayerManager initialized");
    this.scene = scene;
    this.socket = null;
    this.remotePlayersMap = new Map(); // Store other players by id
    this.localPlayer = null;
    this.modelLoader = modelLoader;
    this.soundManager = soundManager;
    this.updateInterval = null;
    this.playerName = "Player"; // Default name
    this.isHost = false; // Will be set to true if this client is the host
    this.gameRef = null; // Reference to main game instance
    this.isConnected = false; // Track connection state
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 5;

    // Debug helpers
    this.debugEnabled = true;
    this.showDebugObjects = false; // Disable debug objects to hide the blue spheres at player feet
    this.debugObjects = []; // Store debug objects

    // Create debug text on screen
    this.createDebugOverlay();

    // Set up periodic debugging to track state
    setInterval(() => {
      this.debugState();
    }, 5000);

    // Log environment
    debugLog(`Current origin: ${window.location.origin}`);
    debugLog(`Protocol: ${window.location.protocol}`);
    debugLog(`Host: ${window.location.host}`);

    // Preload Socket.IO
    loadSocketIO()
      .then(() => {
        debugLog("Socket.IO preloaded successfully", "success");
      })
      .catch((err) => {
        debugLog(`Failed to preload Socket.IO: ${err.message}`, "error");
      });

    // Clear any existing debug objects
    this.clearDebugObjects();
  }

  // Create on-screen debug text overlay for multiplayer info
  createDebugOverlay() {
    this.debugOverlay = document.createElement("div");
    this.debugOverlay.style.position = "absolute";
    this.debugOverlay.style.bottom = "10px";
    this.debugOverlay.style.right = "10px";
    this.debugOverlay.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
    this.debugOverlay.style.color = "white";
    this.debugOverlay.style.padding = "10px";
    this.debugOverlay.style.fontFamily = "monospace";
    this.debugOverlay.style.fontSize = "12px";
    this.debugOverlay.style.maxWidth = "400px";
    this.debugOverlay.style.maxHeight = "200px";
    this.debugOverlay.style.overflow = "auto";
    this.debugOverlay.style.zIndex = "1000";
    this.debugOverlay.style.borderRadius = "5px";
    this.debugOverlay.id = "multiplayer-debug";
    this.debugOverlay.innerHTML = "Multiplayer: Disconnected";
    document.body.appendChild(this.debugOverlay);
  }

  // Update debug overlay with current state
  updateDebugOverlay() {
    if (!this.debugOverlay) return;

    let html = `<b>Multiplayer Status:</b> ${
      this.isConnected ? "Connected" : "Disconnected"
    }<br>`;

    if (this.socket) {
      html += `<b>Socket Ready:</b> ${this.socket ? "Yes" : "No"}<br>`;
      html += `<b>Connected:</b> ${this.socket.connected ? "Yes" : "No"}<br>`;
      html += `<b>Transport:</b> ${
        this.socket.io?.engine?.transport?.name || "N/A"
      }<br>`;
    }

    html += `<b>Your ID:</b> ${this.socket?.id || "N/A"}<br>`;
    html += `<b>Your Name:</b> ${this.playerName}<br>`;
    html += `<b>Host:</b> ${this.isHost ? "Yes (You)" : "No"}<br>`;
    html += `<b>Connection Attempts:</b> ${this.connectionAttempts}/${this.maxConnectionAttempts}<br>`;

    // Show player position with accurate source
    const playerPos =
      this.localPlayer?.group?.position || this.localPlayer?.position;
    html += `<b>Your Position:</b> ${
      playerPos
        ? `X:${playerPos.x.toFixed(2)}, 
           Y:${playerPos.y.toFixed(2)}, 
           Z:${playerPos.z.toFixed(2)}`
        : "N/A"
    }<br>`;

    html += `<b>Remote Players (${this.remotePlayersMap.size}):</b><br>`;
    this.remotePlayersMap.forEach((data, id) => {
      const pos = data.player?.group?.position;
      if (pos) {
        html += `- ${id.substring(0, 6)}... (${data.name || "Unknown"}) (${
          pos
            ? `X:${pos.x.toFixed(2)}, 
               Y:${pos.y.toFixed(2)}, 
               Z:${pos.z.toFixed(2)}`
            : "N/A"
        })<br>`;
      }
    });

    this.debugOverlay.innerHTML = html;
  }

  // Clear debug objects from scene
  clearDebugObjects() {
    this.debugObjects.forEach((obj) => {
      this.scene.remove(obj);
    });
    this.debugObjects = [];
  }

  // Add debug sphere at position
  addDebugSphere(position, color = 0xff0000, size = 0.5) {
    if (!this.showDebugObjects) return;

    const geometry = new THREE.SphereGeometry(size, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.copy(position);
    this.scene.add(sphere);
    this.debugObjects.push(sphere);
    return sphere;
  }

  debug(message) {
    if (this.debugEnabled) {
      debugLog(message);
    }
  }

  // Set game reference to access game entities
  setGameReference(game) {
    this.gameRef = game;
  }

  // Initialize connection to the server
  connect(localPlayer) {
    this.localPlayer = localPlayer;
    debugLog("[DEBUG] connect() called with localPlayer", "info");
    debugLog("[DEBUG] Browser URL: " + window.location.href, "info");
    debugLog("[DEBUG] Origin: " + window.location.origin, "info");
    debugLog("[DEBUG] Protocol: " + window.location.protocol, "info");
    debugLog("[DEBUG] Hostname: " + window.location.hostname, "info");
    debugLog("[DEBUG] Port: " + window.location.port, "info");

    // First check if we are already using a public URL
    if (
      window.location.hostname.includes("ngrok") ||
      window.location.hostname.includes("ngrok-free")
    ) {
      this.showConnectionStatus(
        "Using public server at " + window.location.origin,
        "info"
      );
    }
    // Check if server has a public URL and show it to the user
    else if (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    ) {
      fetch("http://localhost:3000/public-url")
        .then((response) => response.json())
        .then((data) => {
          if (data && data.url) {
            this.showConnectionStatus(
              "Public server available at: " + data.url,
              "success"
            );
            // Create a clickable link for sharing
            let statusElement = document.getElementById("connection-status");
            if (statusElement) {
              // Enhance the status with a QR code and share button
              statusElement.innerHTML = `
                <div style="text-align: center; margin-bottom: 10px;">
                  <strong>Public server available!</strong>
                </div>
                <div>Share this link with friends:</div>
                <div style="margin: 10px 0; word-break: break-all;">
                  <a href="${data.url}" target="_blank" style="color: #4CAF50;">${data.url}</a>
                </div>
                <div style="margin-top: 10px;">
                  <button id="copy-url-btn" style="padding: 5px 10px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Copy Link
                  </button>
                </div>
              `;

              // Add click handler for the copy button
              setTimeout(() => {
                const copyBtn = document.getElementById("copy-url-btn");
                if (copyBtn) {
                  copyBtn.addEventListener("click", () => {
                    navigator.clipboard.writeText(data.url).then(() => {
                      copyBtn.textContent = "Copied!";
                      setTimeout(() => {
                        copyBtn.textContent = "Copy Link";
                      }, 2000);
                    });
                  });
                }
              }, 100);

              // Don't automatically hide this message
              return;
            }
          }
        })
        .catch((err) => {
          debugLog(
            `[DEBUG] Error checking for public URL: ${err.message}`,
            "warning"
          );
        });
    }

    // Get player name (can be customized)
    this.playerName = prompt("Enter your name:", "Player") || "Player";
    debugLog(`Player name set to: ${this.playerName}`);

    // Force reset player position to center spawn point (0,0,0)
    this.localPlayer.group.position.set(0, 0, 0);

    this.debug("Connecting to server...");
    debugLog("[DEBUG] Beginning connection process", "info");
    console.log("[Multiplayer] Local player:", this.localPlayer);

    // Create debug sphere at player position
    this.addDebugSphere(this.localPlayer.group.position, 0x0000ff, 0.5);

    // Show connection status to user
    this.showConnectionStatus("Connecting to server...", "info");

    // Clean up any existing socket connection
    this.cleanupSocket();

    // Make sure Socket.IO is loaded
    loadSocketIO()
      .then((ioInstance) => {
        debugLog(
          "[DEBUG] Socket.IO loaded successfully, connecting now",
          "success"
        );
        this.connectToServer(ioInstance);
      })
      .catch((err) => {
        debugLog(`[DEBUG] Failed to load Socket.IO: ${err.message}`, "error");
        this.showConnectionStatus(
          "Failed to load Socket.IO. Please refresh the page.",
          "error"
        );
      });
  }

  // Connect to server using a simpler, more direct approach
  connectToServer(ioInstance) {
    this.connectionAttempts++;

    debugLog(
      `[DEBUG] Connection attempt ${this.connectionAttempts}/${this.maxConnectionAttempts}`,
      "info"
    );

    // Use a simple, direct connection approach first
    try {
      // When connecting through ngrok, we need to use the current origin
      // but let Socket.IO use its own path (/socket.io) which will be proxied
      // by Vite to the actual backend server
      let serverUrl = window.location.origin;

      debugLog(`[DEBUG] Window location: ${window.location.href}`, "info");
      debugLog(`[DEBUG] Using server URL: ${serverUrl}`, "info");

      // Create a very basic connection with minimal options
      const connectionOptions = {
        path: "/socket.io",
        reconnection: true,
        transports: ["websocket", "polling"],
        // Important for working through ngrok
        forceNew: true,
        timeout: 10000,
      };

      debugLog(
        `[DEBUG] Connection options: ${JSON.stringify(connectionOptions)}`,
        "info"
      );

      // Create socket connection
      try {
        debugLog(`[DEBUG] Attempting to create socket to ${serverUrl}`, "info");
        this.socket = ioInstance(serverUrl, connectionOptions);
        debugLog("[DEBUG] Socket created successfully", "success");
      } catch (err) {
        debugLog(`[DEBUG] Error creating socket: ${err.message}`, "error");
        throw err;
      }

      // Set up event tracing
      traceSocketEvents(this.socket);

      // Set up connection events
      this.setupConnectionEvents();

      // Add a timeout if it doesn't connect
      setTimeout(() => {
        if (!this.isConnected) {
          debugLog("[DEBUG] Connection timed out, trying fallback", "warning");
          this.connectFallback(ioInstance);
        }
      }, 5000); // shorter timeout
    } catch (error) {
      debugLog(`[DEBUG] Connection error: ${error.message}`, "error");
      this.connectFallback(ioInstance);
    }
  }

  // Helper method to connect to a specific URL
  connectToUrl(ioInstance, url) {
    debugLog(`[DEBUG] Attempting connection to: ${url}`, "info");

    try {
      // Clean up previous socket if it exists
      this.cleanupSocket();

      // Create connection options
      const connectionOptions = {
        reconnection: true,
        transports: ["websocket", "polling"],
      };

      // Create socket connection
      this.socket = ioInstance(url, connectionOptions);
      debugLog(`[DEBUG] Socket created for URL: ${url}`, "success");

      // Set up event tracing
      traceSocketEvents(this.socket);

      // Set up connection events
      this.setupConnectionEvents();
    } catch (err) {
      debugLog(`[DEBUG] Error connecting to ${url}: ${err.message}`, "error");
    }
  }

  // Fallback connection approach
  connectFallback(ioInstance) {
    try {
      debugLog("[DEBUG] Trying fallback connection approach", "info");

      // Clean up previous socket
      this.cleanupSocket();

      // Try to connect directly to the socket.io path
      const directUrl = `${window.location.origin}/socket.io`;
      debugLog("[DEBUG] Trying direct socket.io path: " + directUrl, "info");

      try {
        this.socket = ioInstance(window.location.origin, {
          path: "/socket.io",
          reconnection: true,
          transports: ["polling", "websocket"], // Try polling first
          timeout: 15000,
          forceNew: true,
        });
        debugLog("[DEBUG] Created fallback socket connection", "success");
      } catch (err) {
        debugLog(`[DEBUG] Error creating fallback socket: ${err}`, "error");
        throw err;
      }

      // Set up event tracing
      traceSocketEvents(this.socket);

      // Set up connection events again
      this.setupConnectionEvents();

      // Final status check
      setTimeout(() => {
        debugLog(
          `[DEBUG] Fallback connection status after 4s: ${
            this.isConnected ? "Connected" : "Failed"
          }`,
          "info"
        );

        if (!this.isConnected) {
          debugLog("[DEBUG] All connection approaches failed", "error");
          this.showConnectionStatus(
            "Cannot connect to the server. Verify the server is running.",
            "error"
          );
        }
      }, 4000);
    } catch (error) {
      debugLog(`[DEBUG] Fatal connection error: ${error.message}`, "error");
      this.showConnectionStatus(
        "Connection failed. Please check if the server is running.",
        "error"
      );
    }
  }

  // Clean up existing socket connection
  cleanupSocket() {
    if (this.socket) {
      debugLog("Cleaning up previous socket connection", "info");
      try {
        this.socket.disconnect();
        this.socket.removeAllListeners();
      } catch (err) {
        debugLog(`Error cleaning up socket: ${err.message}`, "error");
      }
      this.socket = null;
    }
  }

  // Handle showing connection status to user
  showConnectionStatus(message, type = "info") {
    debugLog(`Status: ${message}`, type);

    // Create or update connection status element
    let statusElement = document.getElementById("connection-status");
    if (!statusElement) {
      statusElement = document.createElement("div");
      statusElement.id = "connection-status";
      statusElement.style.position = "absolute";
      statusElement.style.top = "50%"; // Center vertically
      statusElement.style.left = "50%";
      statusElement.style.transform = "translate(-50%, -50%)";
      statusElement.style.padding = "15px 20px";
      statusElement.style.backgroundColor = "rgba(0,0,0,0.8)";
      statusElement.style.color = "white";
      statusElement.style.borderRadius = "8px";
      statusElement.style.zIndex = "2000";
      statusElement.style.fontFamily = "Arial, sans-serif";
      document.body.appendChild(statusElement);
    }

    // Set color based on status type
    switch (type) {
      case "error":
        statusElement.style.borderLeft = "4px solid #f44336";
        break;
      case "success":
        statusElement.style.borderLeft = "4px solid #4CAF50";
        break;
      case "warning":
        statusElement.style.borderLeft = "4px solid #ff9800";
        break;
      default:
        statusElement.style.borderLeft = "4px solid #2196F3";
    }

    // Set message and show
    statusElement.textContent = message;
    statusElement.style.display = "block";

    // Hide after a delay for non-error messages
    if (type !== "error") {
      setTimeout(() => {
        statusElement.style.opacity = "0";
        statusElement.style.transition = "opacity 0.5s ease";
        setTimeout(() => {
          statusElement.style.display = "none";
          statusElement.style.opacity = "1";
        }, 500);
      }, 3000);
    }
  }

  // Setup socket connection event handlers
  setupConnectionEvents() {
    if (!this.socket) {
      debugLog("[DEBUG] Cannot setup events - socket is null", "error");
      return;
    }

    debugLog("[DEBUG] Setting up connection events", "info");

    // Handle socket connect event
    this.socket.on("connect", () => {
      debugLog(
        `[DEBUG] Connected to server with ID: ${this.socket.id}`,
        "success"
      );
      debugLog(
        `[DEBUG] Transport type: ${
          this.socket.io?.engine?.transport?.name || "unknown"
        }`,
        "info"
      );
      this.isConnected = true;
      this.showConnectionStatus("Connected to server!", "success");

      // Update debug overlay
      this.updateDebugOverlay();

      // Set up game-specific event handlers
      this.setupGameEvents();

      // Start sending updates
      this.startSendingUpdates();

      // Join the game by sending player data
      debugLog("[DEBUG] Sending join event with player data", "info");
      const playerData = {
        name: this.playerName,
        position: {
          x: this.localPlayer.group.position.x,
          y: this.localPlayer.group.position.y,
          z: this.localPlayer.group.position.z,
        },
        rotation: {
          y: this.localPlayer.group.rotation.y,
        },
      };
      debugLog(`[DEBUG] Player data: ${JSON.stringify(playerData)}`, "info");
      this.socket.emit("join", playerData);
    });

    // Handle connection acknowledgment
    this.socket.on("connectionAck", (data) => {
      debugLog(
        `[DEBUG] Connection acknowledged by server: ${data.message}, ID: ${data.id}`,
        "success"
      );
    });

    // Handle disconnect
    this.socket.on("disconnect", (reason) => {
      debugLog(
        `[DEBUG] Disconnected from server. Reason: ${reason}`,
        "warning"
      );
      this.isConnected = false;
      this.showConnectionStatus(
        `Disconnected: ${reason}. Attempting to reconnect...`,
        "warning"
      );
      this.updateDebugOverlay();

      // Stop sending updates
      this.stopSendingUpdates();

      // Clear remote players from scene
      this.clearRemotePlayers();
    });

    // Handle reconnect
    this.socket.on("reconnect", (attemptNumber) => {
      debugLog(
        `[DEBUG] Reconnected to server after ${attemptNumber} attempts`,
        "success"
      );
      this.showConnectionStatus("Reconnected to server!", "success");

      // Update state
      this.isConnected = true;
      this.updateDebugOverlay();

      // Rejoin the game
      if (this.localPlayer) {
        this.socket.emit("join", {
          name: this.playerName,
          position: {
            x: this.localPlayer.group.position.x,
            y: this.localPlayer.group.position.y,
            z: this.localPlayer.group.position.z,
          },
          rotation: {
            y: this.localPlayer.group.rotation.y,
          },
        });
      }
    });

    // Handle connection error
    this.socket.on("connect_error", (error) => {
      debugLog(`[DEBUG] Connection error: ${error.message}`, "error");
      debugLog(`[DEBUG] Error details: ${JSON.stringify(error)}`, "error");
      this.showConnectionStatus(`Connection error: ${error.message}`, "error");
      this.updateDebugOverlay();
    });

    // Handle ping timeout
    this.socket.on("ping_timeout", () => {
      debugLog("[DEBUG] Connection timed out", "warning");
      this.showConnectionStatus(
        "Connection timed out. Trying to reconnect...",
        "warning"
      );
    });

    // Log all events for debugging
    this.socket.onAny((event, ...args) => {
      debugLog(`[DEBUG] Received event "${event}"`, "info");
      if (event !== "playerMoved") {
        // Don't log movement events as they're too frequent
        console.log(`[Socket Event] ${event}:`, args);
      }
    });
  }

  // Setup game-specific events
  setupGameEvents() {
    if (!this.socket) return;

    // Server acknowledgment
    this.socket.on("connectionAck", (data) => {
      this.debug(`Connection acknowledged by server: ${data.id}`);
      console.log(`[Multiplayer] Connection acknowledged by server:`, data);
    });

    // Existing players
    this.socket.on("existingPlayers", (players) => {
      this.debug(`Received ${players.length} existing players`);
      console.log(`[Multiplayer] Received existing players:`, players);

      this.clearRemotePlayers();

      players.forEach((playerData) => {
        this.addRemotePlayer(playerData);
      });

      this.updateDebugOverlay();
    });

    // Player joined
    this.socket.on("playerJoined", (playerData) => {
      this.debug(`Player joined: ${playerData.id} (${playerData.name})`);
      console.log(`[Multiplayer] Player joined:`, playerData);
      this.addRemotePlayer(playerData);
      this.updateDebugOverlay();
    });

    // Player moved
    this.socket.on("playerMoved", (data) => {
      this.updateRemotePlayer(data);
      if (Math.random() < 0.05) this.updateDebugOverlay();
    });

    // Player left
    this.socket.on("playerLeft", (playerId) => {
      this.debug(`Player left: ${playerId}`);
      console.log(`[Multiplayer] Player left: ${playerId}`);
      this.removeRemotePlayer(playerId);
      this.updateDebugOverlay();
    });

    // Game state
    this.socket.on("gameState", (gameState) => {
      this.debug("Received game state");
      console.log("[Multiplayer] Received game state:", gameState);

      if (!this.isHost && this.gameRef) {
        this.updateLocalGameEntities(gameState);
      }
    });

    // Game state update
    this.socket.on("gameStateUpdate", (gameState) => {
      if (!this.isHost && this.gameRef) {
        this.updateLocalGameEntities(gameState);
      }
    });

    // Host assignment
    this.socket.on("hostAssigned", (data) => {
      this.debug("You are now the host!");
      console.log("[Multiplayer] You are now the host:", data);
      this.isHost = true;
      this.updateDebugOverlay();
      this.startSendingGameEntityUpdates();
    });
  }

  // Clear all remote players
  clearRemotePlayers() {
    this.debug(`Clearing ${this.remotePlayersMap.size} remote players`);

    this.remotePlayersMap.forEach((data, id) => {
      if (data.player && data.player.group) {
        this.scene.remove(data.player.group);
      }
    });

    this.remotePlayersMap.clear();
    this.updateDebugOverlay();
  }

  // Add a player who joined the game
  async addRemotePlayer(playerData) {
    if (this.remotePlayersMap.has(playerData.id)) {
      this.debug(`Player already exists: ${playerData.id}`);

      // Update the existing player's position
      const existingData = this.remotePlayersMap.get(playerData.id);
      if (existingData && existingData.player && existingData.player.group) {
        const position = playerData.position || { x: 0, y: 0, z: 0 };
        existingData.player.group.position.set(
          position.x,
          position.y,
          position.z
        );
        existingData.player.group.rotation.y = playerData.rotation?.y || 0;
        this.debug(`Updated existing player position: ${playerData.id}`);
      }

      return;
    }

    this.debug(`Adding remote player: ${playerData.id} (${playerData.name})`);

    // Create a placeholder immediately visible
    const placeholderGroup = new THREE.Group();
    this.scene.add(placeholderGroup);

    // Add HIGHLY VISIBLE placeholder for the player
    // Create a taller box for better visibility
    const cubeGeometry = new THREE.BoxGeometry(1.5, 3, 1.5);
    const cubeMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      wireframe: false,
      transparent: true,
      opacity: 0.8,
    });
    const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    cube.position.set(0, 1.5, 0); // Move up to be more visible
    placeholderGroup.add(cube);

    // Add a vertical beam of light for extra visibility
    const beamGeometry = new THREE.CylinderGeometry(0.1, 0.1, 50, 8);
    const beamMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.3,
    });
    const beam = new THREE.Mesh(beamGeometry, beamMaterial);
    beam.position.set(0, 25, 0); // Position in the middle of the beam
    placeholderGroup.add(beam);

    // Add a flashing animation to make it more visible
    const flashInterval = setInterval(() => {
      if (cubeMaterial.opacity > 0.2) {
        cubeMaterial.opacity = 0.2;
      } else {
        cubeMaterial.opacity = 0.8;
      }
    }, 500);

    // Position placeholder at the correct position
    const position = playerData.position || { x: 0, y: 0, z: 0 };
    placeholderGroup.position.set(position.x, position.y, position.z);
    placeholderGroup.rotation.y = playerData.rotation?.y || 0;

    // Log position with exact coordinates
    this.debug(
      `Remote player position: X:${position.x.toFixed(
        4
      )}, Y:${position.y.toFixed(4)}, Z:${position.z.toFixed(4)}`
    );

    // Add name label above placeholder (make it larger and more visible)
    const nameLabel = this.createNameLabel(playerData.name || "Unknown Player");
    placeholderGroup.add(nameLabel);
    nameLabel.position.set(0, 4, 0); // Position higher up
    nameLabel.scale.set(3, 1, 1); // Make it larger

    // Generate player color
    const playerColors = [
      0xff0000, // red
      0x00ff00, // green
      0x0000ff, // blue
      0xffff00, // yellow
      0xff00ff, // magenta
      0x00ffff, // cyan
      0xff8000, // orange
    ];
    const colorIndex =
      parseInt(playerData.id.substr(-3), 16) % playerColors.length;
    const color = playerData.color || playerColors[colorIndex];
    cube.material.color.setHex(color);
    beam.material.color.setHex(color);

    // Store remote player with placeholder
    this.remotePlayersMap.set(playerData.id, {
      id: playerData.id,
      player: {
        group: placeholderGroup,
        position: placeholderGroup.position,
        isMoving: false,
        update: () => {}, // No-op update function
      },
      nameLabel: nameLabel,
      color: color,
      lastUpdate: Date.now(),
      isHost: playerData.isHost || false,
      isPlaceholder: true,
    });

    this.updateDebugOverlay();

    // Start loading actual player model in the background
    this.loadRemotePlayerModel(playerData);
  }

  // Load remote player model asynchronously
  async loadRemotePlayerModel(playerData) {
    try {
      // Create a new player instance for the remote player
      const remotePlayer = new Player(
        this.scene,
        this.soundManager,
        this.modelLoader
      );

      // Wait for model to load
      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (remotePlayer.model) {
            this.debug(`Model loaded for ${playerData.id}`);
            clearInterval(checkInterval);
            resolve();
          }
        }, 500);

        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, 10000);
      });

      // If player is no longer in the map, don't update
      if (!this.remotePlayersMap.has(playerData.id)) {
        this.debug(`Player ${playerData.id} left during model loading`);
        return;
      }

      const currentData = this.remotePlayersMap.get(playerData.id);

      // Get the current position (may have been updated during loading)
      const currentPosition = currentData.player.group.position.clone();
      const currentRotation = currentData.player.group.rotation.y;

      // Position the new model
      remotePlayer.group.position.copy(currentPosition);
      remotePlayer.group.rotation.y = currentRotation;

      // Add name label
      const newNameLabel = this.createNameLabel(playerData.name);
      remotePlayer.group.add(newNameLabel);
      newNameLabel.position.set(0, 4, 0); // Position higher up
      newNameLabel.scale.set(3, 1, 1); // Make it larger

      // Set color
      this.setRemotePlayerColor(remotePlayer, {
        id: playerData.id,
        color: currentData.color,
      });

      // Add a beam of light above the player (for visibility even with model)
      const beamGeometry = new THREE.CylinderGeometry(0.1, 0.1, 50, 8);
      const beamMaterial = new THREE.MeshBasicMaterial({
        color: currentData.color,
        transparent: true,
        opacity: 0.3,
      });
      const beam = new THREE.Mesh(beamGeometry, beamMaterial);
      beam.position.set(0, 25, 0);
      remotePlayer.group.add(beam);

      // Remove placeholder
      this.scene.remove(currentData.player.group);

      // Update map entry
      this.remotePlayersMap.set(playerData.id, {
        id: playerData.id,
        player: remotePlayer,
        nameLabel: newNameLabel,
        color: currentData.color,
        lastUpdate: Date.now(),
        isHost: playerData.isHost || false,
        isPlaceholder: false,
      });

      this.debug(`Remote player model replaced for ${playerData.id}`);
      this.updateDebugOverlay();
    } catch (error) {
      this.debug(`Error loading player model: ${error.message}`);
    }
  }

  // Update remote player position and rotation
  updateRemotePlayer(data) {
    const remotePlayerData = this.remotePlayersMap.get(data.id);
    if (!remotePlayerData) {
      this.debug(`Received update for unknown player: ${data.id}`);
      return;
    }

    const remotePlayer = remotePlayerData.player;
    const newPosition = new THREE.Vector3(
      data.position.x,
      data.position.y,
      data.position.z
    );

    // Log position updates with exact coordinates
    this.debug(
      `Updating player ${data.id} position to X:${newPosition.x.toFixed(
        4
      )}, Y:${newPosition.y.toFixed(4)}, Z:${newPosition.z.toFixed(4)}`
    );

    // Update position
    remotePlayer.group.position.copy(newPosition);

    // Update rotation
    remotePlayer.group.rotation.y = data.rotation.y;

    // Mark as moving to play animation if not a placeholder
    if (!remotePlayerData.isPlaceholder) {
      remotePlayer.isMoving = true;
    }

    // Update last update time
    remotePlayerData.lastUpdate = Date.now();

    // Update debug overlay occasionally (not on every update to avoid performance issues)
    if (Math.random() < 0.1) {
      this.updateDebugOverlay();
    }
  }

  // Remove a player who left the game
  removeRemotePlayer(playerId) {
    const remotePlayerData = this.remotePlayersMap.get(playerId);
    if (!remotePlayerData) return;

    // Remove player from scene
    if (remotePlayerData.player && remotePlayerData.player.group) {
      this.scene.remove(remotePlayerData.player.group);
    }

    // Remove from map
    this.remotePlayersMap.delete(playerId);

    this.debug(`Player removed: ${playerId}`);
    this.updateDebugOverlay();
  }

  // Start sending position and rotation updates to server
  startSendingUpdates() {
    debugLog("[DEBUG] Starting to send player updates", "info");

    // Make sure we don't have multiple intervals
    this.stopSendingUpdates();

    // Setup interval to send player position updates
    const updateRate = 50; // 50ms = 20 updates per second
    this.updateInterval = setInterval(() => {
      if (this.socket && this.socket.connected && this.localPlayer) {
        // Get position and rotation data from player
        const position = this.localPlayer.group.position;
        const rotation = {
          y: this.localPlayer.group.rotation.y,
        };

        // Track if position has changed since last update
        const hasChanged =
          !this.lastSentPosition ||
          this.lastSentPosition.x !== position.x ||
          this.lastSentPosition.y !== position.y ||
          this.lastSentPosition.z !== position.z ||
          this.lastSentRotation?.y !== rotation.y;

        // Only send update if position/rotation changed
        if (hasChanged) {
          const updateData = {
            position: {
              x: position.x,
              y: position.y,
              z: position.z,
            },
            rotation: rotation,
          };

          // Send update to server
          try {
            this.socket.emit("playerUpdate", updateData);

            // Store last sent position for comparison
            this.lastSentPosition = { ...updateData.position };
            this.lastSentRotation = { ...updateData.rotation };

            // Log updates occasionally (1% of updates)
            if (Math.random() < 0.01) {
              debugLog(
                `[DEBUG] Sent position update: ${JSON.stringify(updateData)}`,
                "info"
              );
            }
          } catch (error) {
            debugLog(
              `[DEBUG] Error sending player update: ${error.message}`,
              "error"
            );
          }
        }
      } else if (!this.socket || !this.socket.connected) {
        debugLog("[DEBUG] Socket not connected, stopping updates", "warning");
        this.stopSendingUpdates();
      }
    }, updateRate);

    debugLog(`[DEBUG] Update interval started (${updateRate}ms)`, "success");
  }

  // Stop sending updates
  stopSendingUpdates() {
    if (this.updateInterval) {
      debugLog("[DEBUG] Stopping player updates", "info");
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  // Called by main game loop to handle multiplayer logic
  update(deltaTime) {
    // Update the debug overlay periodically
    this.debugUpdateTimer = (this.debugUpdateTimer || 0) + deltaTime;
    if (this.debugUpdateTimer > 1) {
      // Update debug overlay every second
      this.updateDebugOverlay();
      this.debugUpdateTimer = 0;
    }

    // Check connection status
    if (this.socket && !this.socket.connected && this.isConnected) {
      debugLog("[DEBUG] Socket disconnected unexpectedly", "error");
      this.isConnected = false;
      this.updateDebugOverlay();
    }

    // Debug connection status periodically
    this.connectionDebugTimer = (this.connectionDebugTimer || 0) + deltaTime;
    if (this.connectionDebugTimer > 5) {
      // Every 5 seconds
      if (this.socket) {
        debugLog(
          `[DEBUG] Connection status: ${
            this.socket.connected ? "Connected" : "Disconnected"
          }, ` +
            `Transport: ${
              this.socket.io?.engine?.transport?.name || "unknown"
            }`,
          this.socket.connected ? "success" : "warning"
        );
      }
      this.connectionDebugTimer = 0;
    }
  }

  // Create name label above player
  createNameLabel(name) {
    // Create canvas for text
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = 256;
    canvas.height = 64;

    // Draw background
    context.fillStyle = "rgba(0, 0, 0, 0.7)";
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Draw text
    context.font = "30px Arial";
    context.fillStyle = "white";
    context.textAlign = "center";
    context.fillText(name, canvas.width / 2, canvas.height / 2 + 10);

    // Create sprite with text
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(0, 3, 0); // Position above player's head
    sprite.scale.set(2, 0.5, 1);

    return sprite;
  }

  // Set player model color
  setPlayerColor(player, color) {
    // Do nothing - we're using the new setRemotePlayerColor method instead
  }

  // Start sending game entity updates (only host does this)
  startSendingGameEntityUpdates() {
    if (!this.isHost || !this.gameRef) return;

    // Send updates 5 times per second (less frequent than player position)
    this.gameUpdateInterval = setInterval(() => {
      if (this.socket && this.socket.connected && this.gameRef) {
        // Collect entity data to send
        const entityData = {
          gorilla: this.collectGorillaData(),
          bots: this.collectBotsData(),
        };

        // Send to server
        this.socket.emit("updateGameEntities", entityData);
      }
    }, 200); // 5 times per second
  }

  // Stop sending game entity updates
  stopSendingGameEntityUpdates() {
    if (this.gameUpdateInterval) {
      clearInterval(this.gameUpdateInterval);
      this.gameUpdateInterval = null;
    }
  }

  // Collect data about the gorilla to send
  collectGorillaData() {
    if (!this.gameRef || !this.gameRef.gorilla) return null;

    const gorilla = this.gameRef.gorilla;
    return {
      position: {
        x: gorilla.group.position.x,
        y: gorilla.group.position.y,
        z: gorilla.group.position.z,
      },
      rotation: {
        y: gorilla.group.rotation.y,
      },
      health: gorilla.health,
      maxHealth: gorilla.maxHealth,
      isDead: gorilla.isDead,
    };
  }

  // Collect data about bots to send
  collectBotsData() {
    if (!this.gameRef || !this.gameRef.bots) return [];

    return this.gameRef.bots.map((bot) => ({
      position: {
        x: bot.mesh.position.x,
        y: bot.mesh.position.y,
        z: bot.mesh.position.z,
      },
      rotation: {
        y: bot.mesh.rotation.y,
      },
      health: bot.health,
      maxHealth: bot.maxHealth,
      isDead: bot.isDead,
    }));
  }

  // Update local game entities based on received data
  updateLocalGameEntities(gameState) {
    if (!this.gameRef) return;

    // Update gorilla
    if (gameState.gorilla && this.gameRef.gorilla) {
      const g = this.gameRef.gorilla;
      const receivedG = gameState.gorilla;

      // Update position and rotation
      g.group.position.set(
        receivedG.position.x,
        receivedG.position.y,
        receivedG.position.z
      );
      g.group.rotation.y = receivedG.rotation.y;

      // Update health and state
      g.health = receivedG.health;
      g.maxHealth = receivedG.maxHealth;
      g.isDead = receivedG.isDead;

      // If gorilla is dead but our local version isn't showing as dead
      if (g.isDead && !g.model.visible === false) {
        g.die(); // Trigger death animation/state
      }
    }

    // Update bots
    if (gameState.bots && gameState.bots.length > 0 && this.gameRef.bots) {
      // For simplicity, we just update positions of existing bots
      const botsToUpdate = Math.min(
        gameState.bots.length,
        this.gameRef.bots.length
      );

      for (let i = 0; i < botsToUpdate; i++) {
        const localBot = this.gameRef.bots[i];
        const remoteBot = gameState.bots[i];

        if (localBot && !localBot.isDead) {
          // Update position and rotation
          localBot.mesh.position.set(
            remoteBot.position.x,
            remoteBot.position.y,
            remoteBot.position.z
          );
          localBot.mesh.rotation.y = remoteBot.rotation.y;

          // Update health and state
          localBot.health = remoteBot.health;
          localBot.maxHealth = remoteBot.maxHealth;

          // Handle death state
          if (remoteBot.isDead && !localBot.isDead) {
            localBot.die();
          }
        }
      }
    }
  }

  // Set remote player color with better visibility
  setRemotePlayerColor(remotePlayer, playerData) {
    // Define a set of distinct colors for better visibility
    const playerColors = [
      0xff0000, // red
      0x00ff00, // green
      0x0000ff, // blue
      0xffff00, // yellow
      0xff00ff, // magenta
      0x00ffff, // cyan
      0xff8000, // orange
    ];

    // Generate a consistent color based on player ID
    const colorIndex =
      parseInt(playerData.id.substr(-3), 16) % playerColors.length;
    const color = playerData.color || playerColors[colorIndex];

    // Apply color to placeholder immediately
    if (remotePlayer.mesh && remotePlayer.mesh.material) {
      if (Array.isArray(remotePlayer.mesh.material)) {
        remotePlayer.mesh.material.forEach((mat) => {
          if (mat.color) mat.color.setHex(color);
        });
      } else if (remotePlayer.mesh.material.color) {
        remotePlayer.mesh.material.color.setHex(color);
      }
    }

    // Also apply to any placeholder children
    remotePlayer.group.children.forEach((child) => {
      if (child.isMesh && child.material && child.material.color) {
        child.material.color.setHex(color);
      }
    });

    // Also preemptively set up to apply color to model when it loads
    const applyColorWhenLoaded = () => {
      if (remotePlayer.model) {
        remotePlayer.model.traverse((node) => {
          if (node.isMesh && node.material) {
            if (Array.isArray(node.material)) {
              node.material.forEach((mat) => {
                if (mat.color) {
                  mat.color.setHex(color);
                }
              });
            } else if (node.material.color) {
              node.material.color.setHex(color);
            }
          }
        });
        return true;
      }
      return false;
    };

    // Try to apply now
    if (!applyColorWhenLoaded()) {
      // If not loaded yet, check periodically
      const colorInterval = setInterval(() => {
        if (applyColorWhenLoaded()) {
          clearInterval(colorInterval);
        }
      }, 500);

      // Stop checking after 10 seconds regardless
      setTimeout(() => clearInterval(colorInterval), 10000);
    }
  }

  // Debug current state
  debugState() {
    if (!this.debugEnabled) return;

    this.debug("======= MULTIPLAYER STATE =======");
    this.debug(
      `Connection: ${this.isConnected ? "Connected" : "Disconnected"}`
    );
    this.debug(`Socket ID: ${this.socket?.id || "N/A"}`);
    this.debug(`Player Name: ${this.playerName}`);
    this.debug(`Remote Players: ${this.remotePlayersMap.size}`);

    if (this.remotePlayersMap.size > 0) {
      this.debug("Remote player list:");
      this.remotePlayersMap.forEach((data, id) => {
        const pos = data.player?.group?.position;
        if (pos) {
          this.debug(
            `- ${id.substring(0, 6)}... at (${pos.x.toFixed(
              2
            )}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`
          );
        } else {
          this.debug(`- ${id.substring(0, 6)}... (no position)`);
        }
      });
    }

    this.updateDebugOverlay();
    this.debug("=================================");
  }
}
