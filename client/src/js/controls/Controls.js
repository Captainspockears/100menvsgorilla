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
    };

    // For smoother movement and rotation
    this.currentMoveVector = new THREE.Vector3(0, 0, 0);
    this.currentRotation = 0;
    this.rotationSmoothness = 0.15; // Lower = smoother rotation
    this.movementSmoothness = 0.2; // Lower = smoother movement

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
    const cameraRight = new THREE.Vector3(1, 0, 0);
    cameraRight.applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.atan2(cameraDirection.x, cameraDirection.z)
    );

    // Initialize movement vector
    const moveVector = new THREE.Vector3(0, 0, 0);

    // Apply movement based on keys pressed
    if (this.keys.forward) {
      // Move in the direction the camera is facing
      moveVector.add(cameraDirection);
    }
    if (this.keys.left) {
      // Move to the left of the camera (swapped)
      moveVector.add(cameraRight);
    }
    if (this.keys.right) {
      // Move to the right of the camera (swapped)
      moveVector.sub(cameraRight);
    }

    // Normalize movement vector if length > 0
    if (moveVector.length() > 0) {
      moveVector.normalize();

      // Smooth movement
      this.currentMoveVector.lerp(moveVector, this.movementSmoothness);

      // Set player rotation to face movement direction with smoothing
      const targetRotation = Math.atan2(
        this.currentMoveVector.x,
        this.currentMoveVector.z
      );
      this.currentRotation = this.lerpAngle(
        this.currentRotation,
        targetRotation,
        this.rotationSmoothness
      );
      this.player.setRotation(this.currentRotation);
    } else {
      // Gradually slow down movement when no keys are pressed
      this.currentMoveVector.multiplyScalar(0.8);
      if (this.currentMoveVector.length() < 0.01) {
        this.currentMoveVector.set(0, 0, 0);
      }
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
  }

  // Helper for smooth angle interpolation
  lerpAngle(a, b, t) {
    // Find the shortest path for rotation
    const diff = b - a;
    const diffNormalized = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI;
    return a + diffNormalized * t;
  }
}
