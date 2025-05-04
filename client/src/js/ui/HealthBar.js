export class HealthBar {
  constructor() {
    this.maxHealth = 100;
    this.currentHealth = 100;
    this.container = null;
    this.bar = null;
    this.damageOverlay = null;
    this.isDead = false;

    this.createUI();
  }

  createUI() {
    // Create container
    this.container = document.createElement("div");
    this.container.className = "health-container";
    this.container.style.position = "absolute";
    this.container.style.bottom = "20px";
    this.container.style.left = "20px";
    this.container.style.width = "300px";
    this.container.style.height = "30px";
    this.container.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    this.container.style.borderRadius = "5px";
    this.container.style.padding = "3px";
    this.container.style.transition = "opacity 0.3s ease";

    // Create health bar
    this.bar = document.createElement("div");
    this.bar.className = "health-bar";
    this.bar.style.width = "100%";
    this.bar.style.height = "100%";
    this.bar.style.backgroundColor = "#2ecc71";
    this.bar.style.borderRadius = "3px";
    this.bar.style.transition = "width 0.3s ease, background-color 0.3s ease";

    // Create damage overlay (full screen red flash when taking damage)
    this.damageOverlay = document.createElement("div");
    this.damageOverlay.className = "damage-overlay";
    this.damageOverlay.style.position = "absolute";
    this.damageOverlay.style.top = "0";
    this.damageOverlay.style.left = "0";
    this.damageOverlay.style.width = "100%";
    this.damageOverlay.style.height = "100%";
    this.damageOverlay.style.backgroundColor = "rgba(255, 0, 0, 0.0)";
    this.damageOverlay.style.pointerEvents = "none";
    this.damageOverlay.style.transition = "background-color 0.3s ease";

    // Create death screen
    this.deathScreen = document.createElement("div");
    this.deathScreen.className = "death-screen";
    this.deathScreen.style.position = "absolute";
    this.deathScreen.style.top = "0";
    this.deathScreen.style.left = "0";
    this.deathScreen.style.width = "100%";
    this.deathScreen.style.height = "100%";
    this.deathScreen.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
    this.deathScreen.style.display = "flex";
    this.deathScreen.style.justifyContent = "center";
    this.deathScreen.style.alignItems = "center";
    this.deathScreen.style.color = "#fff";
    this.deathScreen.style.fontSize = "48px";
    this.deathScreen.style.fontFamily = "Arial, sans-serif";
    this.deathScreen.style.opacity = "0";
    this.deathScreen.style.transition = "opacity 1s ease";
    this.deathScreen.style.pointerEvents = "none";
    this.deathScreen.textContent = "YOU DIED";

    // Add restart button
    this.restartButton = document.createElement("button");
    this.restartButton.textContent = "Restart";
    this.restartButton.style.position = "absolute";
    this.restartButton.style.top = "60%";
    this.restartButton.style.padding = "10px 20px";
    this.restartButton.style.backgroundColor = "#3498db";
    this.restartButton.style.color = "white";
    this.restartButton.style.border = "none";
    this.restartButton.style.borderRadius = "5px";
    this.restartButton.style.fontSize = "20px";
    this.restartButton.style.cursor = "pointer";
    this.restartButton.style.display = "none";
    this.restartButton.addEventListener("click", () => {
      this.onRestartCallback && this.onRestartCallback();
    });

    // Append elements to DOM
    this.container.appendChild(this.bar);
    document.body.appendChild(this.container);
    document.body.appendChild(this.damageOverlay);
    this.deathScreen.appendChild(this.restartButton);
    document.body.appendChild(this.deathScreen);
  }

  setHealth(health) {
    const previousHealth = this.currentHealth;
    this.currentHealth = Math.max(0, Math.min(health, this.maxHealth));

    // Update health bar width and color
    const healthPercent = (this.currentHealth / this.maxHealth) * 100;
    this.bar.style.width = `${healthPercent}%`;

    // Change color based on health percentage
    if (healthPercent > 50) {
      this.bar.style.backgroundColor = "#2ecc71"; // Green
    } else if (healthPercent > 25) {
      this.bar.style.backgroundColor = "#f39c12"; // Orange
    } else {
      this.bar.style.backgroundColor = "#e74c3c"; // Red
    }

    // If health decreased, show damage effect
    if (this.currentHealth < previousHealth) {
      this.showDamageEffect();
    }

    // Check for death
    if (this.currentHealth <= 0 && !this.isDead) {
      this.showDeathScreen();
    }
  }

  damage(amount) {
    this.setHealth(this.currentHealth - amount);
    return this.currentHealth <= 0;
  }

  heal(amount) {
    this.setHealth(this.currentHealth + amount);
  }

  reset() {
    this.currentHealth = this.maxHealth;
    this.isDead = false;
    this.setHealth(this.maxHealth);
    this.deathScreen.style.opacity = "0";
    this.deathScreen.style.pointerEvents = "none";
    this.restartButton.style.display = "none";
  }

  showDamageEffect() {
    // Flash the screen red when taking damage
    this.damageOverlay.style.backgroundColor = "rgba(255, 0, 0, 0.3)";

    setTimeout(() => {
      this.damageOverlay.style.backgroundColor = "rgba(255, 0, 0, 0.0)";
    }, 200);
  }

  showDeathScreen() {
    this.isDead = true;
    this.deathScreen.style.opacity = "1";
    this.deathScreen.style.pointerEvents = "auto";

    // Show restart button after a delay
    setTimeout(() => {
      this.restartButton.style.display = "block";
    }, 1500);
  }

  onRestart(callback) {
    this.onRestartCallback = callback;
  }
}
