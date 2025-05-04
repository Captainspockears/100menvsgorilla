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
    // Combat properties
    this.isAttacking = false;
    this.attackCooldown = 0.5; // seconds between attacks
    this.attackTimer = 0;
    this.attackDamage = 1; // Human default damage (1/100 of gorilla health)
    this.attackRange = 2; // Range of melee attack in units
    this.attackDuration = 0.5; // How long the attack animation lasts

    // Animation state variables
    this.currentAnimation = null;
    this.animationState = "idle";

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

    // Set initial rotation to face down the Z-axis
    this.group.rotation.y = 0;
  }

  async loadModel(modelLoader) {
    try {
      console.log("Loading character model...");

      // Define path to the model based on player type
      const modelPath = this.isGorilla
        ? "/models/gorilla/gorilla.gltf" // Gorilla model
        : "/models/human/human.gltf"; // Human model

      console.log(
        `Using model path: ${modelPath} (isGorilla: ${this.isGorilla})`
      );

      // Load the appropriate model
      const result = await modelLoader.loadAnimatedModel(modelPath, {
        scale: this.isGorilla ? 0.015 : 0.2, // Scale: small for gorilla, doubled for human (was 0.1)
        position: { x: 0, y: 0, z: 0 }, // Standard position
        castShadow: true,
        receiveShadow: true,
      });

      console.log(`Model loaded successfully: ${modelPath}`, result);

      // Get the model and animations
      this.model = result.model;
      this.mixer = result.mixer;
      this.animations = result.animations;

      console.log(
        `Loaded ${this.isGorilla ? "gorilla" : "human"} model: ${modelPath}`
      );
      console.log("Available animations:", Object.keys(this.animations));

      // Center the model
      this.centerModel();
      console.log("Model centered, position:", this.model.position);

      // Apply appropriate tint to the model
      if (this.isGorilla) {
        // Apply brown tint for gorilla
        this.model.traverse((node) => {
          if (node.isMesh && node.material) {
            if (Array.isArray(node.material)) {
              node.material.forEach((mat) => {
                if (mat.color) mat.color.setHex(0x8b4513); // Saddle brown
              });
            } else if (node.material.color) {
              node.material.color.setHex(0x8b4513); // Saddle brown
            }
          }
        });
      } else {
        // Tint the player model with a brighter blue for better visibility
        this.model.traverse((node) => {
          if (node.isMesh && node.material) {
            if (Array.isArray(node.material)) {
              node.material.forEach((mat) => {
                // Store original color
                if (!mat._originalColor && mat.color) {
                  mat._originalColor = mat.color.clone();
                }
                // Apply brighter blue tint
                if (mat.color) {
                  mat.color.setRGB(0.2, 0.4, 1.0); // Brighter blue
                }
              });
            } else if (node.material.color) {
              // Store original color
              if (!node.material._originalColor) {
                node.material._originalColor = node.material.color.clone();
              }
              // Apply brighter blue tint
              node.material.color.setRGB(0.2, 0.4, 1.0); // Brighter blue
            }
          }
        });
      }

      // Add model to group
      this.group.add(this.model);
      console.log("Model added to group", this.group);

      // Add ambient light to make the model visible
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.8); // Increased light intensity
      this.model.add(ambientLight);

      // Add a point light to make the model more visible
      const pointLight = new THREE.PointLight(0xffffff, 1.0);
      pointLight.position.set(0, 2, 0);
      this.model.add(pointLight);

      // Remove placeholder when model is loaded
      if (this.placeholder) {
        this.group.remove(this.placeholder);
        this.placeholder.geometry.dispose();
        this.placeholder.material.dispose();
        this.placeholder = null;
      }

      // Play idle animation
      this.playAnimation("idle");

      // Debug check to make sure model is visible
      console.log("Model visible:", this.model.visible);
      console.log("Model position:", this.model.position);
      console.log("Group position:", this.group.position);

      return this.model; // Return model for promise resolution
    } catch (error) {
      console.error("Error loading player model:", error);

      // Make sure we have a fallback visible representation
      if (!this.placeholder) {
        const geometry = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
        const material = new THREE.MeshBasicMaterial({
          color: this.isGorilla ? 0x8b4513 : 0x0000ff,
          transparent: true,
          opacity: 0.8,
        });
        this.placeholder = new THREE.Mesh(geometry, material);
        this.placeholder.position.set(0, 1, 0);
        this.placeholder.castShadow = true;
        this.group.add(this.placeholder);
        console.log("Added fallback placeholder after model load failure");
      }

      throw error; // Rethrow to allow proper error handling upstream
    }
  }

  centerModel() {
    if (!this.model) return;

    // Create a bounding box for the model
    const bbox = new THREE.Box3().setFromObject(this.model);
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());

    console.log(
      `Model dimensions for ${this.isGorilla ? "gorilla" : "human"}: `,
      size
    );
    console.log(`Model center: `, center);
    console.log(
      `Model bounds: min=${JSON.stringify(bbox.min)}, max=${JSON.stringify(
        bbox.max
      )}`
    );

    // Center the model horizontally but keep bottom at y=0
    this.model.position.x = -center.x;
    this.model.position.z = -center.z;

    // Position bottom of model at y=0
    this.model.position.y = -bbox.min.y;

    // Apply specific adjustments for the human model
    if (!this.isGorilla) {
      // For human model, add specific adjustments
      // Set orientation so player sees the back of the model
      this.model.rotation.y = 0; // Reset back to original orientation (showing the back of the character)

      // Ensure it's visible by adjusting y position
      this.model.position.y += 0.5; // HUMAN POSITION ADJUSTMENT: Raise the model up a bit from the ground

      // Double the size from previous setting
      const modelScale = 0.8; // HUMAN SIZE ADJUSTMENT: Doubled from 0.4 to 0.8
      if (!this.model._hasBeenScaled) {
        this.model.scale.set(modelScale, modelScale, modelScale);
        this.model._hasBeenScaled = true;
      }

      // Add a slight rotation to make it more visible
      this.model.rotation.x = -0.1; // HUMAN TILT ADJUSTMENT: Tilt slightly forward so it's visible
    } else {
      // For gorilla, make sure it's right on the ground
      this.model.position.y = -bbox.min.y;
      // Set gorilla orientation to show its back to the player
      this.model.rotation.y = 0; // Reset to original orientation
    }

    console.log(`Player model positioned at:`, this.model.position);
    console.log(`Player model rotation:`, this.model.rotation);
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
    if (!this.mixer || !this.animations) {
      console.log("Cannot update animation - missing mixer or animations");
      return;
    }

    // Determine the new animation state
    let newState = "idle";

    if (this.isDead) {
      newState = "death";
    } else if (this.isAttacking) {
      newState = "attack";
    } else if (this.isJumping) {
      newState = "jump";
    } else if (this.isMoving) {
      newState = "walk";
    }

    // Only change animation if state has changed
    if (newState !== this.animationState) {
      this.playAnimation(newState);
      this.animationState = newState;
    }
  }

  // Play an animation by name or type
  playAnimation(animationType) {
    if (!this.mixer || !this.animations) return;

    console.log(`Playing animation: ${animationType}`);

    // Find the appropriate animation
    let animation = null;

    // Try to find by type first
    if (this.animations[animationType]) {
      animation = this.animations[animationType];
    } else {
      // Look for animations with this type in their name
      const animationNames = Object.keys(this.animations);
      const matchingAnim = animationNames.find((name) =>
        name.toLowerCase().includes(animationType.toLowerCase())
      );

      if (matchingAnim) {
        animation = this.animations[matchingAnim];
      }
    }

    // If still no animation found for this type, use a default one
    if (!animation) {
      // Decide on fallback animations
      if (animationType === "attack") {
        if (
          this.animations["Punch"] ||
          this.animations["punch"] ||
          this.animations["Hit"] ||
          this.animations["hit"]
        ) {
          animation =
            this.animations["Punch"] ||
            this.animations["punch"] ||
            this.animations["Hit"] ||
            this.animations["hit"];
        } else {
          console.log(
            "No attack animation found, using manual attack movement"
          );
          this.playDefaultAttackAnimation();
          return;
        }
      } else if (animationType === "death") {
        if (
          this.animations["Die"] ||
          this.animations["die"] ||
          this.animations["Fall"] ||
          this.animations["fall"]
        ) {
          animation =
            this.animations["Die"] ||
            this.animations["die"] ||
            this.animations["Fall"] ||
            this.animations["fall"];
        } else {
          // Use first animation as fallback
          const firstAnim = Object.values(this.animations)[0];
          if (firstAnim) animation = firstAnim;
        }
      } else if (animationType === "jump") {
        if (this.animations["Jump"] || this.animations["jump"]) {
          animation = this.animations["Jump"] || this.animations["jump"];
        } else {
          // Use first animation as fallback
          const firstAnim = Object.values(this.animations)[0];
          if (firstAnim) animation = firstAnim;
        }
      } else if (animationType === "walk" || animationType === "run") {
        if (
          this.animations["Walk"] ||
          this.animations["walk"] ||
          this.animations["Run"] ||
          this.animations["run"]
        ) {
          animation =
            this.animations["Walk"] ||
            this.animations["walk"] ||
            this.animations["Run"] ||
            this.animations["run"];
        } else {
          // Use first animation as fallback
          const firstAnim = Object.values(this.animations)[0];
          if (firstAnim) animation = firstAnim;
        }
      } else if (animationType === "idle") {
        if (
          this.animations["Idle"] ||
          this.animations["idle"] ||
          this.animations["Stand"] ||
          this.animations["stand"]
        ) {
          animation =
            this.animations["Idle"] ||
            this.animations["idle"] ||
            this.animations["Stand"] ||
            this.animations["stand"];
        } else {
          // Use first animation as fallback
          const firstAnim = Object.values(this.animations)[0];
          if (firstAnim) animation = firstAnim;
        }
      }
    }

    // Play the animation if found
    if (animation) {
      // Stop current animation with crossfade
      if (this.currentAnimation && this.currentAnimation !== animation) {
        this.currentAnimation.fadeOut(0.2);
      }

      // Configure animation settings
      if (animationType === "death") {
        animation.loop = THREE.LoopOnce;
        animation.clampWhenFinished = true;
      } else if (animationType === "attack") {
        animation.loop = THREE.LoopOnce;
        animation.clampWhenFinished = false;
      } else if (animationType === "jump") {
        animation.loop = THREE.LoopOnce;
        animation.clampWhenFinished = false;
      } else {
        animation.loop = THREE.LoopRepeat;
      }

      // Play the new animation
      this.currentAnimation = animation;
      animation.reset().fadeIn(0.2).play();

      console.log(`Started animation ${animationType}`);
    } else {
      console.log(`No animation found for ${animationType}`);
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

    // Update health bar if we have reference to the game
    if (
      this.multiplayerManager &&
      this.multiplayerManager.gameRef &&
      this.multiplayerManager.gameRef.healthBar
    ) {
      this.multiplayerManager.gameRef.healthBar.setHealth(this.health);
    }

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
    this.animationState = ""; // Force animation update
    this.updateAnimation();
  }

  showDamageEffect() {
    // Skip if no model
    if (!this.model) return;

    // Create a more dramatic flash effect
    const originalMaterials = [];
    const flashMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.8,
    });

    // Save original materials and apply flash
    this.model.traverse((child) => {
      if (child.isMesh && child.material) {
        if (Array.isArray(child.material)) {
          originalMaterials.push({
            mesh: child,
            materials: [...child.material],
          });
          child.material = Array(child.material.length).fill(flashMaterial);
        } else {
          originalMaterials.push({
            mesh: child,
            material: child.material,
          });
          child.material = flashMaterial;
        }
      }
    });

    // Flash duration in milliseconds
    const flashDuration = 200;

    // Restore original materials after flash duration
    setTimeout(() => {
      originalMaterials.forEach(({ mesh, material, materials }) => {
        if (materials) {
          mesh.material = materials;
        } else {
          mesh.material = material;
        }
      });
    }, flashDuration);
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

    // Update attack cooldown timer
    if (this.attackTimer > 0) {
      this.attackTimer -= deltaTime;

      // Attack has finished
      if (this.attackTimer <= 0 && this.isAttacking) {
        this.isAttacking = false;
        this.updateAnimation();
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

  // Method to transform this player into a gorilla
  async makeGorilla(scene, modelLoader) {
    console.log("Transforming player into gorilla");

    // Update player properties to match gorilla
    this.health = 200;
    this.maxHealth = 200;
    this.attackDamage = 20; // Gorilla does 1/5 of human health per hit
    this.moveSpeed = 5;
    this.jumpForce = 15;
    this.isGorilla = true;

    // Store the current position before removing the model
    const currentPosition = this.group.position.clone();

    // Remove the current player model
    if (this.model) {
      this.group.remove(this.model);
    }

    try {
      // Load the gorilla model - using only the main gorilla model path
      const modelPath = "/models/gorilla/gorilla.gltf";

      // Load the gorilla model
      const result = await modelLoader.loadAnimatedModel(modelPath, {
        scale: 0.015,
        position: { x: 0, y: 0, z: 0 },
        castShadow: true,
        receiveShadow: true,
      });

      console.log("Loaded gorilla model");

      // Get the model and animations
      this.model = result.model;
      this.mixer = result.mixer;
      this.animations = result.animations;

      // Position the gorilla model properly within the group
      this.centerModel();

      // Ensure the gorilla's Y position is at ground level
      this.group.position.y = 0;

      // Restore X and Z position
      this.group.position.x = currentPosition.x;
      this.group.position.z = currentPosition.z;

      // Set color to make the gorilla more visible and distinct
      this.model.traverse((node) => {
        if (node.isMesh && node.material) {
          // Apply brown color with reddish tint - more natural but still distinct
          if (Array.isArray(node.material)) {
            node.material.forEach((mat) => {
              if (mat.color) mat.color.setHex(0x8b4513); // Saddle brown
            });
          } else if (node.material.color) {
            node.material.color.setHex(0x8b4513); // Saddle brown
          }
        }
      });

      // Add the gorilla model to the player group
      this.group.add(this.model);

      // Update the collision box for the gorilla
      if (this.collider) {
        this.group.remove(this.collider);
      }

      // Create a collision box that matches human size
      const geometry = new THREE.BoxGeometry(1, 2, 1); // Same as human dimensions
      const material = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        wireframe: true,
        visible: false, // Make it invisible in normal play
      });

      this.collider = new THREE.Mesh(geometry, material);
      this.collider.position.y = 1; // Center of the collision box
      this.group.add(this.collider);

      // Play gorilla sounds
      if (this.soundManager) {
        this.soundManager.play("gorillaRoar");
      }

      // Reset animation state to update to idle
      this.animationState = "";
      this.updateAnimation();

      console.log("Player successfully transformed into gorilla");
      console.log("Gorilla position:", this.group.position);
    } catch (error) {
      console.error("Failed to transform player into gorilla:", error);
    }
  }

  // Method to perform a melee attack
  attack(targets) {
    console.log(
      "Player.attack called - isDead:",
      this.isDead,
      "isAttacking:",
      this.isAttacking,
      "attackTimer:",
      this.attackTimer
    );

    // Don't allow attacks when dead or already attacking
    if (this.isDead || (this.attackTimer > 0 && this.isAttacking)) {
      console.log("Attack prevented - player dead or already attacking");
      return false;
    }

    // Start attack
    this.isAttacking = true;
    this.attackTimer = this.attackDuration;
    console.log("Attack started, duration:", this.attackDuration);

    // Play attack sound
    if (this.soundManager) {
      const soundEffect = this.isGorilla ? "gorillaAttack" : "humanAttack";
      console.log("Playing attack sound:", soundEffect);
      this.soundManager.play(soundEffect);
    }

    // Play attack animation
    this.updateAnimation();
    console.log("Attack animation triggered");

    // Check for targets in range
    if (targets && targets.length > 0) {
      console.log("Checking", targets.length, "targets for hits");
      this.checkAttackHits(targets);
    }

    // Notify multiplayer system about the attack if available
    if (this.multiplayerManager) {
      console.log("Sending attack event to multiplayer");
      this.multiplayerManager.sendAttackEvent();
    } else {
      console.log("No multiplayer manager available");
    }

    return true;
  }

  // Check if attack hits any targets
  checkAttackHits(targets) {
    // Get attacker position
    const attackerPos = this.group.position.clone();

    // Calculate attack direction based on player rotation
    const attackDirection = new THREE.Vector3(0, 0, -1).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      this.group.rotation.y
    );

    // Check each potential target
    targets.forEach((target) => {
      // Skip self or dead targets
      if (target === this || target.isDead) return;

      // Calculate distance to target
      const targetPos = target.group.position.clone();
      const distance = attackerPos.distanceTo(targetPos);

      // Check if target is within attack range
      if (distance <= this.attackRange) {
        // Calculate dot product to see if target is in front of attacker
        const toTarget = targetPos.sub(attackerPos).normalize();
        const dot = toTarget.dot(attackDirection);

        // If dot product is positive, target is in front of attacker
        if (dot > 0.3) {
          // Allow for some leeway in the angle
          // Calculate damage based on attacker type
          let damage = this.attackDamage;

          // Apply damage to target
          target.takeDamage(damage);
        }
      }
    });
  }

  // Handle being attacked by another player
  onAttacked(attackerId, attackerIsGorilla) {
    // Calculate damage based on attacker type
    const damage = attackerIsGorilla ? 20 : 1; // Gorilla does 1/5 of human health, human does 1/100 of gorilla health

    // Apply damage
    this.takeDamage(damage);
  }

  // Method to manually play an attack animation when no animation is found
  playDefaultAttackAnimation() {
    if (!this.model) return;

    // Store initial rotation
    const initialRotation = {
      x: this.model.rotation.x,
      y: this.model.rotation.y,
      z: this.model.rotation.z,
    };

    // Simple animation timeline using keyframes
    const startTime = Date.now();
    const animDuration = 500; // ms

    // Animation function
    const animateAttack = () => {
      const elapsed = Date.now() - startTime;

      if (elapsed < animDuration) {
        // Calculate animation progress (0 to 1)
        const progress = elapsed / animDuration;

        // Simple forward swing animation
        if (progress < 0.5) {
          // First half - swing forward/down
          const swingAmount = Math.sin(progress * Math.PI) * 0.3;
          this.model.rotation.x = initialRotation.x - swingAmount;
        } else {
          // Second half - return to original position
          const reverseProgress = (progress - 0.5) * 2; // 0 to 1
          const swingAmount = Math.sin((1 - reverseProgress) * Math.PI) * 0.3;
          this.model.rotation.x = initialRotation.x - swingAmount;
        }

        // Continue animation
        requestAnimationFrame(animateAttack);
      } else {
        // Reset to original rotation
        this.model.rotation.x = initialRotation.x;
        this.model.rotation.y = initialRotation.y;
        this.model.rotation.z = initialRotation.z;
      }
    };

    // Start animation
    animateAttack();
  }
}
