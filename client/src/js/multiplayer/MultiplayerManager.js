import * as THREE from "three";
// We'll manually add the script tag instead of importing, as import may be failing with Vite

import { Player } from "../entities/Player.js";
import { Gorilla } from "../entities/Gorilla.js";

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
    "lobbiesList",
    "lobbyJoined",
    "lobbyUpdated",
    "gameStarted",
    "lobbyError",
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
    this.gameEntityUpdateInterval = null; // Renamed for consistency
    this.playerName = "Player"; // Default name
    this.isHost = false; // Will be set to true if this client is the host
    this.isGorilla = false; // Will be set to true if this client is the gorilla
    this.gameRef = null; // Reference to main game instance
    this.isConnected = false; // Track connection state
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 5;
    this.inGame = false; // Track if player is currently in a game
    this.lobbyManager = null; // Reference to the lobby manager
    this.gorillaPlayerId = null; // Store the ID of the player who is the gorilla

    // Debug helpers
    this.debugEnabled = false;
    this.showDebugObjects = false;
    this.debugObjects = [];

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
    if (!this.debugOverlay) {
      this.debugOverlay = document.createElement("div");
      this.debugOverlay.id = "multiplayer-debug";
      this.debugOverlay.style.position = "fixed";
      this.debugOverlay.style.top = "10px";
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
      document.body.appendChild(this.debugOverlay);
    }
  }

  // Show connection status message in UI
  showConnectionStatus(message, type = "info") {
    debugLog(message, type);

    // Update the connection status in UI if available
    const statusMessage = document.getElementById("connection-status-message");
    if (statusMessage) {
      statusMessage.textContent = message;

      // Apply styling based on message type
      switch (type) {
        case "error":
          statusMessage.style.color = "#f44336"; // Red
          break;
        case "success":
          statusMessage.style.color = "#4CAF50"; // Green
          break;
        case "warning":
          statusMessage.style.color = "#ff9800"; // Orange
          break;
        default:
          statusMessage.style.color = "#2196F3"; // Blue
      }
    }

    // Also update debug overlay
    this.updateDebugOverlay();
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
    // Debug spheres disabled to keep visuals clean
    return null; // Return null instead of creating a sphere
  }

  debug(message) {
    if (!this.debugEnabled) return;
    console.log(`[MP] ${message}`);
  }

  // Set game reference to access game entities
  setGameReference(game) {
    this.gameRef = game;
  }

  // Set the lobby manager
  setLobbyManager(lobbyManager) {
    this.lobbyManager = lobbyManager;

    // If we already have a socket, set it in the lobby manager
    if (this.socket && this.lobbyManager) {
      this.lobbyManager.setSocket(this.socket);
    }
  }

  // Connect to multiplayer server
  connect(localPlayer, useLobbies = true) {
    debugLog("Connecting to multiplayer server...");

    if (this.socket?.connected) {
      debugLog("Already connected to server!", "warning");
      this.isConnected = true;
      if (this.onConnected) this.onConnected();
      return;
    }

    this.localPlayer = localPlayer;
    this.isConnected = false;
    this.connectionAttempts = 0;

    // Clear any existing remote players
    this.clearRemotePlayers();

    // Ask for player name if not already set
    if (!this.playerName || this.playerName === "Player") {
      const savedName = localStorage.getItem("playerName");
      if (savedName) {
        this.playerName = savedName;
      } else {
        const name = prompt(
          "Enter your name:",
          "Player" + Math.floor(Math.random() * 1000)
        );
        this.playerName = name || "Player" + Math.floor(Math.random() * 1000);
        try {
          localStorage.setItem("playerName", this.playerName);
        } catch (e) {
          console.warn("Could not save player name to localStorage", e);
        }
      }
    }

    // Load socket.io client library
    this.showConnectionStatus("Loading Socket.IO client...", "info");
    loadSocketIO()
      .then((ioInstance) => {
        debugLog("Socket.IO loaded, connecting to server...");
        this.connectToServer(ioInstance, useLobbies);
      })
      .catch((err) => {
        debugLog(`Failed to load Socket.IO: ${err.message}`, "error");
        this.showConnectionStatus(
          "Failed to load Socket.IO client. Please refresh the page and try again.",
          "error"
        );
      });
  }

  // Connect to server using the loaded Socket.IO instance
  connectToServer(ioInstance, useLobbies = true) {
    debugLog("Trying to connect to server...");
    this.showConnectionStatus("Connecting to server...", "info");

    // First try with explicit URL
    this.connectToUrl(ioInstance, window.location.origin, useLobbies).catch(
      (error) => {
        debugLog(
          `Failed to connect to ${window.location.origin}: ${error.message}`,
          "error"
        );
        this.showConnectionStatus(
          `Connection failed. Trying backup options...`,
          "warning"
        );

        // Then try fallback options
        this.connectFallback(ioInstance, useLobbies);
      }
    );
  }

  // Connect to a specific URL
  connectToUrl(ioInstance, url, useLobbies = true) {
    return new Promise((resolve, reject) => {
      debugLog(`Attempting to connect to: ${url}`);

      try {
        const socket = ioInstance(url, {
          transports: ["websocket", "polling"],
          reconnectionAttempts: 3,
          timeout: 10000,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
        });

        // Set up connection event listeners
        socket.once("connect", () => {
          debugLog(`Successfully connected to ${url}`, "success");
          this.socket = socket;
          this.isConnected = true;

          // Set up socket event listeners
          this.setupConnectionEvents();
          this.setupGameEvents(useLobbies);

          // Add detailed event tracing
          traceSocketEvents(socket);

          // Allow the lobby manager to use this socket if provided
          if (this.lobbyManager && useLobbies) {
            this.lobbyManager.setSocket(socket);
            // Instead of joining game directly, we'll show the lobby screen
            this.lobbyManager.showLobbyScreen();
          } else {
            // Join the game directly if not using lobbies
            this.joinGame();
          }

          // Resolve the promise
          resolve(socket);
        });

        socket.once("connect_error", (error) => {
          debugLog(`Connection error to ${url}: ${error.message}`, "error");
          reject(error);
        });

        socket.once("connect_timeout", () => {
          debugLog(`Connection timeout to ${url}`, "error");
          reject(new Error("Connection timeout"));
        });
      } catch (error) {
        debugLog(`Error creating socket for ${url}: ${error.message}`, "error");
        reject(error);
      }
    });
  }

  // Try fallback connection options
  connectFallback(ioInstance, useLobbies = true) {
    debugLog("Trying fallback connection options...", "info");
    this.connectionAttempts++;

    // Build array of URLs to try in sequence
    const fallbackUrls = [
      "http://localhost:3000",
      window.location.href,
      `${window.location.protocol}//${window.location.hostname}:3000`,
      "https://hen-clear-hornet.ngrok-free.app",
    ];

    // Show status
    this.showConnectionStatus(
      `Connection attempt ${this.connectionAttempts}/${this.maxConnectionAttempts}...`,
      "info"
    );

    // Try each URL in sequence
    const tryNextUrl = (index) => {
      if (
        index >= fallbackUrls.length ||
        this.connectionAttempts > this.maxConnectionAttempts
      ) {
        // All URLs tried or max attempts reached
        this.showConnectionStatus(
          "Failed to connect. Please check your network or try again later.",
          "error"
        );
        return;
      }

      const url = fallbackUrls[index];
      debugLog(`Trying fallback URL: ${url}`, "info");

      this.connectToUrl(ioInstance, url, useLobbies).catch((error) => {
        debugLog(`Failed to connect to ${url}: ${error.message}`, "error");
        this.connectionAttempts++;
        // Try next URL
        tryNextUrl(index + 1);
      });
    };

    // Start with first URL
    tryNextUrl(0);
  }

  // Join game after connection is established
  joinGame() {
    if (!this.socket || !this.isConnected) {
      debugLog("Cannot join game - not connected", "error");
      return;
    }

    debugLog(
      `Joining game as ${this.playerName} ${
        this.isGorilla ? "(Gorilla)" : "(Human)"
      }`
    );
    this.inGame = true;

    try {
      // Handle different player property structures safely
      const playerPosition = { x: 0, y: 0, z: 0 };
      const playerRotation = { y: 0 };

      // Try to get position from group first (most likely structure)
      if (this.localPlayer?.group?.position) {
        playerPosition.x = this.localPlayer.group.position.x || 0;
        playerPosition.y = this.localPlayer.group.position.y || 0;
        playerPosition.z = this.localPlayer.group.position.z || 0;
      }
      // Fall back to direct position if exists
      else if (this.localPlayer?.position) {
        playerPosition.x = this.localPlayer.position.x || 0;
        playerPosition.y = this.localPlayer.position.y || 0;
        playerPosition.z = this.localPlayer.position.z || 0;
      }

      // Try to get rotation from group
      if (this.localPlayer?.group?.rotation) {
        playerRotation.y = this.localPlayer.group.rotation.y || 0;
      }
      // Fall back to direct rotation if exists
      else if (this.localPlayer?.rotation) {
        playerRotation.y = this.localPlayer.rotation.y || 0;
      }

      // Join with player data
      debugLog(
        `Sending join with position: ${JSON.stringify(
          playerPosition
        )}, rotation: ${JSON.stringify(playerRotation)}, isGorilla: ${
          this.isGorilla
        }`
      );

      this.socket.emit("join", {
        name: this.playerName,
        position: playerPosition,
        rotation: playerRotation,
        isGorilla: this.isGorilla, // Add this information for other clients
      });
    } catch (error) {
      debugLog(`Error sending join: ${error.message}`, "error");

      // Send minimal join data as fallback
      this.socket.emit("join", {
        name: this.playerName,
        position: { x: 0, y: 0, z: 0 },
        rotation: { y: 0 },
        isGorilla: this.isGorilla,
      });
    }

    // Start sending position updates
    this.startSendingUpdates();
  }

  // Leave current game
  leaveGame() {
    if (!this.socket || !this.inGame) {
      return;
    }

    debugLog("Leaving game");
    this.inGame = false;

    // Stop sending updates
    this.stopSendingUpdates();

    // Clear remote players
    this.clearRemotePlayers();

    // Emit leave game event
    this.socket.emit("leaveGame");

    // Show lobby screen if lobby manager exists
    if (this.lobbyManager) {
      this.lobbyManager.showLobbyScreen();
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
  setupGameEvents(useLobbies = true) {
    if (!this.socket) {
      debugLog("Cannot setup game events - socket is null", "error");
      return;
    }

    debugLog("Setting up game event listeners");

    if (useLobbies) {
      // These events are handled by the lobby manager
      // The core game events are still needed for when a game starts
    }

    // Existing players in the game
    this.socket.on("existingPlayers", (playersData) => {
      debugLog(`Received ${playersData.length} existing players`);
      playersData.forEach((playerData) => {
        // If this player is the gorilla, mark them
        const isGorilla = playerData.id === this.gorillaPlayerId;
        if (isGorilla) {
          debugLog(`Existing player ${playerData.id} is the gorilla!`, "info");
          playerData.isGorilla = true;
        }
        // Add the player if they don't exist yet
        this.addRemotePlayer(playerData);
      });
    });

    // New player joined
    this.socket.on("playerJoined", (playerData) => {
      debugLog(`New player joined: ${playerData.id} (${playerData.name})`);
      // If this player is the gorilla, mark them
      if (playerData.id === this.gorillaPlayerId) {
        debugLog(`This new player is the gorilla!`, "info");
        playerData.isGorilla = true;
      }
      this.addRemotePlayer(playerData);
    });

    // Player moved
    this.socket.on("playerMoved", (data) => {
      // Update the player's position and rotation
      this.updateRemotePlayer(data);
    });

    // Player left
    this.socket.on("playerLeft", (playerId) => {
      debugLog(`Player left: ${playerId}`);
      this.removeRemotePlayer(playerId);
    });

    // Game state update from host
    this.socket.on("gameStateUpdate", (gameState) => {
      debugLog("Received game state update from host");
      this.updateLocalGameEntities(gameState);
    });

    // IMPORTANT: Add listener for player attack events
    this.socket.on("playerAttacked", (attackData) => {
      debugLog(`Received attack from ${attackData.id}`, "info", attackData);
      this.handleRemotePlayerAttack(attackData);
    });

    // Host assignment
    this.socket.on("hostAssigned", (data) => {
      this.isHost = data.isHost;
      debugLog(
        `Host status: ${
          this.isHost ? "You are the host" : "You are not the host"
        }`
      );

      if (this.isHost) {
        // If we're the host, start sending game entity updates
        this.startSendingGameEntityUpdates();
      } else {
        // If we're not the host, stop sending game entity updates
        this.stopSendingGameEntityUpdates();
      }
    });

    // Game reset
    this.socket.on("resetGame", () => {
      debugLog("Game reset requested by server");
      if (this.gameRef) {
        this.gameRef.restart();
      }
    });

    // Game started
    this.setupGameStartedEvent();

    // Chat messages
    this.socket.on("chatMessage", (messageData) => {
      // Display message in the UI
      if (window.showMessage) {
        // Use sender's name if not from the system
        const senderPrefix = messageData.sender
          ? `${messageData.sender}: `
          : "";
        window.showMessage(
          `${senderPrefix}${messageData.message}`,
          messageData.sender ? "yellow" : "green"
        );
      }
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

    console.log(
      `Adding remote player: ${playerData.id} (${playerData.name})`,
      playerData
    );

    // CRITICAL FIX: Create a temporary but VERY VISIBLE placeholder
    const placeholderGroup = new THREE.Group();
    this.scene.add(placeholderGroup);

    // Add a subtle placeholder box
    const cubeGeometry = new THREE.BoxGeometry(1, 2, 1);
    const cubeMaterial = new THREE.MeshBasicMaterial({
      color: 0x0088ff, // Subtle blue
      wireframe: true, // Just wireframe to be less intrusive
      transparent: true,
      opacity: 0.5, // Semitransparent
    });
    const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    cube.position.set(0, 1, 0); // Lower position
    placeholderGroup.add(cube);

    // CRITICAL FIX: Set position explicitly, with console output for debugging
    if (playerData.position) {
      placeholderGroup.position.set(
        playerData.position.x || 0,
        playerData.position.y || 0,
        playerData.position.z || 0
      );
      console.log(
        `Remote player ${playerData.id} positioned at: (${placeholderGroup.position.x}, ${placeholderGroup.position.y}, ${placeholderGroup.position.z})`
      );
    } else {
      console.warn(
        `No position data for remote player ${playerData.id}, using (0,0,0)`
      );
      placeholderGroup.position.set(0, 0, 0);
    }

    if (playerData.rotation) {
      placeholderGroup.rotation.y = playerData.rotation.y;
    }

    // Create name label with more subtle text
    const nameLabel = this.createNameLabel(
      playerData.name || "Player",
      0x0088ff // Subtle blue
    );
    nameLabel.position.set(0, 2.5, 0);
    nameLabel.scale.set(2, 1, 1); // Smaller scale
    placeholderGroup.add(nameLabel);

    // Add to map
    this.remotePlayersMap.set(playerData.id, {
      id: playerData.id,
      player: {
        group: placeholderGroup,
        model: null,
      },
      nameLabel: nameLabel,
      color: 0x0088ff, // Subtle blue
      lastUpdate: Date.now(),
      isHost: playerData.isHost || false,
      isGorilla: playerData.isGorilla || false,
      name: playerData.name || "Player",
      isPlaceholder: true,
    });

    console.log(
      `Added placeholder for remote player ${playerData.id} at position:`,
      placeholderGroup.position
    );

    // Start loading actual player model in the background
    this.loadRemotePlayerModel(playerData);
  }

  // Load remote player model asynchronously
  async loadRemotePlayerModel(playerData) {
    try {
      console.log(
        `Starting to load model for remote player ${playerData.id}`,
        playerData
      );

      // CRITICAL FIX: Ensure we have the original position before creating a new player
      // Get the original placeholder position
      const currentData = this.remotePlayersMap.get(playerData.id);
      if (!currentData || !currentData.player || !currentData.player.group) {
        console.error(`Cannot find original player data for ${playerData.id}`);
        return;
      }

      const originalPosition = currentData.player.group.position.clone();
      const originalRotation = currentData.player.group.rotation.y;
      console.log(`Original position for ${playerData.id}:`, originalPosition);

      // Check if this player is the gorilla
      const isGorilla =
        playerData.isGorilla || playerData.id === this.gorillaPlayerId;
      console.log(`Remote player ${playerData.id} isGorilla: ${isGorilla}`);

      // Create a new player instance for the remote player
      const remotePlayer = new Player(
        this.scene,
        this.soundManager,
        this.modelLoader
      );

      // Set gorilla flag before loading the model to ensure correct positioning
      if (isGorilla) {
        remotePlayer.isGorilla = true;
        console.log(`Set isGorilla flag for remote player ${playerData.id}`);
      }

      // CRITICAL FIX: Ensure the player group is added to the scene immediately
      this.scene.add(remotePlayer.group);

      // CRITICAL FIX: Set the position immediately
      remotePlayer.group.position.copy(originalPosition);

      // Update rotation, ensuring we use the correct orientation based on player type
      // NOTE: For human player, the model needs to match the corrected orientation we set
      remotePlayer.group.rotation.y = originalRotation;

      console.log(
        `Set remote player position to:`,
        remotePlayer.group.position
      );

      // Wait for model to load with timeout
      console.log(
        `Waiting for model to load for remote player ${playerData.id}`
      );
      let modelLoaded = false;
      await new Promise((resolve) => {
        const startTime = Date.now();
        const checkInterval = setInterval(() => {
          // Check if player is still in the map
          if (!this.remotePlayersMap.has(playerData.id)) {
            console.log(
              `Player ${playerData.id} left during model loading, aborting`
            );
            clearInterval(checkInterval);
            resolve();
            return;
          }

          // Check if model has loaded
          if (remotePlayer.model) {
            console.log(
              `Model loaded successfully for ${playerData.id} after ${
                (Date.now() - startTime) / 1000
              }s`
            );
            clearInterval(checkInterval);
            modelLoaded = true;
            resolve();
            return;
          }

          // Check for timeout (5 seconds)
          if (Date.now() - startTime > 5000) {
            console.warn(
              `Timeout waiting for model to load for ${playerData.id}`
            );
            clearInterval(checkInterval);
            resolve();
          }
        }, 500);
      });

      // CRITICAL FIX: Check if player is still in the map
      if (!this.remotePlayersMap.has(playerData.id)) {
        console.log(
          `Player ${playerData.id} left during model loading - removing remote player`
        );
        this.scene.remove(remotePlayer.group);
        return;
      }

      // CRITICAL FIX: Verify if the model loaded correctly
      if (!modelLoaded || !remotePlayer.model) {
        console.warn(
          `Failed to load model for remote player ${playerData.id} - using enhanced placeholder`
        );
        // Keep the player with the placeholder
      }

      // Add name label
      const newNameLabel = this.createNameLabel(
        playerData.name || currentData.name || "Player"
      );
      remotePlayer.group.add(newNameLabel);
      newNameLabel.position.set(0, 4, 0); // Position higher up

      // CRITICAL FIX: Use a distinct, bright color for remote players
      this.colorRemotePlayer(remotePlayer, playerData.id);

      // Update map entry with the new player, retaining the original data
      this.remotePlayersMap.set(playerData.id, {
        ...currentData,
        id: playerData.id,
        player: remotePlayer,
        nameLabel: newNameLabel,
        lastUpdate: Date.now(),
        isGorilla: isGorilla,
        isPlaceholder: false,
        transformedToGorilla: false,
      });

      // Remove the placeholder after we've updated the map
      // CRITICAL FIX: Only remove the placeholder after successfully replacing it
      if (
        modelLoaded &&
        remotePlayer.model &&
        currentData.player &&
        currentData.player.group
      ) {
        console.log(`Removing placeholder for ${playerData.id}`);
        this.scene.remove(currentData.player.group);
      }

      console.log(`Remote player model replaced for ${playerData.id}`);

      // If this player is the gorilla, transform them
      if (isGorilla) {
        this.debug(
          `Transforming remote player ${playerData.id} to gorilla (after model load)`
        );
        await this.transformRemotePlayerToGorilla(playerData.id);
      }

      this.updateDebugOverlay();

      // CRITICAL FIX: Add debug sphere to show exact position
      this.addDebugSphere(remotePlayer.group.position, 0xff00ff, 0.5);
    } catch (error) {
      console.error(`Error loading player model: ${error.message}`, error);
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

  // Create name label above player with optional color
  createNameLabel(name, colorHex = undefined) {
    // Create canvas for text
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = 256;
    canvas.height = 64;

    // Draw background
    context.fillStyle = colorHex
      ? `rgba(${(colorHex >> 16) & 255}, ${(colorHex >> 8) & 255}, ${
          colorHex & 255
        }, 0.7)`
      : "rgba(0, 0, 0, 0.7)";
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

  // Start sending game entity updates (host only)
  startSendingGameEntityUpdates() {
    if (!this.socket || !this.isHost) return;

    this.debug("Starting to send game entity updates as host");

    // No need to send gorilla and bot updates as they're now human-controlled
    // Just clear the interval if it exists to prevent errors
    if (this.gameEntityUpdateInterval) {
      clearInterval(this.gameEntityUpdateInterval);
      this.gameEntityUpdateInterval = null;
    }
  }

  // Stop sending game entity updates
  stopSendingGameEntityUpdates() {
    if (this.gameEntityUpdateInterval) {
      clearInterval(this.gameEntityUpdateInterval);
      this.gameEntityUpdateInterval = null;
    }
  }

  // Update local game entities based on received data
  updateLocalGameEntities(gameState) {
    // This method is no longer needed as all entities are player-controlled
    // But we keep it to handle any legacy messages
    this.debug("All entities are now player-controlled");
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

  // Game started
  setupGameStartedEvent() {
    if (!this.socket) return;

    this.socket.on("gameStarted", (gameData) => {
      debugLog("Game started event received", "success");
      console.log("Game data:", gameData);

      // We're now in a game
      this.inGame = true;

      // Check if player roles were assigned
      if (gameData.roles && gameData.gorilla) {
        // Store the gorilla player ID globally
        this.gorillaPlayerId = gameData.gorilla.id;
        debugLog(`Gorilla player ID: ${this.gorillaPlayerId}`, "info");

        // Find my role
        const myRole = gameData.roles.find(
          (role) => role.id === this.socket.id
        );

        if (myRole) {
          // Store whether I'm the gorilla
          this.isGorilla = myRole.isGorilla;

          if (this.isGorilla) {
            // I am the gorilla
            debugLog(`You've been assigned as the GORILLA!`, "success");

            // Show message to the player
            if (window.showMessage) {
              window.showMessage(
                "You are the GORILLA! Destroy the humans!",
                "red",
                10000
              );
            }

            // Set the local player as gorilla if the game reference exists
            if (this.gameRef && this.gameRef.player) {
              this.gameRef.player.makeGorilla(this.scene, this.modelLoader);
            }
          } else {
            // I am a human
            debugLog(`You are a human. Watch out for the gorilla!`, "info");

            // Show message to the player
            if (window.showMessage) {
              window.showMessage(
                `${gameData.gorilla.name} is the GORILLA! Run for your life!`,
                "yellow",
                10000
              );
            }
          }
        }

        // Announce the gorilla to all players
        if (window.showMessage) {
          window.showMessage(
            `Game started! ${gameData.gorilla.name} is the gorilla!`,
            "green",
            5000
          );
        }

        // Update any existing remote players who might be the gorilla
        this.updateRemotePlayersWithGorillaRole();
      }

      // Join the game
      this.joinGame();
    });
  }

  // Update remote players with gorilla role
  updateRemotePlayersWithGorillaRole() {
    if (!this.gorillaPlayerId) return;

    // Check all remote players to see if any are the gorilla
    this.remotePlayersMap.forEach((playerData, playerId) => {
      const isGorilla = playerId === this.gorillaPlayerId;

      // Update the isGorilla flag
      playerData.isGorilla = isGorilla;

      if (
        isGorilla &&
        !playerData.isPlaceholder &&
        !playerData.transformedToGorilla
      ) {
        debugLog(
          `Converting remote player ${playerId} to gorilla model`,
          "info"
        );
        this.transformRemotePlayerToGorilla(playerId);
      }
    });
  }

  // Add more visibility helpers for gorilla players
  addGorillaVisibilityMarkers(player) {
    // No visual indicators for clean gameplay
    return null;
  }

  // Transform a remote player to gorilla
  async transformRemotePlayerToGorilla(playerId) {
    const playerData = this.remotePlayersMap.get(playerId);
    if (!playerData || !playerData.player || playerData.transformedToGorilla)
      return;

    debugLog(`Transforming remote player ${playerId} to gorilla`, "info");

    try {
      // Create a new gorilla model
      const remotePlayer = playerData.player;

      // Store current position before transformation
      const currentPosition = remotePlayer.group.position.clone();

      // Mark as transformed to prevent multiple transformations
      playerData.transformedToGorilla = true;

      // Use the Player.makeGorilla method if it's a Player instance
      if (remotePlayer.makeGorilla) {
        await remotePlayer.makeGorilla(this.scene, this.modelLoader);
        debugLog(
          `Remote player ${playerId} transformed to gorilla via Player.makeGorilla`,
          "success"
        );

        // Ensure the gorilla's position is at ground level but keep X/Z coordinates
        remotePlayer.group.position.y = 0;
        remotePlayer.group.position.x = currentPosition.x;
        remotePlayer.group.position.z = currentPosition.z;

        // Add visibility helpers
        this.addGorillaVisibilityMarkers(remotePlayer);

        // Also add a temporary screen indicator
        const gorillaIndicator = document.createElement("div");
        gorillaIndicator.textContent = "🦍 GORILLA PLAYER SPOTTED";
        gorillaIndicator.style.position = "fixed";
        gorillaIndicator.style.top = "60px";
        gorillaIndicator.style.left = "50%";
        gorillaIndicator.style.transform = "translateX(-50%)";
        gorillaIndicator.style.backgroundColor = "rgba(139, 69, 19, 0.8)"; // Match gorilla color
        gorillaIndicator.style.color = "white";
        gorillaIndicator.style.padding = "5px 10px";
        gorillaIndicator.style.borderRadius = "5px";
        gorillaIndicator.style.fontWeight = "bold";
        gorillaIndicator.style.fontSize = "16px";
        gorillaIndicator.style.zIndex = "1000";
        document.body.appendChild(gorillaIndicator);

        // Remove the indicator after 5 seconds
        setTimeout(() => {
          if (gorillaIndicator.parentNode === document.body) {
            document.body.removeChild(gorillaIndicator);
          }
        }, 5000);
      } else {
        // For placeholder players, we'll create a temporary gorilla indicator
        const placeholder = remotePlayer.group;

        // Ensure placeholder is positioned correctly
        placeholder.position.y = 0;

        // Make the placeholder more visible to represent a gorilla
        if (placeholder.children.length > 0) {
          placeholder.children.forEach((child) => {
            if (child.isMesh && child.material) {
              // Make it brown like the gorilla
              child.material.color.setHex(0x8b4513);
              // Scale it to human size
              child.scale.set(1, 1, 1);
            }
          });
        }

        // Add visibility helpers
        this.addGorillaVisibilityMarkers(placeholder);

        debugLog(
          `Remote player ${playerId} will be transformed to gorilla when fully loaded`,
          "info"
        );
      }
    } catch (error) {
      debugLog(
        `Error transforming remote player to gorilla: ${error.message}`,
        "error"
      );
    }
  }

  // Get all other players for combat targeting
  getOtherPlayers() {
    const targets = [];

    // Add all remote players to the targets list
    this.remotePlayersMap.forEach((playerData) => {
      if (playerData.player && !playerData.player.isDead) {
        targets.push(playerData.player);
      }
    });

    // If we have a local player and a game reference with a gorilla,
    // include it as a potential target
    if (
      this.gameRef &&
      this.gameRef.gorilla &&
      this.localPlayer !== this.gameRef.gorilla
    ) {
      targets.push(this.gameRef.gorilla);
    }

    return targets;
  }

  // Send attack event to server
  sendAttackEvent() {
    if (!this.socket || !this.socket.connected) return;

    try {
      const attackData = {
        id: this.socket.id,
        isGorilla: this.isGorilla,
      };

      this.socket.emit("playerAttack", attackData);
      this.debug("Sent attack event to server");
    } catch (error) {
      this.debug(`Error sending attack event: ${error.message}`);
    }
  }

  // Handle a remote player's attack
  handleRemotePlayerAttack(data) {
    this.debug(
      `Received attack from player ${data.id}, isGorilla: ${data.isGorilla}`
    );

    // If this is a network-controlled player attacking
    const remotePlayerData = this.remotePlayersMap.get(data.id);
    if (remotePlayerData && remotePlayerData.player) {
      // Trigger attack animation
      remotePlayerData.player.isAttacking = true;
      remotePlayerData.player.attackTimer =
        remotePlayerData.player.attackDuration || 0.5;
      remotePlayerData.player.updateAnimation();

      // Play attack sound
      if (this.soundManager) {
        const soundEffect = data.isGorilla ? "gorillaAttack" : "humanAttack";
        this.soundManager.play(soundEffect);
      }
    }

    // Check if our local player was hit (simple distance check)
    if (
      this.localPlayer &&
      !this.localPlayer.isDead &&
      !this.localPlayer.isInvulnerable
    ) {
      // Get the attacker's position
      let attackerPosition = null;
      if (remotePlayerData && remotePlayerData.player) {
        attackerPosition = remotePlayerData.player.group.position;
      }

      // If we have attacker position, check if we're in range
      if (attackerPosition) {
        const distance =
          this.localPlayer.group.position.distanceTo(attackerPosition);

        // If in range and facing us, take damage
        if (distance <= (data.isGorilla ? 3 : 2)) {
          // Calculate direction to check if attacker is facing us
          const localPos = this.localPlayer.group.position;
          const attackerPos = attackerPosition;

          // Direction from attacker to us
          const direction = new THREE.Vector3()
            .subVectors(localPos, attackerPos)
            .normalize();

          // Attacker's forward direction - using -Z as forward to match Player class
          const attackerForward = new THREE.Vector3(0, 0, -1).applyAxisAngle(
            new THREE.Vector3(0, 1, 0),
            remotePlayerData.player.group.rotation.y
          );

          // Dot product to check if we're in front of attacker
          const dot = direction.dot(attackerForward);

          // If dot product is positive, we're in front of the attacker
          if (dot > 0.3) {
            this.debug(`Local player hit by ${data.id}! Taking damage...`);

            // Apply damage to local player
            this.localPlayer.onAttacked(data.id, data.isGorilla);

            // Update health bar if available
            if (this.gameRef && this.gameRef.healthBar) {
              this.gameRef.healthBar.setHealth(this.localPlayer.health);
            }
          }
        }
      }
    }
  }

  // Add a new method to color remote players distinctly
  colorRemotePlayer(player, playerId) {
    // Generate a bright, distinct color based on player ID
    const colors = [
      0xff0000, // Red
      0x00ff00, // Green
      0x0000ff, // Blue
      0xff00ff, // Magenta
      0xffff00, // Yellow
      0x00ffff, // Cyan
      0xff8000, // Orange
    ];

    const colorIndex = Math.abs(this.simpleHash(playerId)) % colors.length;
    const color = colors[colorIndex];

    console.log(
      `Coloring remote player ${playerId} with color: ${color.toString(16)}`
    );

    if (player.model) {
      // Apply color to the model
      player.model.traverse((node) => {
        if (node.isMesh && node.material) {
          if (Array.isArray(node.material)) {
            node.material.forEach((mat) => {
              if (mat.color) {
                // Brighten the color
                const r = ((color >> 16) & 255) / 255;
                const g = ((color >> 8) & 255) / 255;
                const b = (color & 255) / 255;
                mat.color.setRGB(r, g, b);
                mat.emissive = new THREE.Color(r / 3, g / 3, b / 3);
              }
            });
          } else if (node.material.color) {
            // Brighten the color
            const r = ((color >> 16) & 255) / 255;
            const g = ((color >> 8) & 255) / 255;
            const b = (color & 255) / 255;
            node.material.color.setRGB(r, g, b);
            node.material.emissive = new THREE.Color(r / 3, g / 3, b / 3);
          }
        }
      });
    }

    // Also apply to any placeholder
    if (player.placeholder) {
      if (player.placeholder.material) {
        player.placeholder.material.color.setHex(color);
        player.placeholder.material.opacity = 0.9;
      }
    }

    // Also color any children of the group that might be meshes
    player.group.traverse((child) => {
      if (child.isMesh && child.material && child.material.color) {
        child.material.color.setHex(color);
        child.material.opacity = 0.9;
      }
    });
  }

  // Implement a simple hash function for consistent colors
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}
