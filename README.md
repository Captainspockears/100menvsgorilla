# 100 Men vs Gorilla

A 3D multiplayer game where men battle a gorilla.

## Quick Start Guide

### Local Setup

1. **Install dependencies**:
   ```bash
   npm run install:all
   ```

2. **Run the game locally**:
   ```bash
   npm run dev
   ```
   This starts the server on http://localhost:3000 and client on http://localhost:3001

3. **Play with friends** by opening multiple browser windows to http://localhost:3001

### Public Multiplayer Setup (with ngrok)

1. **Install ngrok** (if not already installed):
   ```bash
   # macOS with Homebrew
   brew install ngrok
   
   # Or download from https://ngrok.com/download
   ```

2. **Create a free ngrok account** at https://dashboard.ngrok.com/signup

3. **Add your authtoken** (found in your ngrok dashboard):
   ```bash
   ngrok config add-authtoken YOUR_AUTHTOKEN
   ```

4. **Start the server and client**:
   ```bash
   npm run dev
   ```

5. **In a separate terminal, expose your server with ngrok**:
   ```bash
   ngrok http 3000
   ```

6. **Copy the ngrok URL** (looks like `https://xxxx-xxx-xxx-xxx.ngrok-free.app`)

7. **Share this URL with friends** to play together from anywhere!

## Project Structure

The project is split into two main parts:

- **client/**: Frontend code (Three.js, Socket.io client)
- **server/**: Backend code (Express, Socket.io server)

## Setup Instructions

### Installation

1. Install dependencies for both client and server:

```bash
npm run install:all
```

Or install dependencies separately:

```bash
# Install root dependencies
npm install

# Install client dependencies
cd client
npm install

# Install server dependencies
cd ../server
npm install
```

### Development

To run both client and server in development mode:

```bash
npm run dev
```

This will start:
- Client on http://localhost:3001
- Server on http://localhost:3000

To run only the client:

```bash
npm run client:dev
```

To run only the server:

```bash
npm run server:dev
```

### Production

To build the client for production:

```bash
npm run build
```

To start the server in production (serving the built client):

```bash
npm run start
```

## Multiplayer Features

The game's multiplayer functionality includes:

- **Real-time player movements** - See other players move in real-time
- **Host-based game logic** - First player becomes the host and controls game entities
- **Automatic host reassignment** - If host disconnects, another player becomes host
- **Player name display** - Usernames appear above each player
- **Player color assignment** - Each player gets a unique color
- **Public server access** - Share your game with anyone using ngrok

## Technologies Used

- **Client**:
  - Three.js: 3D rendering
  - Socket.io-client: Real-time communication
  - Vite: Development and build tool

- **Server**:
  - Express: Web server
  - Socket.io: WebSocket communication
  - Node.js: JavaScript runtime
  - ngrok: Public tunneling for online multiplayer

## Features

- Low-poly 3D environment with trees and ruins
- Third-person camera that follows the player
- WASD movement and space to jump
- Gorilla enemy that chases players with attack animations
- Health system with visual health bar
- Sound effects for movement, attacks, and damage
- Game over screen when caught by the gorilla with restart option
- 10 wandering human bots
- Multiplayer support with up to 100 concurrent players

## Controls

- W: Move forward
- A: Move left
- S: Move backward
- D: Move right
- Space: Jump
- Click the sound icon to mute/unmute

## Project Structure

- `client/src/js/main.js` - Main game loop and setup
- `client/src/js/controls/Controls.js` - Handles player input
- `client/src/js/entities/` - Contains all game entities:
  - `Player.js` - Player character
  - `Gorilla.js` - Enemy that chases the player
  - `Bot.js` - Wandering human NPCs
  - `Environment.js` - Game world, terrain, and props
- `client/src/js/ui/` - Contains UI elements:
  - `HealthBar.js` - Health bar and death screen
- `client/src/js/utils/` - Utility classes:
  - `SoundManager.js` - Sound effect handling
  - `ModelLoader.js` - Loads 3D models
- `client/src/js/multiplayer/` - Multiplayer functionality:
  - `MultiplayerManager.js` - Handles all multiplayer connections
- `server/server.js` - Main server file for Socket.IO communication

## Troubleshooting

### Common Issues

1. **Connection errors**:
   - Make sure the server is running on port 3000
   - Check that you've allowed the client through your firewall

2. **ngrok issues**:
   - Ensure you've authenticated with your ngrok authtoken
   - Check that ngrok is pointing to port 3000 (not 3001)

3. **Players can't see each other**:
   - Verify all players are connected to the same server
   - Check server logs for connection status
   - Try refreshing the page and reconnecting

## Development Roadmap

This project is being developed incrementally:

| Version | Features |
| ------- | -------- |
| v0.1 | Base game with player, gorilla, and basic movement |
| v0.2 | Added health system, attack animations, sounds, and death mechanics |
| v0.3 | Added multiplayer functionality and server integration |
| v1.0 (Current) | Full multiplayer with public server access via ngrok |
| v1.1 (Planned) | Add team-based gameplay and scoring |
| v1.2 (Planned) | Add resource gathering and building mechanics |
