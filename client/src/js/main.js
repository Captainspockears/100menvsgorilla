import * as THREE from "three";
import { Controls } from "./controls/Controls.js";
import { Player } from "./entities/Player.js";
import { Gorilla } from "./entities/Gorilla.js";
import { Bot } from "./entities/Bot.js";
import { Environment } from "./entities/Environment.js";
import { SoundManager } from "./utils/SoundManager.js";
import { HealthBar } from "./ui/HealthBar.js";
import { ModelLoader } from "./utils/ModelLoader.js";
import { MultiplayerManager } from "./multiplayer/MultiplayerManager.js";

// Debug helper function
function displayDebugInfo(enabled = true) {
  if (!enabled) return;

  // Create debug panel
  const debugPanel = document.createElement("div");
  debugPanel.style.position = "absolute";
  debugPanel.style.top = "10px";
  debugPanel.style.left = "10px";
  debugPanel.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
  debugPanel.style.color = "white";
  debugPanel.style.padding = "10px";
  debugPanel.style.fontFamily = "monospace";
  debugPanel.style.fontSize = "12px";
  debugPanel.style.maxWidth = "400px";
  debugPanel.style.maxHeight = "200px";
  debugPanel.style.overflow = "auto";
  debugPanel.style.zIndex = "1000";
  debugPanel.id = "debug-panel";

  document.body.appendChild(debugPanel);

  // Update function
  window.updateDebug = function (text) {
    const panel = document.getElementById("debug-panel");
    if (panel) {
      panel.innerHTML = text;
    }
  };

  // Initial content
  window.updateDebug("Debug panel initialized");
}

// Show message in chat/notification area
function showMessage(message, color = "white", duration = 5000) {
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
  messageElement.style.fontFamily = "Arial, sans-serif";
  messageElement.style.fontSize = "14px";

  // Add to container
  messageContainer.appendChild(messageElement);

  // Scroll to bottom
  messageContainer.scrollTop = messageContainer.scrollHeight;

  // Remove after duration
  setTimeout(() => {
    if (messageElement.parentNode === messageContainer) {
      messageContainer.removeChild(messageElement);
    }
  }, duration);
}

// Game class
class Game {
  constructor() {
    // Create start menu first
    this.createStartMenu();

    // Enable debug
    displayDebugInfo(true);

    // Create message container for chat and notifications
    this.createMessageContainer();

    // Setup sound manager first
    this.soundManager = new SoundManager();
    this.isSoundInitialized = false;

    // Setup model loader
    this.modelLoader = new ModelLoader();

    // Loading screen
    this.showLoadingScreen();

    // Setup scene, camera, and renderer
    this.scene = new THREE.Scene();

    // Add lighting to the scene
    this.setupLighting();

    // Add axis helper for debugging
    const axesHelper = new THREE.AxesHelper(5);
    this.scene.add(axesHelper);

    // Add a grid helper for better spatial orientation
    const gridHelper = new THREE.GridHelper(50, 50);
    this.scene.add(gridHelper);

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
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

    // Create game entities
    this.environment = new Environment(this.scene);

    // Create player and gorilla with proper model loading
    this.loadGameEntities();

    // Position camera
    this.camera.position.set(0, 5, 10);
    if (this.player) {
      this.camera.lookAt(this.player.position);
    }

    // Setup controls - pass the camera
    this.controls = new Controls(this.player, this.camera);

    // Initialize multiplayer
    this.multiplayer = new MultiplayerManager(
      this.scene,
      this.modelLoader,
      this.soundManager
    );

    // Provide reference to the game instance
    this.multiplayer.setGameReference(this);

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

    // Start the game loop
    this.animate();

    // Show welcome message
    showMessage(
      "Welcome to 100 Men vs Gorilla! Enter your username and connect to play.",
      "#4CAF50",
      10000
    );
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

  setupLighting() {
    // Ambient light (provides basic illumination for all objects)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    // Directional light (simulates sunlight)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;

    // Improve shadow quality
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 10;
    directionalLight.shadow.camera.far = 200;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;

    this.scene.add(directionalLight);

    // Add a hemisphere light (simulates sky and ground reflection)
    const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x3a5f0b, 0.6);
    this.scene.add(hemisphereLight);

    this.updateDebug("Lighting set up");
  }

  async loadGameEntities() {
    try {
      // Create player and wait for it to load
      this.player = new Player(this.scene, this.soundManager, this.modelLoader);
      this.updateDebug("Player created");

      // Create gorilla and wait for it to load
      this.gorilla = new Gorilla(
        this.scene,
        this.soundManager,
        this.modelLoader
      );
      this.updateDebug("Gorilla created");

      this.bots = [];
      // Create 10 bots
      for (let i = 0; i < 10; i++) {
        this.bots.push(new Bot(this.scene));
      }
      this.updateDebug("Bots created");

      // Remove loading screen after a short delay
      setTimeout(() => {
        this.hideLoadingScreen();
      }, 3000);
    } catch (error) {
      console.error("Error loading game entities:", error);
      this.updateDebug("Error loading game entities: " + error.message);
    }
  }

  updateDebug(message) {
    if (window.updateDebug) {
      const time = new Date().toLocaleTimeString();
      window.updateDebug(
        window.document.getElementById("debug-panel").innerHTML +
          `<br>${time}: ${message}`
      );
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
    if (this.isSoundInitialized) return;

    try {
      await this.soundManager.initialize();
      this.isSoundInitialized = true;
      this.updateDebug("Sound initialized");

      // Add mute toggle button
      this.addMuteButton();
    } catch (error) {
      console.error("Failed to initialize sound:", error);
      this.updateDebug("Sound initialization failed: " + error.message);
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
    requestAnimationFrame(this.animate.bind(this));

    const deltaTime = this.clock.getDelta();

    // Update entities
    if (this.controls) this.controls.update(deltaTime);
    if (this.player) this.player.update(deltaTime);

    // Update gorilla to chase bots instead of player
    if (this.gorilla) {
      this.gorilla.update(deltaTime, this.player, this.bots);
    }

    // Update bots with gorilla awareness
    if (this.bots && this.gorilla) {
      this.bots.forEach((bot) =>
        bot.update(deltaTime, this.gorilla, this.bots)
      );
    }

    // Update multiplayer (remote players)
    if (this.multiplayer) {
      this.multiplayer.update(deltaTime);
    }

    // Update camera position to follow player from behind (Fortnite style)
    if (this.player && !this.player.isDead) {
      // Camera parameters
      const distance = 7; // Distance behind player
      const height = 3.5; // Height above player
      const lookAtOffset = 1; // Look at point above player's head
      const smoothness = 0.05; // Camera smoothness (lower = smoother)

      // Get the player's rotation and direction
      const playerAngle = this.player.group.rotation.y;

      // Calculate position behind player based on player's rotation
      const offsetX = Math.sin(playerAngle) * distance;
      const offsetZ = Math.cos(playerAngle) * distance;

      // Calculate desired camera position (behind player based on their rotation)
      const cameraPosition = new THREE.Vector3();
      cameraPosition.copy(this.player.position);
      cameraPosition.x -= offsetX; // Position based on player rotation
      cameraPosition.z -= offsetZ; // Position based on player rotation
      cameraPosition.y = this.player.position.y + height;

      // Smoothly move camera to this position
      this.camera.position.lerp(cameraPosition, smoothness);

      // Look at point slightly above player's head
      const lookAtPosition = new THREE.Vector3();
      lookAtPosition.copy(this.player.position);
      lookAtPosition.y += lookAtOffset;
      this.camera.lookAt(lookAtPosition);
    }

    // Render
    this.renderer.render(this.scene, this.camera);
  }

  restart() {
    // Reset player
    if (this.player) this.player.reset();

    // Reset health bar
    this.healthBar.reset();

    // Create a new gorilla if the current one is dead
    if (this.gorilla && this.gorilla.isDead) {
      // Remove old gorilla if needed
      if (this.gorilla.mesh) {
        this.scene.remove(this.gorilla.mesh);
      }

      // Create new gorilla
      this.gorilla = new Gorilla(
        this.scene,
        this.soundManager,
        this.modelLoader
      );
    } else if (this.gorilla) {
      // Otherwise just reset position and state
      this.gorilla.mesh.position.set(15, 0, 15);
      this.gorilla.isAttacking = false;
      this.gorilla.attackCooldown = 0;
      this.gorilla.health = this.gorilla.maxHealth;
      this.gorilla.isDead = false;
      if (this.gorilla.resetAttackState) {
        this.gorilla.resetAttackState();
      }
    }

    // Create new bots to replace any that died
    const botsToCreate =
      10 - (this.bots ? this.bots.filter((bot) => !bot.isDead).length : 0);
    for (let i = 0; i < botsToCreate; i++) {
      this.bots.push(new Bot(this.scene));
    }

    // Reset camera
    this.camera.position.set(0, 5, 10);
    if (this.player) this.camera.lookAt(this.player.position);

    // Show restart message
    showMessage("Game restarted!", "#4CAF50");

    // Let the server know about the restart if in multiplayer
    if (
      this.multiplayer &&
      this.multiplayer.socket &&
      this.multiplayer.socket.connected
    ) {
      this.multiplayer.socket.emit("resetGame");
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
    usernameInput.value = "Player" + Math.floor(Math.random() * 1000);
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

    // Update UI
    statusMessage.textContent = "Connecting to server...";
    connectButton.textContent = "Connecting...";
    connectButton.disabled = true;
    connectButton.style.backgroundColor = "#888";

    // Store the username for multiplayer
    this.playerName = username;

    // Connect to multiplayer server
    if (this.multiplayer && this.player) {
      // Override the prompt in MultiplayerManager to use our value
      const originalPrompt = window.prompt;
      window.prompt = () => username;

      // Connect to server
      this.multiplayer.connect(this.player);

      // Restore original prompt
      window.prompt = originalPrompt;

      // Add connection listener to detect when connected
      const checkConnection = setInterval(() => {
        if (this.multiplayer.isConnected) {
          clearInterval(checkConnection);
          // Hide start menu when connected
          const startMenu = document.getElementById("start-menu");
          startMenu.style.display = "none";

          // Show connected message
          showMessage(
            "Connected to multiplayer server! You are playing as " + username,
            "#4CAF50",
            5000
          );
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
}

// Wait for DOM to load before starting the game
document.addEventListener("DOMContentLoaded", () => {
  const game = new Game();
});
