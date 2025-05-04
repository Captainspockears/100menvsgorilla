import { showMessage } from "../main.js";

export class LobbyManager {
  constructor() {
    this.lobbies = [];
    this.currentLobby = null;
    this.playerName = "Player" + Math.floor(Math.random() * 1000);
    this.isHost = false;
    this.socket = null;
    this.onJoinGameCallback = null;
    this.onCreateGameCallback = null;

    // Load saved player name from localStorage if it exists
    this.loadPlayerName();
  }

  // Connect to socket.io server
  setSocket(socket) {
    this.socket = socket;
    this.setupSocketListeners();
  }

  // Setup socket listeners for lobby events
  setupSocketListeners() {
    if (!this.socket) return;

    // Listen for lobby list updates
    this.socket.on("lobbiesList", (lobbiesList) => {
      this.lobbies = lobbiesList;
      this.updateLobbiesList();
    });

    // Listen for lobby join confirmation
    this.socket.on("lobbyJoined", (lobbyData) => {
      this.currentLobby = lobbyData;
      this.isHost = lobbyData.hostId === this.socket.id;
      this.updateLobbyView();

      // If callback exists, notify the game that player joined a lobby
      if (typeof this.onJoinGameCallback === "function") {
        this.onJoinGameCallback(lobbyData);
      }
    });

    // Listen for lobby updates (new players, etc.)
    this.socket.on("lobbyUpdated", (lobbyData) => {
      this.currentLobby = lobbyData;
      this.updateLobbyView();
    });

    // Listen for game start
    this.socket.on("gameStarted", (gameData) => {
      console.log("Game started event received:", gameData);
      showMessage("Game starting! Entering game mode...", "green");

      // Hide the lobby screen
      this.hideLobbyScreen();

      // If callback exists, notify the game that it's starting
      if (typeof this.onJoinGameCallback === "function") {
        console.log("Calling onJoinGameCallback");
        this.onJoinGameCallback(gameData);
      } else {
        console.log("Warning: onJoinGameCallback not set");
      }
    });

    // Listen for lobby errors
    this.socket.on("lobbyError", (error) => {
      showMessage(error.message, "red");
    });
  }

  // Save player name to localStorage
  savePlayerName(name) {
    if (!name) return;
    this.playerName = name;
    try {
      localStorage.setItem("playerName", name);
    } catch (e) {
      console.error("Could not save player name to localStorage:", e);
    }
  }

  // Load player name from localStorage
  loadPlayerName() {
    try {
      const savedName = localStorage.getItem("playerName");
      if (savedName) {
        this.playerName = savedName;
      }
    } catch (e) {
      console.error("Could not load player name from localStorage:", e);
    }
  }

  // Create the main lobby interface
  createLobbyScreen() {
    // Create main container
    const lobbyScreen = document.createElement("div");
    lobbyScreen.id = "lobby-screen";
    lobbyScreen.style.position = "fixed";
    lobbyScreen.style.top = "0";
    lobbyScreen.style.left = "0";
    lobbyScreen.style.width = "100%";
    lobbyScreen.style.height = "100%";
    lobbyScreen.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
    lobbyScreen.style.display = "flex";
    lobbyScreen.style.flexDirection = "column";
    lobbyScreen.style.zIndex = "10000";
    lobbyScreen.style.fontFamily = "Arial, sans-serif";
    lobbyScreen.style.color = "white";
    lobbyScreen.style.padding = "20px";
    lobbyScreen.style.boxSizing = "border-box";

    // Create header
    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.marginBottom = "20px";

    // Game title
    const title = document.createElement("h1");
    title.textContent = "100 Men vs Gorilla";
    title.style.fontSize = "36px";
    title.style.color = "#ff9800";
    title.style.margin = "0";
    header.appendChild(title);

    // Player name section
    const playerSection = document.createElement("div");
    playerSection.style.display = "flex";
    playerSection.style.alignItems = "center";

    const nameLabel = document.createElement("span");
    nameLabel.textContent = "Your Name: ";
    nameLabel.style.marginRight = "10px";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.id = "player-name-input";
    nameInput.value = this.playerName;
    nameInput.style.padding = "8px";
    nameInput.style.borderRadius = "4px";
    nameInput.style.border = "none";
    nameInput.style.marginRight = "10px";
    nameInput.addEventListener("change", () => {
      this.savePlayerName(nameInput.value);
    });

    const updateNameBtn = document.createElement("button");
    updateNameBtn.textContent = "Update";
    updateNameBtn.style.padding = "8px 12px";
    updateNameBtn.style.backgroundColor = "#4CAF50";
    updateNameBtn.style.border = "none";
    updateNameBtn.style.borderRadius = "4px";
    updateNameBtn.style.color = "white";
    updateNameBtn.style.cursor = "pointer";
    updateNameBtn.addEventListener("click", () => {
      this.savePlayerName(nameInput.value);
      showMessage("Name updated", "green");
    });

    playerSection.appendChild(nameLabel);
    playerSection.appendChild(nameInput);
    playerSection.appendChild(updateNameBtn);
    header.appendChild(playerSection);

    lobbyScreen.appendChild(header);

    // Create main content area
    const content = document.createElement("div");
    content.style.display = "flex";
    content.style.flex = "1";
    content.style.gap = "20px";
    content.style.height = "calc(100% - 80px)";

    // Available lobbies section
    const lobbiesSection = document.createElement("div");
    lobbiesSection.style.flex = "2";
    lobbiesSection.style.display = "flex";
    lobbiesSection.style.flexDirection = "column";
    lobbiesSection.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    lobbiesSection.style.padding = "15px";
    lobbiesSection.style.borderRadius = "8px";

    // Lobbies header with refresh button
    const lobbiesHeader = document.createElement("div");
    lobbiesHeader.style.display = "flex";
    lobbiesHeader.style.justifyContent = "space-between";
    lobbiesHeader.style.alignItems = "center";
    lobbiesHeader.style.marginBottom = "15px";

    const lobbiesTitle = document.createElement("h2");
    lobbiesTitle.textContent = "Available Lobbies";
    lobbiesTitle.style.margin = "0";
    lobbiesTitle.style.fontSize = "24px";

    const refreshBtn = document.createElement("button");
    refreshBtn.innerHTML = "🔄 Refresh";
    refreshBtn.style.padding = "8px 12px";
    refreshBtn.style.backgroundColor = "#2196F3";
    refreshBtn.style.border = "none";
    refreshBtn.style.borderRadius = "4px";
    refreshBtn.style.color = "white";
    refreshBtn.style.cursor = "pointer";
    refreshBtn.addEventListener("click", () => {
      this.refreshLobbies();
    });

    lobbiesHeader.appendChild(lobbiesTitle);
    lobbiesHeader.appendChild(refreshBtn);
    lobbiesSection.appendChild(lobbiesHeader);

    // Lobbies table
    const lobbiesTable = document.createElement("div");
    lobbiesTable.id = "lobbies-table";
    lobbiesTable.style.flex = "1";
    lobbiesTable.style.overflowY = "auto";
    lobbiesTable.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
    lobbiesTable.style.borderRadius = "4px";

    // Create table headers
    const tableHeader = document.createElement("div");
    tableHeader.style.display = "grid";
    tableHeader.style.gridTemplateColumns = "3fr 1fr 1fr 1fr";
    tableHeader.style.padding = "10px";
    tableHeader.style.borderBottom = "1px solid #444";
    tableHeader.style.fontWeight = "bold";
    tableHeader.style.backgroundColor = "rgba(0, 0, 0, 0.3)";

    const nameHeader = document.createElement("div");
    nameHeader.textContent = "Lobby Name";
    const playersHeader = document.createElement("div");
    playersHeader.textContent = "Players";
    playersHeader.style.textAlign = "center";
    const pingHeader = document.createElement("div");
    pingHeader.textContent = "Ping";
    pingHeader.style.textAlign = "center";
    const actionHeader = document.createElement("div");
    actionHeader.textContent = "Action";
    actionHeader.style.textAlign = "center";

    tableHeader.appendChild(nameHeader);
    tableHeader.appendChild(playersHeader);
    tableHeader.appendChild(pingHeader);
    tableHeader.appendChild(actionHeader);
    lobbiesTable.appendChild(tableHeader);

    // Create table body for listing lobbies
    const tableBody = document.createElement("div");
    tableBody.id = "lobbies-list";
    tableBody.style.maxHeight = "calc(100% - 40px)";
    tableBody.style.overflowY = "auto";
    lobbiesTable.appendChild(tableBody);

    lobbiesSection.appendChild(lobbiesTable);

    // Create lobby button
    const createLobbyBtn = document.createElement("button");
    createLobbyBtn.textContent = "Create New Lobby";
    createLobbyBtn.style.marginTop = "15px";
    createLobbyBtn.style.padding = "12px";
    createLobbyBtn.style.backgroundColor = "#ff9800";
    createLobbyBtn.style.border = "none";
    createLobbyBtn.style.borderRadius = "4px";
    createLobbyBtn.style.color = "white";
    createLobbyBtn.style.fontSize = "16px";
    createLobbyBtn.style.cursor = "pointer";
    createLobbyBtn.addEventListener("click", () => {
      this.showCreateLobbyDialog();
    });
    lobbiesSection.appendChild(createLobbyBtn);

    // Current lobby section (initially hidden)
    const lobbySection = document.createElement("div");
    lobbySection.id = "current-lobby";
    lobbySection.style.flex = "1";
    lobbySection.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    lobbySection.style.padding = "15px";
    lobbySection.style.borderRadius = "8px";
    lobbySection.style.display = "none";

    // Lobby info header
    const lobbyHeader = document.createElement("div");
    lobbyHeader.style.display = "flex";
    lobbyHeader.style.justifyContent = "space-between";
    lobbyHeader.style.alignItems = "center";
    lobbyHeader.style.marginBottom = "15px";

    const lobbyTitle = document.createElement("h2");
    lobbyTitle.id = "lobby-name";
    lobbyTitle.textContent = "Lobby";
    lobbyTitle.style.margin = "0";
    lobbyTitle.style.fontSize = "24px";

    const leaveBtn = document.createElement("button");
    leaveBtn.innerHTML = "Leave Lobby";
    leaveBtn.style.padding = "8px 12px";
    leaveBtn.style.backgroundColor = "#f44336";
    leaveBtn.style.border = "none";
    leaveBtn.style.borderRadius = "4px";
    leaveBtn.style.color = "white";
    leaveBtn.style.cursor = "pointer";
    leaveBtn.addEventListener("click", () => {
      this.leaveLobby();
    });

    lobbyHeader.appendChild(lobbyTitle);
    lobbyHeader.appendChild(leaveBtn);
    lobbySection.appendChild(lobbyHeader);

    // Players in lobby
    const playersTitle = document.createElement("h3");
    playersTitle.textContent = "Players";
    playersTitle.style.fontSize = "18px";
    playersTitle.style.marginBottom = "10px";
    lobbySection.appendChild(playersTitle);

    const playersList = document.createElement("div");
    playersList.id = "lobby-players";
    playersList.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
    playersList.style.borderRadius = "4px";
    playersList.style.padding = "10px";
    playersList.style.marginBottom = "20px";
    playersList.style.minHeight = "200px";
    playersList.style.overflowY = "auto";
    lobbySection.appendChild(playersList);

    // Start game button (only for host)
    const startGameBtn = document.createElement("button");
    startGameBtn.id = "start-game-btn";
    startGameBtn.textContent = "Start Game";
    startGameBtn.style.width = "100%";
    startGameBtn.style.padding = "15px";
    startGameBtn.style.backgroundColor = "#4CAF50";
    startGameBtn.style.border = "none";
    startGameBtn.style.borderRadius = "4px";
    startGameBtn.style.color = "white";
    startGameBtn.style.fontSize = "18px";
    startGameBtn.style.cursor = "pointer";
    startGameBtn.style.marginTop = "auto";
    startGameBtn.style.display = "none"; // Initially hidden until player is confirmed as host
    startGameBtn.addEventListener("click", () => {
      this.startGame();
    });
    lobbySection.appendChild(startGameBtn);

    content.appendChild(lobbiesSection);
    content.appendChild(lobbySection);
    lobbyScreen.appendChild(content);

    document.body.appendChild(lobbyScreen);
  }

  // Update the lobbies list with current lobbies data
  updateLobbiesList() {
    const lobbiesList = document.getElementById("lobbies-list");
    if (!lobbiesList) return;

    lobbiesList.innerHTML = "";

    if (this.lobbies.length === 0) {
      const noLobbiesMsg = document.createElement("div");
      noLobbiesMsg.textContent = "No active lobbies found. Create a new one!";
      noLobbiesMsg.style.padding = "15px";
      noLobbiesMsg.style.textAlign = "center";
      noLobbiesMsg.style.color = "#aaa";
      lobbiesList.appendChild(noLobbiesMsg);
      return;
    }

    // Add each lobby to the list
    this.lobbies.forEach((lobby) => {
      const lobbyRow = document.createElement("div");
      lobbyRow.style.display = "grid";
      lobbyRow.style.gridTemplateColumns = "3fr 1fr 1fr 1fr";
      lobbyRow.style.padding = "10px";
      lobbyRow.style.borderBottom = "1px solid #333";
      lobbyRow.style.alignItems = "center";

      const nameCell = document.createElement("div");
      nameCell.textContent = lobby.name;

      const playersCell = document.createElement("div");
      playersCell.textContent = `${lobby.players.length}/${lobby.maxPlayers}`;
      playersCell.style.textAlign = "center";

      const pingCell = document.createElement("div");
      pingCell.textContent = `${lobby.ping || "--"} ms`;
      pingCell.style.textAlign = "center";

      const actionCell = document.createElement("div");
      actionCell.style.textAlign = "center";

      const joinBtn = document.createElement("button");
      joinBtn.textContent = "Join";
      joinBtn.style.padding = "6px 12px";
      joinBtn.style.backgroundColor = "#4CAF50";
      joinBtn.style.border = "none";
      joinBtn.style.borderRadius = "4px";
      joinBtn.style.color = "white";
      joinBtn.style.cursor = "pointer";

      // Disable button if lobby is full
      if (lobby.players.length >= lobby.maxPlayers) {
        joinBtn.disabled = true;
        joinBtn.style.backgroundColor = "#888";
        joinBtn.style.cursor = "not-allowed";
      }

      joinBtn.addEventListener("click", () => {
        this.joinLobby(lobby.id);
      });

      actionCell.appendChild(joinBtn);

      lobbyRow.appendChild(nameCell);
      lobbyRow.appendChild(playersCell);
      lobbyRow.appendChild(pingCell);
      lobbyRow.appendChild(actionCell);

      // Add hover effect
      lobbyRow.addEventListener("mouseover", () => {
        lobbyRow.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
      });

      lobbyRow.addEventListener("mouseout", () => {
        lobbyRow.style.backgroundColor = "transparent";
      });

      lobbiesList.appendChild(lobbyRow);
    });
  }

  // Update the current lobby view with player list
  updateLobbyView() {
    if (!this.currentLobby) return;

    // Show the current lobby section and hide available lobbies
    const currentLobbySection = document.getElementById("current-lobby");
    const lobbiesTable = document.getElementById("lobbies-table");
    const createLobbyBtn = document.querySelector(
      "#lobby-screen button:last-child"
    );

    if (currentLobbySection) {
      currentLobbySection.style.display = "flex";
      currentLobbySection.style.flexDirection = "column";
    }

    // Update lobby name
    const lobbyNameElement = document.getElementById("lobby-name");
    if (lobbyNameElement) {
      lobbyNameElement.textContent = this.currentLobby.name;
    }

    // Update players list
    const playersListElement = document.getElementById("lobby-players");
    if (playersListElement) {
      playersListElement.innerHTML = "";

      console.log(
        "Updating player list with data:",
        JSON.stringify(this.currentLobby.players)
      );

      this.currentLobby.players.forEach((player) => {
        const playerItem = document.createElement("div");
        playerItem.style.padding = "8px";
        playerItem.style.marginBottom = "5px";
        playerItem.style.backgroundColor = "rgba(0, 0, 0, 0.3)";
        playerItem.style.borderRadius = "4px";
        playerItem.style.display = "flex";
        playerItem.style.justifyContent = "space-between";
        playerItem.style.alignItems = "center";

        // Player name with host indicator
        const nameSpan = document.createElement("span");
        nameSpan.textContent = player.name;
        if (player.id === this.currentLobby.hostId) {
          nameSpan.textContent += " 👑 (Host)";
          nameSpan.style.color = "#ffd700";
        }

        playerItem.appendChild(nameSpan);

        // For the host: add kick button for other players
        if (this.isHost && player.id !== this.socket.id) {
          const kickBtn = document.createElement("button");
          kickBtn.textContent = "Kick";
          kickBtn.style.padding = "4px 8px";
          kickBtn.style.backgroundColor = "#f44336";
          kickBtn.style.border = "none";
          kickBtn.style.borderRadius = "4px";
          kickBtn.style.color = "white";
          kickBtn.style.fontSize = "12px";
          kickBtn.style.cursor = "pointer";

          kickBtn.addEventListener("click", () => {
            this.kickPlayer(player.id);
          });

          playerItem.appendChild(kickBtn);
        }

        playersListElement.appendChild(playerItem);
      });
    }

    // Show/hide start game button based on host status
    const startGameBtn = document.getElementById("start-game-btn");
    if (startGameBtn) {
      if (this.isHost) {
        startGameBtn.style.display = "block";
        startGameBtn.disabled = this.currentLobby.players.length < 1;
        if (startGameBtn.disabled) {
          startGameBtn.style.backgroundColor = "#888";
          startGameBtn.style.cursor = "not-allowed";
          startGameBtn.textContent = "Need more players to start";
        } else {
          startGameBtn.style.backgroundColor = "#4CAF50";
          startGameBtn.style.cursor = "pointer";
          startGameBtn.textContent = "Start Game";
        }
      } else {
        startGameBtn.style.display = "none";
      }
    }
  }

  // Show create lobby dialog
  showCreateLobbyDialog() {
    // Create modal background
    const modalBg = document.createElement("div");
    modalBg.style.position = "fixed";
    modalBg.style.top = "0";
    modalBg.style.left = "0";
    modalBg.style.width = "100%";
    modalBg.style.height = "100%";
    modalBg.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
    modalBg.style.display = "flex";
    modalBg.style.justifyContent = "center";
    modalBg.style.alignItems = "center";
    modalBg.style.zIndex = "20000";

    // Create modal content
    const modal = document.createElement("div");
    modal.style.backgroundColor = "#222";
    modal.style.padding = "20px";
    modal.style.borderRadius = "8px";
    modal.style.width = "400px";

    // Modal header
    const modalTitle = document.createElement("h2");
    modalTitle.textContent = "Create New Lobby";
    modalTitle.style.marginTop = "0";
    modalTitle.style.color = "#ff9800";
    modal.appendChild(modalTitle);

    // Form elements
    const form = document.createElement("form");
    form.onsubmit = (e) => {
      e.preventDefault();
      const lobbyName = document
        .getElementById("create-lobby-name")
        .value.trim();
      const maxPlayers = parseInt(
        document.getElementById("create-lobby-max-players").value,
        10
      );

      if (!lobbyName) {
        alert("Please enter a lobby name");
        return;
      }

      this.createLobby(lobbyName, maxPlayers);
      document.body.removeChild(modalBg);
    };

    // Lobby name input
    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Lobby Name:";
    nameLabel.style.display = "block";
    nameLabel.style.marginBottom = "5px";
    form.appendChild(nameLabel);

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.id = "create-lobby-name";
    nameInput.value = `${this.playerName}'s Lobby`;
    nameInput.style.width = "100%";
    nameInput.style.padding = "8px";
    nameInput.style.marginBottom = "15px";
    nameInput.style.backgroundColor = "#333";
    nameInput.style.border = "none";
    nameInput.style.borderRadius = "4px";
    nameInput.style.color = "white";
    form.appendChild(nameInput);

    // Max players input
    const maxPlayersLabel = document.createElement("label");
    maxPlayersLabel.textContent = "Max Players:";
    maxPlayersLabel.style.display = "block";
    maxPlayersLabel.style.marginBottom = "5px";
    form.appendChild(maxPlayersLabel);

    const maxPlayersInput = document.createElement("input");
    maxPlayersInput.type = "number";
    maxPlayersInput.id = "create-lobby-max-players";
    maxPlayersInput.min = "2";
    maxPlayersInput.max = "10";
    maxPlayersInput.value = "4";
    maxPlayersInput.style.width = "100%";
    maxPlayersInput.style.padding = "8px";
    maxPlayersInput.style.marginBottom = "15px";
    maxPlayersInput.style.backgroundColor = "#333";
    maxPlayersInput.style.border = "none";
    maxPlayersInput.style.borderRadius = "4px";
    maxPlayersInput.style.color = "white";
    form.appendChild(maxPlayersInput);

    // Buttons
    const buttonContainer = document.createElement("div");
    buttonContainer.style.display = "flex";
    buttonContainer.style.justifyContent = "space-between";
    buttonContainer.style.marginTop = "20px";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.padding = "10px 20px";
    cancelBtn.style.backgroundColor = "#666";
    cancelBtn.style.border = "none";
    cancelBtn.style.borderRadius = "4px";
    cancelBtn.style.color = "white";
    cancelBtn.style.cursor = "pointer";
    cancelBtn.addEventListener("click", () => {
      document.body.removeChild(modalBg);
    });

    const createBtn = document.createElement("button");
    createBtn.type = "submit";
    createBtn.textContent = "Create";
    createBtn.style.padding = "10px 20px";
    createBtn.style.backgroundColor = "#4CAF50";
    createBtn.style.border = "none";
    createBtn.style.borderRadius = "4px";
    createBtn.style.color = "white";
    createBtn.style.cursor = "pointer";

    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(createBtn);
    form.appendChild(buttonContainer);

    modal.appendChild(form);
    modalBg.appendChild(modal);
    document.body.appendChild(modalBg);

    // Focus on input
    nameInput.focus();
  }

  // Create a new lobby
  createLobby(name, maxPlayers) {
    if (!this.socket) {
      showMessage("Not connected to server", "red");
      return;
    }

    this.socket.emit("createLobby", {
      name,
      maxPlayers,
      playerName: this.playerName,
    });

    if (this.onCreateGameCallback) {
      this.onCreateGameCallback();
    }
  }

  // Join an existing lobby
  joinLobby(lobbyId) {
    if (!this.socket) {
      showMessage("Not connected to server", "red");
      return;
    }

    this.socket.emit("joinLobby", {
      lobbyId,
      playerName: this.playerName,
    });
  }

  // Leave current lobby
  leaveLobby() {
    if (!this.socket || !this.currentLobby) {
      return;
    }

    this.socket.emit("leaveLobby");
    this.currentLobby = null;

    // Show the lobbies list again
    const currentLobbySection = document.getElementById("current-lobby");
    if (currentLobbySection) {
      currentLobbySection.style.display = "none";
    }

    // Refresh lobbies list
    this.refreshLobbies();
  }

  // Kick a player from lobby (host only)
  kickPlayer(playerId) {
    if (!this.socket || !this.isHost) {
      console.error("Cannot kick player - not connected or not host");
      return;
    }

    if (!playerId) {
      console.error("Cannot kick player - no player ID provided");
      return;
    }

    console.log(`Attempting to kick player with ID: ${playerId}`);

    // Show a message to the user
    if (window.showMessage) {
      const playerToKick = this.currentLobby?.players.find(
        (p) => p.id === playerId
      );
      const playerName = playerToKick?.name || "Unknown player";
      window.showMessage(`Kicking ${playerName}...`, "orange");
    }

    // Send the kick event to the server
    this.socket.emit("kickPlayer", { playerId });
  }

  // Start the game (host only)
  startGame() {
    if (!this.socket || !this.isHost || !this.currentLobby) {
      showMessage(
        "Cannot start game - not connected, not host, or no lobby",
        "red"
      );
      console.error("Cannot start game:", {
        socketExists: !!this.socket,
        isHost: this.isHost,
        currentLobbyExists: !!this.currentLobby,
        lobbyId: this.currentLobby?.id,
      });
      return;
    }

    showMessage("Starting game...", "green");
    console.log(
      "Sending startGame event to server with lobbyId:",
      this.currentLobby.id
    );

    this.socket.emit("startGame", { lobbyId: this.currentLobby.id });
  }

  // Refresh the list of lobbies
  refreshLobbies() {
    if (!this.socket) {
      return;
    }

    this.socket.emit("getLobbies");
  }

  // Hide the lobby screen when game starts
  hideLobbyScreen() {
    const lobbyScreen = document.getElementById("lobby-screen");
    if (lobbyScreen) {
      lobbyScreen.style.display = "none";
    }
  }

  // Show the lobby screen
  showLobbyScreen() {
    const lobbyScreen = document.getElementById("lobby-screen");
    if (lobbyScreen) {
      lobbyScreen.style.display = "flex";
    } else {
      this.createLobbyScreen();
    }

    // Refresh lobbies list
    this.refreshLobbies();
  }

  // Register callbacks
  onJoinGame(callback) {
    this.onJoinGameCallback = callback;
  }

  onCreateGame(callback) {
    this.onCreateGameCallback = callback;
  }
}
