import { Howl } from "howler";
import { SoundGenerator } from "./SoundGenerator.js";

export class SoundManager {
  constructor() {
    this.sounds = {};
    this.soundGenerator = new SoundGenerator();
    this.initialized = false;
    this.muted = false;
  }

  async initialize() {
    if (this.initialized) return;

    // Generate sounds
    const attackSoundUrl = this.soundGenerator.generateAttackSound();
    const humanAttackSoundUrl = this.soundGenerator.generateHumanAttackSound();
    const gorillaAttackSoundUrl =
      this.soundGenerator.generateGorillaAttackSound();
    const gorillaRoarSoundUrl = this.soundGenerator.generateGorillaRoarSound();
    const damageSoundUrl = this.soundGenerator.generateDamageSound();
    const deathSoundUrl = this.soundGenerator.generateDeathSound();
    const jumpSoundUrl = this.soundGenerator.generateJumpSound();
    const footstepSoundUrl = this.soundGenerator.generateFootstepSound();

    // Create Howl instances for each sound
    this.sounds = {
      attack: new Howl({
        src: [attackSoundUrl],
        volume: 0.5,
      }),
      humanAttack: new Howl({
        src: [humanAttackSoundUrl],
        volume: 0.5,
      }),
      gorillaAttack: new Howl({
        src: [gorillaAttackSoundUrl],
        volume: 0.6,
      }),
      gorillaRoar: new Howl({
        src: [gorillaRoarSoundUrl],
        volume: 0.7,
      }),
      damage: new Howl({
        src: [damageSoundUrl],
        volume: 0.7,
      }),
      death: new Howl({
        src: [deathSoundUrl],
        volume: 0.7,
      }),
      jump: new Howl({
        src: [jumpSoundUrl],
        volume: 0.4,
      }),
      footstep: new Howl({
        src: [footstepSoundUrl],
        volume: 0.3,
      }),
    };

    this.initialized = true;
  }

  play(soundName) {
    if (!this.initialized || this.muted) return;

    const sound = this.sounds[soundName];
    if (sound) {
      sound.play();
    } else {
      console.warn(`Sound "${soundName}" not found`);
    }
  }

  playFootstep() {
    // Small variation in volume for more natural footsteps
    if (!this.initialized || this.muted) return;

    const sound = this.sounds.footstep;
    if (sound) {
      const volume = 0.2 + Math.random() * 0.1;
      sound.volume(volume);
      sound.play();
    }
  }

  mute() {
    this.muted = true;
    Howler.mute(true);
  }

  unmute() {
    this.muted = false;
    Howler.mute(false);
  }

  toggleMute() {
    this.muted = !this.muted;
    Howler.mute(this.muted);
    return this.muted;
  }
}
