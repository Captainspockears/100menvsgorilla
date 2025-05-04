import * as THREE from "three";

export class Player {
  constructor(scene, soundManager, modelLoader) {
    // Player properties
    this.moveSpeed = 5;
    this.jumpForce = 10;
    this.gravity = 20;
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.isJumping = false;
    this.health = 100;
    this.maxHealth = 100;
    this.isDead = false;
    this.isInvulnerable = false;
    this.invulnerabilityTime = 1.0; // seconds of invulnerability after taking damage
    this.invulnerabilityTimer = 0;
    this.footstepTimer = 0;
    this.footstepInterval = 0.4; // Time between footstep sounds
    this.soundManager = soundManager;
    this.isMoving = false;
    this.scene = scene;

    // Map boundaries - players cannot go beyond these limits
    this.mapBoundary = 20; // Square boundary centered at origin

    // Create a group to hold the model and manage positioning
    this.group = new THREE.Group();
    this.scene.add(this.group);

    // Create simple mesh as placeholder while the model loads
    const geometry = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
    const material = new THREE.MeshBasicMaterial({
      color: 0x0000ff,
      transparent: true,
      opacity: 0.5,
    });
    this.placeholder = new THREE.Mesh(geometry, material);
    this.placeholder.position.set(0, 1, 0);
    this.placeholder.castShadow = true;
    this.group.add(this.placeholder);

    // Store original color for flash effect when damaged
    this.defaultColor = material.color.clone();
    this.damageColor = new THREE.Color(0xff0000); // Red

    // Reference to actual model
    this.model = null;
    this.mixer = null;
    this.animations = {};

    // Load the 3D model
    if (modelLoader) {
      this.loadModel(modelLoader);
    }

    // Set initial position
    this.group.position.set(0, 0, 0);
  }

  async loadModel(modelLoader) {
    try {
      // Load the player model (from the /public/models directory)
      const result = await modelLoader.loadAnimatedModel(
        "/models/human/scene.gltf",
        {
          scale: 0.75, // Adjust scale to match bot humans
          castShadow: true,
          receiveShadow: true,
        }
      );

      // Get the model and animations
      this.model = result.model;
      this.mixer = result.mixer;
      this.animations = result.animations;

      // Center the model
      this.centerModel();

      // Tint the player model blue to distinguish from other humans
      this.model.traverse((node) => {
        if (node.isMesh && node.material) {
          if (Array.isArray(node.material)) {
            node.material.forEach((mat) => {
              // Store original color
              if (!mat._originalColor && mat.color) {
                mat._originalColor = mat.color.clone();
              }
              // Apply blue tint
              if (mat.color) {
                mat.color.setRGB(0.3, 0.5, 1.0);
              }
            });
          } else if (node.material.color) {
            // Store original color
            if (!node.material._originalColor) {
              node.material._originalColor = node.material.color.clone();
            }
            // Apply blue tint
            node.material.color.setRGB(0.3, 0.5, 1.0);
          }
        }
      });

      // Add model to group
      this.group.add(this.model);

      // Add ambient light to make the model visible
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      this.model.add(ambientLight);

      // Remove placeholder when model is loaded
      if (this.placeholder) {
        this.group.remove(this.placeholder);
        this.placeholder.geometry.dispose();
        this.placeholder.material.dispose();
        this.placeholder = null;
      }

      // Setup animations if available
      if (Object.keys(this.animations).length > 0) {
        console.log(
          "Player animations available:",
          Object.keys(this.animations)
        );

        // Try to play idle animation if it exists
        const animationKeys = Object.keys(this.animations);
        if (animationKeys.length > 0) {
          // Just play the first animation available as idle
          this.animations[animationKeys[0]].play();
        }
      }
    } catch (error) {
      console.error("Error loading player model:", error);
    }
  }

  centerModel() {
    if (!this.model) return;

    // Create a bounding box for the model
    const bbox = new THREE.Box3().setFromObject(this.model);
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());

    // Center the model horizontally but keep bottom at y=0
    this.model.position.x = -center.x;
    this.model.position.z = -center.z;

    // Position bottom of model at y=0
    this.model.position.y = -bbox.min.y;

    // Apply specific adjustments for the low-poly human model
    this.model.position.y += 0; // Remove extra height adjustment

    // Adjust rotation to face forward (for the low-poly human model)
    this.model.rotation.y = Math.PI; // Rotate to face forward

    console.log("Player model positioned at:", this.model.position);
    console.log("Player model dimensions:", size);
  }

  move(x, z, deltaTime) {
    // Don't allow movement when dead
    if (this.isDead) {
      this.velocity.x = 0;
      this.velocity.z = 0;
      return;
    }

    // Apply horizontal movement
    this.velocity.x = x * this.moveSpeed;
    this.velocity.z = z * this.moveSpeed;

    // Calculate new position
    const newX = this.group.position.x + this.velocity.x * deltaTime;
    const newZ = this.group.position.z + this.velocity.z * deltaTime;

    // Check map boundaries before moving
    if (newX < -this.mapBoundary) {
      this.group.position.x = -this.mapBoundary;
    } else if (newX > this.mapBoundary) {
      this.group.position.x = this.mapBoundary;
    } else {
      this.group.position.x = newX;
    }

    if (newZ < -this.mapBoundary) {
      this.group.position.z = -this.mapBoundary;
    } else if (newZ > this.mapBoundary) {
      this.group.position.z = this.mapBoundary;
    } else {
      this.group.position.z = newZ;
    }

    // Track if player is moving for footstep sounds and animations
    // Use a small threshold to prevent micro-movements from triggering animations
    const movementMagnitude = Math.sqrt(
      this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z
    );
    this.isMoving = movementMagnitude > 0.1;

    // Apply gravity and vertical movement
    if (this.isJumping) {
      // Apply gravity to vertical velocity
      this.velocity.y -= this.gravity * deltaTime;

      // Apply vertical movement
      this.group.position.y += this.velocity.y * deltaTime;

      // Check if landed
      if (this.group.position.y <= 0) {
        this.group.position.y = 0;
        this.velocity.y = 0;
        this.isJumping = false;

        // Play landing sound
        if (this.soundManager) {
          this.soundManager.play("footstep");
        }
      }
    }

    // Handle footstep sounds
    if (this.isMoving && !this.isJumping && this.soundManager) {
      this.footstepTimer += deltaTime;
      if (this.footstepTimer >= this.footstepInterval) {
        this.soundManager.playFootstep();
        this.footstepTimer = 0;
      }
    }

    // Update animations based on movement
    this.updateAnimation();
  }

  updateAnimation() {
    if (!this.mixer || !this.animations) return;

    // Play appropriate animation based on state
    if (this.isDead) {
      if (this.animations["Death"] || this.animations["death"]) {
        const deathAnim = this.animations["Death"] || this.animations["death"];
        if (!deathAnim.isRunning()) {
          // Stop all other animations
          Object.values(this.animations).forEach((action) => action.stop());
          deathAnim.play();
        }
      }
    } else if (this.isJumping) {
      if (this.animations["Jump"] || this.animations["jump"]) {
        const jumpAnim = this.animations["Jump"] || this.animations["jump"];
        if (!jumpAnim.isRunning()) {
          // Stop all other animations
          Object.values(this.animations).forEach((action) => action.stop());
          jumpAnim.play();
        }
      }
    } else if (this.isMoving) {
      if (
        this.animations["Run"] ||
        this.animations["run"] ||
        this.animations["Walk"] ||
        this.animations["walk"]
      ) {
        const runAnim =
          this.animations["Run"] ||
          this.animations["run"] ||
          this.animations["Walk"] ||
          this.animations["walk"];
        if (!runAnim.isRunning()) {
          // Stop all other animations
          Object.values(this.animations).forEach((action) => action.stop());
          runAnim.play();
        }
      }
    } else {
      // If not moving, play idle animation
      if (this.animations["Idle"] || this.animations["idle"]) {
        const idleAnim = this.animations["Idle"] || this.animations["idle"];
        if (!idleAnim.isRunning()) {
          // Stop all other animations
          Object.values(this.animations).forEach((action) => action.stop());
          idleAnim.play();
        }
      }
    }
  }

  jump() {
    if (!this.isJumping && !this.isDead) {
      this.isJumping = true;
      this.velocity.y = this.jumpForce;

      // Play jump sound
      if (this.soundManager) {
        this.soundManager.play("jump");
      }
    }
  }

  takeDamage(amount) {
    // Don't take damage if invulnerable or dead
    if (this.isInvulnerable || this.isDead) {
      return false;
    }

    // Apply damage
    this.health -= amount;

    // Flash player model
    this.showDamageEffect();

    // Play damage sound
    if (this.soundManager) {
      this.soundManager.play("damage");
    }

    // Enter invulnerability period
    this.isInvulnerable = true;
    this.invulnerabilityTimer = this.invulnerabilityTime;

    // Check for death
    if (this.health <= 0) {
      this.die();
      return true;
    }

    return false;
  }

  die() {
    if (this.isDead) return;

    this.isDead = true;
    this.health = 0;

    // Play death sound
    if (this.soundManager) {
      this.soundManager.play("death");
    }

    // Update animation to death pose
    this.updateAnimation();
  }

  reset() {
    // Reset player state
    this.health = this.maxHealth;
    this.isDead = false;
    this.isInvulnerable = false;
    this.invulnerabilityTimer = 0;

    // Reset position and rotation
    this.group.position.set(0, 0, 0);
    this.group.rotation.set(0, 0, 0);

    // Reset physics
    this.velocity.set(0, 0, 0);
    this.isJumping = false;

    // Reset animations to idle
    this.updateAnimation();
  }

  showDamageEffect() {
    if (!this.model) return;

    // Flash the model red
    this.model.traverse((node) => {
      if (node.isMesh && node.material) {
        // Store original color if not already stored
        if (!node._originalEmissive) {
          node._originalEmissive = node.material.emissive
            ? node.material.emissive.clone()
            : new THREE.Color(0, 0, 0);
        }

        // Set emissive to red
        if (node.material.emissive) {
          node.material.emissive.setRGB(0.5, 0, 0);
        }
      }
    });

    // Reset after a short time
    setTimeout(() => {
      this.model.traverse((node) => {
        if (node.isMesh && node.material && node._originalEmissive) {
          if (node.material.emissive) {
            node.material.emissive.copy(node._originalEmissive);
          }
        }
      });
    }, 200);
  }

  update(deltaTime) {
    // Handle invulnerability timer
    if (this.isInvulnerable) {
      this.invulnerabilityTimer -= deltaTime;

      // Flash effect during invulnerability
      if (Math.floor(this.invulnerabilityTimer * 10) % 2 === 0) {
        // Make model visible
        if (this.model) {
          this.model.visible = true;
        }
      } else {
        // Make model semi-transparent
        if (this.model) {
          this.model.visible = false;
        }
      }

      // End invulnerability when timer expires
      if (this.invulnerabilityTimer <= 0) {
        this.isInvulnerable = false;
        if (this.model) {
          this.model.visible = true;
        }
      }
    }

    // Update animation mixer
    if (this.mixer) {
      this.mixer.update(deltaTime);
    }
  }

  // Get position for camera targeting
  get position() {
    return this.group.position;
  }

  // Get a reference to the visual object representing the player
  get mesh() {
    return this.group;
  }

  // Set the player's rotation directly
  setRotation(angle) {
    this.group.rotation.y = angle;
  }
}
