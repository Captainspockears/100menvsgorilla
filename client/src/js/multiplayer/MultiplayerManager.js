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
    this.playerName = "Player"; // Default name
    this.isHost = false; // Will be set to true if this client is the host
    this.gameRef = null; // Reference to main game instance
    this.isConnected = false; // Track connection state
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 5;
    this.inGame = false; // Track if player is currently in a game
    this.lobbyManager = null; // Reference to the lobby manager

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

    debugLog(`Joining game as ${this.playerName}`);
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
        )} and rotation: ${JSON.stringify(playerRotation)}`
      );
      this.socket.emit("join", {
        name: this.playerName,
        position: playerPosition,
        rotation: playerRotation,
      });
    } catch (error) {
      debugLog(`Error sending join: ${error.message}`, "error");

      // Send minimal join data as fallback
      this.socket.emit("join", {
        name: this.playerName,
        position: { x: 0, y: 0, z: 0 },
        rotation: { y: 0 },
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
        this.addRemotePlayer(playerData);
      });
    });

    // New player joined
    this.socket.on("playerJoined", (playerData) => {
      debugLog(`New player joined: ${playerData.name} (${playerData.id})`);
      this.addRemotePlayer(playerData);

      // Trigger callback if defined
      if (this.onPlayerJoined) {
        this.onPlayerJoined(playerData);
      }
    });

    // Player movement update
    this.socket.on("playerMoved", (data) => {
      this.updateRemotePlayer(data);
    });

    // Player left
    this.socket.on("playerLeft", (playerId) => {
      debugLog(`Player left: ${playerId}`);
      this.removeRemotePlayer(playerId);

      // Trigger callback if defined
      if (this.onPlayerLeft) {
        this.onPlayerLeft({ id: playerId });
      }
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

    // Game state update (gorilla, bots positions, etc.)
    this.socket.on("gameStateUpdate", (gameState) => {
      // Skip if we're the host since we're the one sending these updates
      if (this.isHost) return;

      // Update gorilla and bots based on received data
      this.updateLocalGameEntities(gameState);
    });

    // Game reset
    this.socket.on("resetGame", () => {
      debugLog("Game reset requested by server");
      if (this.gameRef) {
        this.gameRef.restart();
      }
    });

    // Game started
    this.socket.on("gameStarted", (gameData) => {
      debugLog("Game started event received", "success");

      // We're now in a game
      this.inGame = true;

      // Join the game
      this.joinGame();
    });

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
