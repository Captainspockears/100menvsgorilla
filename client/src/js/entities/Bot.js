import * as THREE from "three";
import { ModelLoader } from "../utils/ModelLoader";

export class Bot {
  constructor(scene) {
    // Bot properties
    this.moveSpeed = 2;
    this.wanderRadius = 20;
    this.directionChangeInterval = 3; // seconds
    this.timeSinceDirectionChange = 0;
    this.scene = scene;

    // Map boundaries - to match player and gorilla boundaries
    this.mapBoundary = 20;

    // Combat properties
    this.health = 50;
    this.maxHealth = 50;
    this.isDead = false;
    this.isAttacking = false;
    this.attackCooldown = 0;
    this.attackDuration = 0.5;
    this.attackDistance = 1.5;
    this.damage = 5;
    this.aggroRange = 15; // Distance to detect enemies
    this.fleeHealthPercent = 0.3; // Flee when health below 30%
    this.currentTarget = null;

    // Current movement direction
    this.direction = new THREE.Vector3(
      Math.random() * 2 - 1,
      0,
      Math.random() * 2 - 1
    ).normalize();

    // Create temporary placeholder mesh until model loads
    const geometry = new THREE.CapsuleGeometry(0.4, 0.8, 4, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 }); // Green color
    this.mesh = new THREE.Mesh(geometry, material);

    // Random position within wander radius
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * this.wanderRadius;
    this.mesh.position.set(
      Math.cos(angle) * radius,
      0.5, // Match player's height from ground
      Math.sin(angle) * radius
    );

    this.mesh.castShadow = true;

    // Add to scene
    scene.add(this.mesh);

    // Load the human model
    this.loadModel();
  }

  async loadModel() {
    try {
      const modelLoader = new ModelLoader();
      const modelPath = "/models/human/scene.gltf";

      const { model, mixer, animations } = await modelLoader.loadAnimatedModel(
        modelPath,
        {
          scale: 0.75, // Match player scale
          castShadow: true,
          receiveShadow: true,
        }
      );

      // Store the model and animation info
      this.model = model;
      this.mixer = mixer;
      this.animations = animations;

      // Center and position the model properly
      this.centerModel();

      // Tint the bot model green to distinguish from player
      this.model.traverse((node) => {
        if (node.isMesh && node.material) {
          if (Array.isArray(node.material)) {
            node.material.forEach((mat) => {
              // Apply green tint
              if (mat.color) {
                mat.color.setRGB(0.4, 0.9, 0.4);
              }
            });
          } else if (node.material.color) {
            // Apply green tint
            node.material.color.setRGB(0.4, 0.9, 0.4);
          }
        }
      });

      // Remove the placeholder and add the model
      this.scene.remove(this.mesh);
      this.scene.add(this.model);

      // Replace the mesh reference with the model
      this.mesh = this.model;

      // Play an animation if available
      if (animations && Object.keys(animations).length > 0) {
        const animationName = Object.keys(animations)[0];
        animations[animationName].play();
      }
    } catch (error) {
      console.error("Failed to load human model:", error);
    }
  }

  centerModel() {
    if (!this.model) return;

    // Create a bounding box for the model
    const bbox = new THREE.Box3().setFromObject(this.model);
    const center = bbox.getCenter(new THREE.Vector3());

    // Center the model horizontally
    this.model.position.x = this.mesh.position.x - center.x;
    this.model.position.z = this.mesh.position.z - center.z;

    // Position bottom of model at ground level
    this.model.position.y = this.mesh.position.y - bbox.min.y;

    // Adjust rotation to match placeholder
    this.model.rotation.y = this.mesh.rotation.y;
  }

  update(deltaTime, gorilla, otherBots) {
    // Skip if dead
    if (this.isDead) return;

    // Update animation mixer if it exists
    if (this.mixer) {
      this.mixer.update(deltaTime);
    }

    // Update attack cooldown
    if (this.attackCooldown > 0) {
      this.attackCooldown -= deltaTime;
      if (this.attackCooldown <= 0) {
        this.isAttacking = false;
      }
    }

    // Decision-making: check for nearby threats or targets
    this.updateBehavior(deltaTime, gorilla, otherBots);
  }

  updateBehavior(deltaTime, gorilla, otherBots) {
    // If attacking, don't change behavior until attack is done
    if (this.isAttacking) return;

    // Check if we should flee (low health)
    if (this.health / this.maxHealth < this.fleeHealthPercent) {
      this.flee(deltaTime, gorilla);
      return;
    }

    // Check for gorilla - prioritize attacking it if nearby
    if (
      !gorilla.isDead &&
      this.isTargetInRange(gorilla.position, this.aggroRange)
    ) {
      this.currentTarget = gorilla;

      // If close enough to attack
      if (this.isTargetInRange(gorilla.position, this.attackDistance)) {
        this.attack(gorilla);
      } else {
        // Move toward gorilla
        this.moveToward(deltaTime, gorilla.position);
      }
      return;
    }

    // No targets, just wander
    this.wander(deltaTime);
  }

  isTargetInRange(targetPosition, range) {
    return this.mesh.position.distanceTo(targetPosition) <= range;
  }

  moveToward(deltaTime, targetPosition) {
    // Calculate direction to target
    const direction = new THREE.Vector3();
    direction.subVectors(targetPosition, this.mesh.position).normalize();

    // Calculate new position
    const newX =
      this.mesh.position.x + direction.x * this.moveSpeed * deltaTime;
    const newZ =
      this.mesh.position.z + direction.z * this.moveSpeed * deltaTime;

    // Apply movement with boundary checks
    if (newX < -this.mapBoundary) {
      this.mesh.position.x = -this.mapBoundary;
    } else if (newX > this.mapBoundary) {
      this.mesh.position.x = this.mapBoundary;
    } else {
      this.mesh.position.x = newX;
    }

    if (newZ < -this.mapBoundary) {
      this.mesh.position.z = -this.mapBoundary;
    } else if (newZ > this.mapBoundary) {
      this.mesh.position.z = this.mapBoundary;
    } else {
      this.mesh.position.z = newZ;
    }

    // Face the target
    const angle = Math.atan2(direction.x, direction.z);
    this.mesh.rotation.y = angle;

    // Play running animation
    this.playAnimation("run");
  }

  flee(deltaTime, threat) {
    if (!threat) return;

    // Calculate direction away from threat
    const direction = new THREE.Vector3();
    direction.subVectors(this.mesh.position, threat.position).normalize();

    // Calculate new position
    const newX =
      this.mesh.position.x + direction.x * this.moveSpeed * 1.5 * deltaTime;
    const newZ =
      this.mesh.position.z + direction.z * this.moveSpeed * 1.5 * deltaTime;

    // Apply movement with boundary checks
    if (newX < -this.mapBoundary) {
      this.mesh.position.x = -this.mapBoundary;
    } else if (newX > this.mapBoundary) {
      this.mesh.position.x = this.mapBoundary;
    } else {
      this.mesh.position.x = newX;
    }

    if (newZ < -this.mapBoundary) {
      this.mesh.position.z = -this.mapBoundary;
    } else if (newZ > this.mapBoundary) {
      this.mesh.position.z = this.mapBoundary;
    } else {
      this.mesh.position.z = newZ;
    }

    // Face away from threat
    const angle = Math.atan2(direction.x, direction.z);
    this.mesh.rotation.y = angle;

    // Play running animation
    this.playAnimation("run");
  }

  attack(target) {
    if (this.isAttacking || this.attackCooldown > 0) return;

    this.isAttacking = true;
    this.attackCooldown = this.attackDuration;

    // Play attack animation
    this.playAnimation("attack");

    // Deal damage
    if (target && typeof target.takeDamage === "function") {
      target.takeDamage(this.damage);
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
          node.material.emissive.setRGB(1, 0, 0);

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

    // Play death animation
    this.playAnimation("death");

    // Remove from scene after a delay
    setTimeout(() => {
      if (this.scene && this.mesh) {
        this.scene.remove(this.mesh);
      }
    }, 3000);
  }

  playAnimation(type) {
    if (!this.mixer || !this.animations) return;

    // Find appropriate animation
    let anim = null;

    switch (type) {
      case "idle":
        anim = this.animations["Idle"] || this.animations["idle"];
        break;
      case "walk":
        anim = this.animations["Walk"] || this.animations["walk"];
        break;
      case "run":
        anim =
          this.animations["Run"] ||
          this.animations["run"] ||
          this.animations["Walk"] ||
          this.animations["walk"];
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

  wander(deltaTime) {
    // Update timer for direction changes
    this.timeSinceDirectionChange += deltaTime;
    if (this.timeSinceDirectionChange >= this.directionChangeInterval) {
      this.changeDirection();
      this.timeSinceDirectionChange = 0;
    }

    // Move forward in current direction
    const direction = new THREE.Vector3(0, 0, 1).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      this.mesh.rotation.y
    );

    // Calculate new position
    const newX =
      this.mesh.position.x + direction.x * this.moveSpeed * 0.5 * deltaTime;
    const newZ =
      this.mesh.position.z + direction.z * this.moveSpeed * 0.5 * deltaTime;

    // Apply movement with boundary checks
    if (newX < -this.mapBoundary) {
      this.mesh.position.x = -this.mapBoundary;
      this.changeDirection(); // Change direction when hitting boundary
    } else if (newX > this.mapBoundary) {
      this.mesh.position.x = this.mapBoundary;
      this.changeDirection(); // Change direction when hitting boundary
    } else {
      this.mesh.position.x = newX;
    }

    if (newZ < -this.mapBoundary) {
      this.mesh.position.z = -this.mapBoundary;
      this.changeDirection(); // Change direction when hitting boundary
    } else if (newZ > this.mapBoundary) {
      this.mesh.position.z = this.mapBoundary;
      this.changeDirection(); // Change direction when hitting boundary
    } else {
      this.mesh.position.z = newZ;
    }

    // Make bots tend to stay closer to the center
    const distanceFromCenter = this.mesh.position.length();
    if (distanceFromCenter > 15) {
      // Turn toward center
      const angleToCenter = Math.atan2(
        -this.mesh.position.x,
        -this.mesh.position.z
      );
      this.mesh.rotation.y = angleToCenter;
    }

    // Play walking animation
    this.playAnimation("walk");
  }

  changeDirection() {
    // Random new direction
    const newDirection = new THREE.Vector3(
      Math.random() * 2 - 1,
      0,
      Math.random() * 2 - 1
    ).normalize();

    // Smoothly transition to new direction
    this.direction.lerp(newDirection, 0.5).normalize();
  }

  get position() {
    return this.mesh.position;
  }

  get isAlive() {
    return !this.isDead;
  }
}
