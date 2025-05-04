import * as THREE from "three";

export class Controls {
  constructor(player, camera) {
    this.player = player;
    this.camera = camera;
    this.keys = {
      forward: false,
      left: false,
      right: false,
      jump: false,
      attack: false,
    };

    // For smoother movement and rotation
    this.currentMoveVector = new THREE.Vector3(0, 0, 0);
    this.currentRotation = 0;
    this.rotationSmoothness = 0.25; // Increased for faster rotation response (was 0.15)
    this.movementSmoothness = 0.25; // Increased for faster movement response (was 0.2)

    // Set up event listeners
    document.addEventListener("keydown", this.onKeyDown.bind(this));
    document.addEventListener("keyup", this.onKeyUp.bind(this));
  }

  onKeyDown(event) {
    const key = event.key.toLowerCase();
    switch (key) {
      case "w":
        this.keys.forward = true;
        break;
      case "a":
        this.keys.left = true;
        break;
      case "d":
        this.keys.right = true;
        break;
      case " ":
        // Only jump if not already jumping
        if (!this.player.isJumping) {
          this.keys.jump = true;
        }
        break;
      case "j":
        // Trigger attack
        console.log("J key pressed - attack triggered");
        this.keys.attack = true;
        break;
    }
  }

  onKeyUp(event) {
    const key = event.key.toLowerCase();
    switch (key) {
      case "w":
        this.keys.forward = false;
        break;
      case "a":
        this.keys.left = false;
        break;
      case "d":
        this.keys.right = false;
        break;
      case " ":
        this.keys.jump = false;
        break;
      case "j":
        this.keys.attack = false;
        break;
    }
  }

  update(deltaTime) {
    // Get camera direction (where the camera is looking)
    const cameraDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDirection);

    // Project the camera direction onto the XZ plane and normalize
    cameraDirection.y = 0;
    cameraDirection.normalize();

    // Get right vector (perpendicular to camera direction)
    const cameraRight = new THREE.Vector3();
    cameraRight
      .crossVectors(new THREE.Vector3(0, 1, 0), cameraDirection)
      .normalize();

    // Initialize movement vector
    const moveVector = new THREE.Vector3(0, 0, 0);

    // Determine if we're turning
    let isTurningLeft = this.keys.left && !this.keys.right;
    let isTurningRight = this.keys.right && !this.keys.left;

    // Update rotation based on turning input
    // Note: In THREE.js, rotation is clockwise for negative values and counter-clockwise for positive
    if (isTurningLeft) {
      // A key - turn left (counter-clockwise = positive)
      this.currentRotation += 0.05;
    } else if (isTurningRight) {
      // D key - turn right (clockwise = negative)
      this.currentRotation -= 0.05;
    }

    // Apply rotation to player regardless of movement
    this.player.setRotation(this.currentRotation);

    // Calculate forward direction based on current rotation
    const playerForward = new THREE.Vector3(
      Math.sin(this.currentRotation),
      0,
      Math.cos(this.currentRotation)
    );

    // When pressing forward, move in the player's facing direction
    if (this.keys.forward) {
      moveVector.add(playerForward);
    }

    // When pressing only left (no forward), strafe left
    if (this.keys.left && !this.keys.forward && !this.keys.right) {
      // Calculate right vector based on player orientation
      const playerRight = new THREE.Vector3();
      playerRight
        .crossVectors(new THREE.Vector3(0, 1, 0), playerForward)
        .normalize();
      moveVector.sub(playerRight);
    }

    // When pressing only right (no forward), strafe right
    if (this.keys.right && !this.keys.forward && !this.keys.left) {
      // Calculate right vector based on player orientation
      const playerRight = new THREE.Vector3();
      playerRight
        .crossVectors(new THREE.Vector3(0, 1, 0), playerForward)
        .normalize();
      moveVector.add(playerRight);
    }

    // Normalize movement vector if length > 0
    if (moveVector.length() > 0) {
      moveVector.normalize();
      // Apply the calculated movement vector
      this.currentMoveVector.copy(moveVector);
    } else {
      // Stop movement immediately when no keys are pressed
      this.currentMoveVector.set(0, 0, 0);
    }

    // Apply movement to player
    this.player.move(
      this.currentMoveVector.x,
      this.currentMoveVector.z,
      deltaTime
    );

    // Handle jumping
    if (this.keys.jump) {
      this.player.jump();
      this.keys.jump = false; // Reset to prevent continuous jumping
    }

    // Handle attacking
    if (this.keys.attack) {
      console.log("Attack key detected in update loop");
      // Get potential targets from the game
      const targets = this.getTargets();
      console.log("Potential targets:", targets.length);
      const result = this.player.attack(targets);
      console.log("Attack function called, result:", result);
      this.keys.attack = false; // Reset to prevent continuous attacking
    }
  }

  // Helper to get potential targets for the attack
  getTargets() {
    // If we have a reference to the game instance, get all players
    if (this.game && this.game.multiplayer) {
      return this.game.multiplayer.getOtherPlayers();
    }
    return [];
  }

  // Helper for smooth angle interpolation
  lerpAngle(a, b, t) {
    // Find the shortest path for rotation
    const diff = b - a;
    const diffNormalized = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI;
    return a + diffNormalized * t;
  }
}
