import * as THREE from "three";

export class Gorilla {
  constructor(scene, soundManager, modelLoader) {
    // Gorilla properties
    this.moveSpeed = 3.5;
    this.attackDistance = 2;
    this.isAttacking = false;
    this.attackCooldown = 0;
    this.attackDuration = 0.5;
    this.damage = 20; // Damage per attack
    this.soundManager = soundManager;
    this.attackAnimationStep = 0;
    this.attackComplete = false;
    this.attackAnimationTimer = 0;
    this.attackAnimationDuration = 0.4;
    this.scene = scene;

    // Map boundaries - to match player boundaries
    this.mapBoundary = 20;

    // Combat stats
    this.health = 200;
    this.maxHealth = 200;
    this.isDead = false;
    this.currentTarget = null;
    this.aggroRange = 30; // Distance at which gorilla detects targets
    this.targetLockDuration = 10; // Seconds to keep targeting the same bot
    this.currentTargetTime = 0;

    // Create a group to hold the model and manage positioning
    this.group = new THREE.Group();
    this.scene.add(this.group);

    // Create simple mesh as placeholder while the model loads
    const geometry = new THREE.CapsuleGeometry(1, 2, 4, 8);
    const material = new THREE.MeshBasicMaterial({
      color: 0x8b4513, // Brown color
      transparent: true,
      opacity: 0.5,
    });
    this.placeholder = new THREE.Mesh(geometry, material);
    this.placeholder.position.set(0, 2, 0);
    this.placeholder.castShadow = true;
    this.group.add(this.placeholder);

    // Default material color (for resetting after attack)
    this.defaultColor = material.color.clone();
    this.attackColor = new THREE.Color(0xff0000); // Red for attack
    this.rageColor = new THREE.Color(0xff4500); // OrangeRed for rage mode

    // Reference to actual model
    this.model = null;
    this.mixer = null;
    this.animations = {};

    // Load the 3D model
    if (modelLoader) {
      this.loadModel(modelLoader);
    }

    // Set initial position (away from player)
    this.group.position.set(15, 0, 15);
  }

  async loadModel(modelLoader) {
    try {
      // Load the gorilla model
      const result = await modelLoader.loadAnimatedModel(
        "/models/gorilla/gorilla.gltf",
        {
          scale: 0.02, // Much smaller scale for this model based on its dimensions
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
          "Gorilla animations available:",
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
      console.error("Error loading gorilla model:", error);
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

    // Apply specific adjustments for this model
    this.model.position.y += 0.5; // Lift model up a bit

    // Adjust rotation if needed (models often face different directions)
    this.model.rotation.y = Math.PI; // Rotate to face forward (adjust as needed)

    console.log("Gorilla model positioned at:", this.model.position);
    console.log("Gorilla model dimensions:", size);
  }

  update(deltaTime, player, bots) {
    // Skip if dead
    if (this.isDead) return;

    // Handle attack cooldown
    if (this.attackCooldown > 0) {
      this.attackCooldown -= deltaTime;

      // Update attack animation
      if (this.isAttacking) {
        this.updateAttackAnimation(deltaTime);
      }

      if (this.attackCooldown <= 0) {
        // Reset color when attack animation ends
        this.isAttacking = false;
        this.resetAttackState();
      }
    }

    // Find nearest bot or player
    const target = this.findNearestTarget(bots);

    // If no target, just wander
    if (!target) {
      this.wander(deltaTime);
      return;
    }

    // Calculate distance to target
    const targetPosition = target.position;
    const distanceToTarget = this.group.position.distanceTo(targetPosition);

    // If within attack range and not attacking, start attack
    if (
      distanceToTarget <= this.attackDistance &&
      !this.isAttacking &&
      this.attackCooldown <= 0
    ) {
      this.attack(target);
    }
    // Otherwise move toward target
    else if (!this.isAttacking) {
      // Calculate direction to target
      const direction = new THREE.Vector3();
      direction.subVectors(targetPosition, this.group.position).normalize();

      // Calculate new position
      const newX =
        this.group.position.x + direction.x * this.moveSpeed * deltaTime;
      const newZ =
        this.group.position.z + direction.z * this.moveSpeed * deltaTime;

      // Apply movement with boundary checks
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

      // Face target
      const angle = Math.atan2(direction.x, direction.z);
      this.group.rotation.y = angle;

      // Play walk/run animation
      this.playAnimation("walk");
    }

    // Update animation mixer
    if (this.mixer) {
      this.mixer.update(deltaTime);
    }

    // Update target lock timer
    if (this.currentTarget) {
      this.currentTargetTime -= deltaTime;
      if (this.currentTargetTime <= 0) {
        this.currentTarget = null; // Clear target lock
      }
    }
  }

  findNearestTarget(bots) {
    // If we already have a target and it's still valid, keep focusing on it
    if (
      this.currentTarget &&
      this.currentTargetTime > 0 &&
      !this.currentTarget.isDead
    ) {
      return this.currentTarget;
    }

    let nearestDistance = this.aggroRange;
    let nearestTarget = null;

    // Check bots
    for (const bot of bots) {
      if (bot.isDead) continue;

      const distance = this.group.position.distanceTo(bot.position);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestTarget = bot;
      }
    }

    // Set as current target with timer
    if (nearestTarget) {
      this.currentTarget = nearestTarget;
      this.currentTargetTime = this.targetLockDuration;
    }

    return nearestTarget;
  }

  wander(deltaTime) {
    // Simple random movement when no targets
    if (Math.random() < 0.01) {
      // Randomly change direction occasionally
      this.group.rotation.y = Math.random() * Math.PI * 2;
    }

    // Move forward in current direction
    const speed = this.moveSpeed * 0.5; // Slower wandering
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(
      this.group.quaternion
    );

    // Calculate new position
    const newX = this.group.position.x + direction.x * speed * deltaTime;
    const newZ = this.group.position.z + direction.z * speed * deltaTime;

    // Apply movement with boundary checks
    if (newX < -this.mapBoundary) {
      this.group.position.x = -this.mapBoundary;
      // Change direction when hitting boundary
      this.group.rotation.y = Math.random() * Math.PI * 2;
    } else if (newX > this.mapBoundary) {
      this.group.position.x = this.mapBoundary;
      // Change direction when hitting boundary
      this.group.rotation.y = Math.random() * Math.PI * 2;
    } else {
      this.group.position.x = newX;
    }

    if (newZ < -this.mapBoundary) {
      this.group.position.z = -this.mapBoundary;
      // Change direction when hitting boundary
      this.group.rotation.y = Math.random() * Math.PI * 2;
    } else if (newZ > this.mapBoundary) {
      this.group.position.z = this.mapBoundary;
      // Change direction when hitting boundary
      this.group.rotation.y = Math.random() * Math.PI * 2;
    } else {
      this.group.position.z = newZ;
    }

    // Make sure the gorilla stays within a smaller area if it gets too far
    const distanceFromCenter = this.group.position.length();
    if (distanceFromCenter > 15) {
      // Turn back toward center
      const toCenter = new THREE.Vector3(
        -this.group.position.x,
        0,
        -this.group.position.z
      ).normalize();
      const angle = Math.atan2(toCenter.x, toCenter.z);
      this.group.rotation.y = angle;
    }
  }

  playAnimation(type) {
    if (!this.mixer || !this.animations) return;

    // Don't change animation during attack
    if (this.isAttacking) return;

    // Find appropriate animation
    let anim = null;

    switch (type) {
      case "idle":
        anim = this.animations["Idle"] || this.animations["idle"];
        break;
      case "walk":
      case "run":
        anim =
          this.animations["Walk"] ||
          this.animations["walk"] ||
          this.animations["Run"] ||
          this.animations["run"];
        break;
      case "attack":
        anim =
          this.animations["Attack"] ||
          this.animations["attack"] ||
          this.animations["Punch"] ||
          this.animations["punch"];
        break;
      case "death":
        anim =
          this.animations["Death"] ||
          this.animations["death"] ||
          this.animations["Die"] ||
          this.animations["die"];
        break;
    }

    // Play animation if found and not already playing
    if (anim && !anim.isRunning()) {
      // Stop all current animations
      Object.values(this.animations).forEach((a) => a.stop());

      // Play new animation
      anim.reset();
      anim.play();
    }
  }

  attack(target) {
    if (this.isAttacking) return;

    this.isAttacking = true;
    this.attackCooldown = this.attackDuration;
    this.attackAnimationStep = 0;
    this.attackComplete = false;
    this.attackAnimationTimer = 0;

    // Show attack visuals
    this.showAttackVisuals();

    // Play attack sound
    if (this.soundManager) {
      this.soundManager.play("attack");
    }

    // Play attack animation
    this.playAnimation("attack");

    // Deal damage to target
    if (target && typeof target.takeDamage === "function") {
      const killed = target.takeDamage(this.damage);
      if (killed) {
        this.currentTarget = null; // Clear target if killed
      }
    }
  }

  showAttackVisuals() {
    if (!this.model) return;

    // Flash the model red to indicate attack
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
  }

  resetAttackState() {
    if (!this.model) return;

    // Reset model colors
    this.model.traverse((node) => {
      if (node.isMesh && node.material && node._originalEmissive) {
        if (node.material.emissive) {
          node.material.emissive.copy(node._originalEmissive);
        }
      }
    });

    // Play idle animation
    this.playAnimation("idle");
  }

  updateAttackAnimation(deltaTime) {
    this.attackAnimationTimer += deltaTime;

    // Early return if animation is already complete
    if (this.attackComplete) return;

    const progress = this.attackAnimationTimer / this.attackAnimationDuration;

    // If we're using the 3D model with its own animations, we don't need this custom animation
    if (this.model && this.mixer) return;

    // If we're still using the placeholder, animate it
    if (progress >= 1.0) {
      this.attackComplete = true;
    }
  }

  takeDamage(amount) {
    if (this.isDead) return false;

    // Apply damage
    this.health -= amount;

    // Visual feedback
    this.showDamageEffect();

    // Check for death
    if (this.health <= 0) {
      this.die();
      return true;
    }

    return false;
  }

  showDamageEffect() {
    if (!this.model) return;

    // Flash the model white to indicate damage
    this.model.traverse((node) => {
      if (node.isMesh && node.material) {
        // Store original color if not already stored
        if (!node._originalEmissive) {
          node._originalEmissive = node.material.emissive
            ? node.material.emissive.clone()
            : new THREE.Color(0, 0, 0);
        }

        // Set emissive to white briefly
        if (node.material.emissive) {
          node.material.emissive.setRGB(1, 1, 1);

          // Reset after a short time
          setTimeout(() => {
            if (node.material && node.material.emissive) {
              node.material.emissive.copy(node._originalEmissive);
            }
          }, 100);
        }
      }
    });
  }

  die() {
    this.isDead = true;
    this.health = 0;

    // Play death animation if available
    this.playAnimation("death");

    // Play death sound
    if (this.soundManager) {
      this.soundManager.play("death");
    }

    // Remove from scene after a delay
    setTimeout(() => {
      if (this.scene && this.group) {
        this.scene.remove(this.group);
      }
    }, 3000); // Remove after 3 seconds
  }

  dealDamage(target) {
    if (!this.isAttacking || this.attackComplete) return;

    // Deal damage to target if attack animation is at the right point
    const progress = this.attackAnimationTimer / this.attackAnimationDuration;

    // For 3D model, check if we have an attack animation
    if (this.model && this.mixer && this.animations) {
      // Find attack animation
      const attackAnim =
        this.animations["Attack"] ||
        this.animations["attack"] ||
        this.animations["Punch"] ||
        this.animations["punch"];

      if (attackAnim) {
        // Deal damage at a specific point in the animation (adjust as needed)
        const attackTime = attackAnim.getClip().duration * 0.5; // Middle of animation

        if (attackAnim.time >= attackTime && !this.attackComplete) {
          if (target && typeof target.takeDamage === "function") {
            target.takeDamage(this.damage);
          }
          this.attackComplete = true;
        }

        return;
      }
    }

    // Fallback for placeholder: Deal damage during the strike phase
    if (progress >= 0.3 && progress <= 0.6 && !this.attackComplete) {
      if (target && typeof target.takeDamage === "function") {
        target.takeDamage(this.damage);
      }
      this.attackComplete = true;
    }
  }

  // Get position
  get position() {
    return this.group.position;
  }

  // Get a reference to the visual object representing the gorilla
  get mesh() {
    return this.group;
  }
}
