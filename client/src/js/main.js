import * as THREE from "three";
import { Controls } from "./controls/Controls.js";
import { Player } from "./entities/Player.js";
import { Gorilla } from "./entities/Gorilla.js";
import { Environment } from "./entities/Environment.js";
import { SoundManager } from "./utils/SoundManager.js";
import { HealthBar } from "./ui/HealthBar.js";
import { ModelLoader } from "./utils/ModelLoader.js";
import { MultiplayerManager } from "./multiplayer/MultiplayerManager.js";
import { LobbyManager } from "./ui/LobbyManager.js";

// Show message in chat/notification area
export function showMessage(message, color = "white", duration = 5000) {
  // Create message container if not exists
  let messageContainer = document.getElementById("message-container");
  if (!messageContainer) {
    messageContainer = document.createElement("div");
    messageContainer.id = "message-container";
    messageContainer.style.position = "absolute";
    messageContainer.style.bottom = "10px";
    messageContainer.style.left = "10px";
    messageContainer.style.width = "400px";
    messageContainer.style.maxHeight = "200px";
    messageContainer.style.overflow = "auto";
    messageContainer.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    messageContainer.style.padding = "10px";
    messageContainer.style.borderRadius = "5px";
    messageContainer.style.zIndex = "1000";
    document.body.appendChild(messageContainer);
  }

  // Create message element
  const messageElement = document.createElement("div");
  messageElement.textContent = message;
  messageElement.style.color = color;
  messageElement.style.marginBottom = "5px";
  messageElement.style.fontSize = "16px";
  messageElement.style.fontWeight = "bold";
  messageElement.style.textShadow = "1px 1px 2px rgba(0,0,0,0.5)";

  // Add message to container
  messageContainer.appendChild(messageElement);

  // Remove message after duration
  setTimeout(() => {
    if (messageElement.parentNode === messageContainer) {
      messageContainer.removeChild(messageElement);
    }
  }, duration);

  // Remove container if empty
  if (messageContainer.childElementCount === 0) {
    setTimeout(() => {
      if (
        messageContainer.childElementCount === 0 &&
        messageContainer.parentNode
      ) {
        messageContainer.parentNode.removeChild(messageContainer);
      }
    }, duration + 100);
  }
}

// Game class
class Game {
  constructor() {
    // Properties
    this.scene = new THREE.Scene();
    this.renderer = null;
    this.camera = null;
    this.player = null;
    this.soundManager = null;
    this.isInitialized = false;
    this.healthBar = null;
    this.loadingScreen = null;
    this.modelLoader = new ModelLoader();
    this.isSoundInitialized = false;
    this.gameState = "playing"; // 'playing' or 'gameOver'
    this.gameTimer = 0;
    this.multiplayer = null;

    // Create start menu first
    this.createStartMenu();

    // Create message container for chat and notifications
    this.createMessageContainer();

    // Setup sound manager first
    this.soundManager = new SoundManager();
    this.initializeSound();

    // Setup model loader
    this.modelLoader = new ModelLoader();

    // Loading screen
    this.showLoadingScreen();

    // Add lighting to the scene
    this.setupLighting();

    // Add axis helper for debugging
    const axesHelper = new THREE.AxesHelper(5);
    this.scene.add(axesHelper);

    // Add a grid helper for better spatial orientation
    const gridHelper = new THREE.GridHelper(50, 50);
    this.scene.add(gridHelper);

    // Camera with wider field of view and better clipping planes for multiplayer visibility
    this.camera = new THREE.PerspectiveCamera(
      100, // Wider field of view (was 90)
      window.innerWidth / window.innerHeight,
      0.1,
      2000 // Much further draw distance for seeing other players (was 1000)
    );
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    document.body.appendChild(this.renderer.domElement);

    // Clock for handling time-based animations
    this.clock = new THREE.Clock();

    // Create UI
    this.healthBar = new HealthBar();
    this.healthBar.onRestart(() => this.restart());

    // Create lobby manager
    this.lobbyManager = new LobbyManager();

    // Register callbacks for when a game is joined/created
    this.lobbyManager.onJoinGame((lobbyData) => {
      this.onGameJoined(lobbyData);
    });

    // Create game entities
    this.environment = new Environment(this.scene, this.modelLoader);

    // Create player and gorilla with proper model loading
    this.loadGameEntities();

    // Position camera higher and further back for a better view
    this.camera.position.set(0, 10, 15); // Place behind player, along positive Z
    if (this.player) {
      this.camera.lookAt(this.player.position);
    }

    // Setup controls - pass the camera
    this.controls = new Controls(this.player, this.camera);
    // Provide controls with reference to the game instance
    this.controls.game = this;

    // Initialize multiplayer
    this.multiplayer = new MultiplayerManager(
      this.scene,
      this.modelLoader,
      this.soundManager
    );

    // Set lobby manager in multiplayer
    this.multiplayer.setLobbyManager(this.lobbyManager);

    // Provide reference to the game instance
    this.multiplayer.setGameReference(this);

    // Provide player with reference to multiplayer manager
    if (this.player) {
      this.player.multiplayerManager = this.multiplayer;
      console.log(
        "Set player.multiplayerManager =",
        this.player.multiplayerManager ? "instance provided" : "null"
      );
    } else {
      console.log(
        "Warning: Can't set multiplayerManager on player - player is not initialized"
      );
    }

    // Set up additional multiplayer event listeners
    this.setupMultiplayerEvents();

    // Handle window resize
    window.addEventListener("resize", this.onWindowResize.bind(this));

    // Add sound initialization on first user interaction
    document.addEventListener("click", this.initializeSound.bind(this), {
      once: true,
    });
    document.addEventListener("keydown", this.initializeSound.bind(this), {
      once: true,
    });

    // Add cleanup on window close
    window.addEventListener("beforeunload", this.cleanup.bind(this));

    // Start the game loop
    this.animate();

    // Show welcome message
    showMessage(
      "Welcome to 100 Men vs Gorilla! Enter your username and connect to play.",
      "#4CAF50",
      10000
    );
  }

  // Setup additional multiplayer event listeners
  setupMultiplayerEvents() {
    // Wait until multiplayer is ready
    const registerEvents = () => {
      if (!this.multiplayer) {
        setTimeout(registerEvents, 100);
        return;
      }

      // When connected, update UI
      this.multiplayer.onConnected = () => {
        showMessage("Connected to multiplayer server!", "green");
      };

      // When disconnected, update UI
      this.multiplayer.onDisconnected = (reason) => {
        showMessage(`Disconnected: ${reason}`, "red");
      };

      // When another player joins
      this.multiplayer.onPlayerJoined = (player) => {
        showMessage(`${player.name} joined the game!`, "yellow");
      };

      // When a player leaves
      this.multiplayer.onPlayerLeft = (player) => {
        showMessage(`${player.name} left the game`, "orange");
      };
    };

    registerEvents();
  }

  // Handle game joined event
  onGameJoined(gameData) {
    // Hide start menu
    const startMenu = document.getElementById("start-menu");
    if (startMenu) {
      startMenu.style.display = "none";
    }
  }

  setupLighting() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    // Directional light (sun)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 200, 100);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    this.scene.add(directionalLight);

    // Add hemisphere light
    const hemisphereLight = new THREE.HemisphereLight(0x0000ff, 0x00ff00, 0.3);
    this.scene.add(hemisphereLight);
  }

  async loadGameEntities() {
    try {
      // Create player and wait for it to load
      this.player = new Player(this.scene, this.soundManager, this.modelLoader);

      // We no longer create a default gorilla or bots here as they will be controlled by players

      // Remove loading screen after a short delay
      setTimeout(() => {
        this.hideLoadingScreen();
      }, 3000);
    } catch (error) {
      console.error("Error loading game entities:", error);
    }
  }

  showLoadingScreen() {
    this.loadingScreen = document.createElement("div");
    this.loadingScreen.style.position = "fixed";
    this.loadingScreen.style.top = "0";
    this.loadingScreen.style.left = "0";
    this.loadingScreen.style.width = "100%";
    this.loadingScreen.style.height = "100%";
    this.loadingScreen.style.backgroundColor = "#000";
    this.loadingScreen.style.color = "#fff";
    this.loadingScreen.style.display = "flex";
    this.loadingScreen.style.justifyContent = "center";
    this.loadingScreen.style.alignItems = "center";
    this.loadingScreen.style.zIndex = "1000";
    this.loadingScreen.style.fontSize = "24px";
    this.loadingScreen.style.fontFamily = "Arial, sans-serif";
    this.loadingScreen.style.transition = "opacity 0.5s ease";

    // Add loading text
    this.loadingScreen.textContent = "Loading 3D Models...";

    // Add to document
    document.body.appendChild(this.loadingScreen);
  }

  hideLoadingScreen() {
    if (this.loadingScreen) {
      this.loadingScreen.style.opacity = "0";
      setTimeout(() => {
        if (this.loadingScreen && this.loadingScreen.parentNode) {
          document.body.removeChild(this.loadingScreen);
        }
        this.loadingScreen = null;
      }, 500);
    }
  }

  async initializeSound() {
    try {
      await this.soundManager.initialize();
      this.isSoundInitialized = true;

      // Add mute toggle button
      this.addMuteButton();
    } catch (error) {
      console.error("Failed to initialize sound:", error);
    }
  }

  addMuteButton() {
    const muteButton = document.createElement("button");
    muteButton.textContent = "🔊";
    muteButton.style.position = "absolute";
    muteButton.style.top = "10px";
    muteButton.style.right = "10px";
    muteButton.style.padding = "8px 12px";
    muteButton.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    muteButton.style.color = "white";
    muteButton.style.border = "none";
    muteButton.style.borderRadius = "5px";
    muteButton.style.fontSize = "18px";
    muteButton.style.cursor = "pointer";

    muteButton.addEventListener("click", () => {
      const isMuted = this.soundManager.toggleMute();
      muteButton.textContent = isMuted ? "🔇" : "🔊";
    });

    document.body.appendChild(muteButton);
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate() {
    this._animationFrameId = requestAnimationFrame(this.animate.bind(this));

    const deltaTime = this.clock.getDelta();

    // Update entities
    if (this.controls) this.controls.update(deltaTime);
    if (this.player) this.player.update(deltaTime);
    // No more humanBot to update

    // No need to update gorilla and bots, they are controlled by human players now

    // Update multiplayer (remote players)
    if (this.multiplayer) {
      this.multiplayer.update(deltaTime);
    }

    // Update camera position to follow player from behind (over-the-shoulder view)
    if (this.player && !this.player.isDead) {
      // Camera parameters - adjusted for high over-the-shoulder view
      const distance = 4; // Distance behind player
      const height = this.player.isGorilla ? 4.0 : 4.0; // Maintain user's height settings
      const lookAtOffset = this.player.isGorilla ? 2.0 : 2.0; // Add a lookAtOffset to prevent circular motion
      const smoothness = 0.15; // Camera movement smoothness

      // Get the player's rotation and direction
      const playerAngle = this.player.group.rotation.y;

      // Calculate position behind player based on player's rotation
      const offsetX = Math.sin(playerAngle) * distance;
      const offsetZ = Math.cos(playerAngle) * distance;

      // Calculate desired camera position (behind player based on their rotation)
      const cameraPosition = new THREE.Vector3();
      cameraPosition.copy(this.player.position);
      cameraPosition.x -= offsetX;
      cameraPosition.z -= offsetZ;
      cameraPosition.y = this.player.position.y + height;

      // Center the camera directly behind player with no offset
      const shoulderOffset = 0.0; // Remove shoulder offset (was 0.6)
      const rightVector = new THREE.Vector3(
        Math.sin(playerAngle + Math.PI / 2) * shoulderOffset,
        0,
        Math.cos(playerAngle + Math.PI / 2) * shoulderOffset
      );
      cameraPosition.add(rightVector);

      // Smoothly move camera to this position
      this.camera.position.lerp(cameraPosition, smoothness);

      // Look at point ahead of player in the direction they're facing
      const lookAtPosition = new THREE.Vector3();
      lookAtPosition.copy(this.player.position);

      // Look ahead of the player in the direction they're facing
      lookAtPosition.x += Math.sin(playerAngle) * lookAtOffset;
      lookAtPosition.z += Math.cos(playerAngle) * lookAtOffset;
      lookAtPosition.y += 1.0; // Look slightly above ground level

      this.camera.lookAt(lookAtPosition);
    }

    // Render
    this.renderer.render(this.scene, this.camera);
  }

  async restart() {
    // Reset player health
    if (this.player) {
      this.player.health = this.player.maxHealth;
    }

    // Reset game state
    this.gameState = "playing";

    // Reset timer
    this.gameTimer = 0;

    console.log("Game restarted - players maintain their roles");

    // If in multiplayer mode, notify the server about restart
    if (this.multiplayer && this.multiplayer.socket) {
      this.multiplayer.socket.emit("playerReady", {
        id: this.multiplayer.socket.id,
      });
    }
  }

  // Create start menu overlay
  createStartMenu() {
    // Create start menu container
    const startMenu = document.createElement("div");
    startMenu.id = "start-menu";
    startMenu.style.position = "fixed";
    startMenu.style.top = "0";
    startMenu.style.left = "0";
    startMenu.style.width = "100%";
    startMenu.style.height = "100%";
    startMenu.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
    startMenu.style.display = "flex";
    startMenu.style.flexDirection = "column";
    startMenu.style.justifyContent = "center";
    startMenu.style.alignItems = "center";
    startMenu.style.zIndex = "10000";
    startMenu.style.fontFamily = "Arial, sans-serif";
    startMenu.style.color = "white";

    // Create title
    const title = document.createElement("h1");
    title.textContent = "100 Men vs Gorilla";
    title.style.fontSize = "48px";
    title.style.marginBottom = "40px";
    title.style.color = "#ff9800";
    title.style.textShadow = "2px 2px 4px rgba(0, 0, 0, 0.5)";
    startMenu.appendChild(title);

    // Create form container
    const formContainer = document.createElement("div");
    formContainer.style.backgroundColor = "rgba(0, 0, 0, 0.6)";
    formContainer.style.padding = "30px";
    formContainer.style.borderRadius = "10px";
    formContainer.style.width = "400px";
    formContainer.style.textAlign = "center";

    // Create username input
    const usernameLabel = document.createElement("label");
    usernameLabel.textContent = "Your Username:";
    usernameLabel.style.display = "block";
    usernameLabel.style.marginBottom = "10px";
    usernameLabel.style.fontSize = "18px";
    formContainer.appendChild(usernameLabel);

    const usernameInput = document.createElement("input");
    usernameInput.type = "text";
    usernameInput.id = "username-input";
    usernameInput.placeholder = "Enter your username";

    // Try to get saved name
    let savedName;
    try {
      savedName = localStorage.getItem("playerName");
    } catch (e) {
      console.error("Could not load player name from localStorage:", e);
    }

    usernameInput.value =
      savedName || "Player" + Math.floor(Math.random() * 1000);
    usernameInput.style.width = "100%";
    usernameInput.style.padding = "10px";
    usernameInput.style.fontSize = "16px";
    usernameInput.style.marginBottom = "20px";
    usernameInput.style.borderRadius = "5px";
    usernameInput.style.border = "none";
    formContainer.appendChild(usernameInput);

    // Create connect button
    const connectButton = document.createElement("button");
    connectButton.id = "connect-button";
    connectButton.textContent = "Connect & Play";
    connectButton.style.backgroundColor = "#4CAF50";
    connectButton.style.color = "white";
    connectButton.style.padding = "15px 30px";
    connectButton.style.fontSize = "18px";
    connectButton.style.border = "none";
    connectButton.style.borderRadius = "5px";
    connectButton.style.cursor = "pointer";
    connectButton.style.transition = "background-color 0.3s";

    // Button hover effect
    connectButton.addEventListener("mouseover", () => {
      connectButton.style.backgroundColor = "#45a049";
    });

    connectButton.addEventListener("mouseout", () => {
      connectButton.style.backgroundColor = "#4CAF50";
    });

    // Connection status message
    const statusMessage = document.createElement("div");
    statusMessage.id = "connection-status-message";
    statusMessage.style.marginTop = "15px";
    statusMessage.style.color = "#ff9800";
    statusMessage.style.fontSize = "16px";
    statusMessage.style.minHeight = "20px";

    formContainer.appendChild(connectButton);
    formContainer.appendChild(statusMessage);
    startMenu.appendChild(formContainer);

    // Add multiplayer info
    const multiplayerInfo = document.createElement("div");
    multiplayerInfo.innerHTML =
      "Play together with friends! <br>Connect multiple browsers to join the same game.";
    multiplayerInfo.style.marginTop = "30px";
    multiplayerInfo.style.fontSize = "16px";
    multiplayerInfo.style.color = "#aaa";
    startMenu.appendChild(multiplayerInfo);

    // Add public URL info section
    const publicUrlInfo = document.createElement("div");
    publicUrlInfo.id = "public-url-info";
    publicUrlInfo.style.marginTop = "20px";
    publicUrlInfo.style.padding = "15px";
    publicUrlInfo.style.backgroundColor = "rgba(0, 150, 0, 0.2)";
    publicUrlInfo.style.borderRadius = "8px";
    publicUrlInfo.style.maxWidth = "500px";
    publicUrlInfo.style.textAlign = "center";
    publicUrlInfo.style.display = "none"; // Hidden by default

    // Check if we're already on a public URL
    if (
      window.location.hostname.includes("ngrok") ||
      window.location.hostname.includes("ngrok-free")
    ) {
      publicUrlInfo.style.display = "block";
      publicUrlInfo.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 10px; font-size: 18px;">🌐 You're connected to a public server!</div>
        <div style="margin-bottom: 10px;">Share this link with friends to play together:</div>
        <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px; margin-bottom: 10px; word-break: break-all;">
          ${window.location.href}
        </div>
        <button id="copy-url-button" style="padding: 8px 15px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Copy Link
        </button>
      `;

      // Add copy button functionality after DOM is ready
      setTimeout(() => {
        const copyButton = document.getElementById("copy-url-button");
        if (copyButton) {
          copyButton.addEventListener("click", () => {
            navigator.clipboard.writeText(window.location.href).then(() => {
              copyButton.textContent = "Copied!";
              setTimeout(() => {
                copyButton.textContent = "Copy Link";
              }, 2000);
            });
          });
        }
      }, 100);
    }
    // For localhost, check if there's a public URL available
    else if (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    ) {
      // Try to fetch the public URL from the server
      fetch("http://localhost:3000/public-url")
        .then((response) => response.json())
        .then((data) => {
          if (data && data.url) {
            publicUrlInfo.style.display = "block";
            publicUrlInfo.innerHTML = `
              <div style="font-weight: bold; margin-bottom: 10px; font-size: 18px;">🌐 Public Server Available!</div>
              <div style="margin-bottom: 10px;">Share this link with friends to play together:</div>
              <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px; margin-bottom: 10px; word-break: break-all;">
                ${data.url}
              </div>
              <div style="display: flex; justify-content: center; gap: 10px;">
                <button id="copy-url-button" style="padding: 8px 15px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">
                  Copy Link
                </button>
                <button id="open-url-button" style="padding: 8px 15px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">
                  Open in New Tab
                </button>
              </div>
            `;

            // Add button functionality after DOM is ready
            setTimeout(() => {
              const copyButton = document.getElementById("copy-url-button");
              if (copyButton) {
                copyButton.addEventListener("click", () => {
                  navigator.clipboard.writeText(data.url).then(() => {
                    copyButton.textContent = "Copied!";
                    setTimeout(() => {
                      copyButton.textContent = "Copy Link";
                    }, 2000);
                  });
                });
              }

              const openButton = document.getElementById("open-url-button");
              if (openButton) {
                openButton.addEventListener("click", () => {
                  window.open(data.url, "_blank");
                });
              }
            }, 100);
          }
        })
        .catch((err) => {
          console.log("Could not fetch public URL:", err);
        });
    }

    startMenu.appendChild(publicUrlInfo);

    document.body.appendChild(startMenu);

    // Set up connect button click event - this will actually start the game
    connectButton.addEventListener("click", () => {
      this.handleConnect();
    });

    // Allow Enter key to submit
    usernameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.handleConnect();
      }
    });
  }

  // Handle connect button click
  handleConnect() {
    const username = document.getElementById("username-input").value.trim();
    const statusMessage = document.getElementById("connection-status-message");
    const connectButton = document.getElementById("connect-button");

    // Validate username
    if (!username) {
      statusMessage.textContent = "Please enter a username";
      return;
    }

    // Save username to localStorage
    try {
      localStorage.setItem("playerName", username);
    } catch (e) {
      console.error("Could not save player name to localStorage:", e);
    }

    // Update UI
    statusMessage.textContent = "Connecting to server...";
    connectButton.textContent = "Connecting...";
    connectButton.disabled = true;
    connectButton.style.backgroundColor = "#888";

    // Store the username for multiplayer
    this.playerName = username;
    if (this.lobbyManager) {
      this.lobbyManager.savePlayerName(username);
    }

    // Connect to multiplayer server
    if (this.multiplayer && this.player) {
      // Connect to server using the lobby system
      this.multiplayer.connect(this.player, true);

      // Add connection listener to detect when connected
      const checkConnection = setInterval(() => {
        if (this.multiplayer.isConnected) {
          clearInterval(checkConnection);

          // We'll let the multiplayer manager and lobby manager handle what happens next
        }
      }, 500);

      // Add timeout to handle connection failure
      setTimeout(() => {
        if (!this.multiplayer.isConnected) {
          statusMessage.textContent =
            "Connection timed out. Check if server is running.";
          connectButton.textContent = "Try Again";
          connectButton.disabled = false;
          connectButton.style.backgroundColor = "#4CAF50";
          clearInterval(checkConnection);
        }
      }, 10000);
    } else {
      statusMessage.textContent = "Game not fully loaded yet. Please wait.";

      // Re-enable button after a delay
      setTimeout(() => {
        connectButton.textContent = "Connect & Play";
        connectButton.disabled = false;
        connectButton.style.backgroundColor = "#4CAF50";
      }, 2000);
    }
  }

  // Clean up all resources
  cleanup() {
    // Stop all intervals
    this.cleanupIntervals();

    // Disconnect from multiplayer if connected
    if (this.multiplayer && this.multiplayer.socket) {
      this.multiplayer.leaveGame();
      this.multiplayer.socket.disconnect();
    }

    // Stop animation loop
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }

    // Remove all event listeners
    window.removeEventListener("resize", this.onWindowResize);
    window.removeEventListener("beforeunload", this.cleanup);

    // Dispose of renderer
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(
          this.renderer.domElement
        );
      }
    }

    // Clean up THREE.js resources
    this.disposeSceneResources(this.scene);
  }

  // Dispose of THREE.js resources to prevent memory leaks
  disposeSceneResources(obj) {
    if (!obj) return;

    // Handle arrays
    if (Array.isArray(obj)) {
      obj.forEach((item) => this.disposeSceneResources(item));
      return;
    }

    // If object has children, dispose them first
    if (obj.children) {
      const children = [...obj.children]; // Clone to avoid modification during iteration
      children.forEach((child) => this.disposeSceneResources(child));
    }

    // Dispose of geometries and materials
    if (obj.geometry) {
      obj.geometry.dispose();
    }

    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach((material) => {
          if (material.map) material.map.dispose();
          material.dispose();
        });
      } else {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    }

    // Handle textures
    if (obj.texture) {
      obj.texture.dispose();
    }

    // Handle specific types
    if (obj.dispose && typeof obj.dispose === "function") {
      obj.dispose();
    }
  }

  // Clean up all intervals when needed
  cleanupIntervals() {
    // No more bot intervals to clean up
  }

  // Create message container for multiplayer chat and notifications
  createMessageContainer() {
    // Create message container if not exists
    let messageContainer = document.getElementById("message-container");
    if (!messageContainer) {
      messageContainer = document.createElement("div");
      messageContainer.id = "message-container";
      messageContainer.style.position = "absolute";
      messageContainer.style.bottom = "10px";
      messageContainer.style.left = "10px";
      messageContainer.style.width = "400px";
      messageContainer.style.maxHeight = "200px";
      messageContainer.style.overflow = "auto";
      messageContainer.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
      messageContainer.style.padding = "10px";
      messageContainer.style.borderRadius = "5px";
      messageContainer.style.zIndex = "1000";
      document.body.appendChild(messageContainer);
    }
  }
}

// Wait for DOM to load before starting the game
document.addEventListener("DOMContentLoaded", () => {
  const game = new Game();
});
