// Utility to generate placeholder sounds using Web Audio API
export class SoundGenerator {
  constructor() {
    this.audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
  }

  // Generate an attack sound
  generateAttackSound() {
    return this.generateSound({
      frequency: 150,
      type: "sawtooth",
      duration: 0.3,
      attack: 0.01,
      decay: 0.1,
      sustain: 0.2,
      release: 0.2,
      volume: 0.6,
    });
  }

  // Generate damage sound
  generateDamageSound() {
    return this.generateSound({
      frequency: 200,
      type: "sine",
      duration: 0.5,
      attack: 0.01,
      decay: 0.1,
      sustain: 0.1,
      release: 0.3,
      volume: 0.5,
    });
  }

  // Generate death sound
  generateDeathSound() {
    return this.generateSound({
      frequency: 100,
      type: "sine",
      duration: 1.0,
      attack: 0.01,
      decay: 0.2,
      sustain: 0.5,
      release: 0.5,
      volume: 0.7,
      frequencyEnd: 50,
    });
  }

  // Generate jump sound
  generateJumpSound() {
    return this.generateSound({
      frequency: 300,
      type: "sine",
      duration: 0.2,
      attack: 0.01,
      decay: 0.1,
      sustain: 0.0,
      release: 0.1,
      volume: 0.3,
      frequencyEnd: 500,
    });
  }

  // Generate footstep sound
  generateFootstepSound() {
    return this.generateSound({
      frequency: 120,
      type: "triangle",
      duration: 0.1,
      attack: 0.01,
      decay: 0.05,
      sustain: 0.0,
      release: 0.1,
      volume: 0.2,
    });
  }

  // Generate sound with ADSR envelope
  generateSound(options) {
    const audioContext = this.audioContext;
    const {
      frequency,
      type,
      duration,
      attack,
      decay,
      sustain,
      release,
      volume,
      frequencyEnd,
    } = options;

    // Create buffer
    const sampleRate = audioContext.sampleRate;
    const totalSamples = Math.ceil(duration * sampleRate);
    const buffer = audioContext.createBuffer(1, totalSamples, sampleRate);
    const data = buffer.getChannelData(0);

    // ADSR times in samples
    const attackSamples = Math.floor(attack * sampleRate);
    const decaySamples = Math.floor(decay * sampleRate);
    const sustainSamples = Math.floor(sustain * sampleRate);
    const releaseSamples = Math.floor(release * sampleRate);

    // Generate waveform with envelope
    for (let i = 0; i < totalSamples; i++) {
      // Calculate envelope
      let envelope = 0;
      if (i < attackSamples) {
        // Attack phase
        envelope = i / attackSamples;
      } else if (i < attackSamples + decaySamples) {
        // Decay phase
        const decayProgress = (i - attackSamples) / decaySamples;
        envelope = 1 - decayProgress * (1 - sustain);
      } else if (i < attackSamples + decaySamples + sustainSamples) {
        // Sustain phase
        envelope = sustain;
      } else {
        // Release phase
        const releaseProgress =
          (i - (attackSamples + decaySamples + sustainSamples)) /
          releaseSamples;
        envelope = sustain * (1 - releaseProgress);
      }

      // Calculate frequency if it changes over time
      let currentFreq = frequency;
      if (frequencyEnd !== undefined) {
        const progress = i / totalSamples;
        currentFreq = frequency + (frequencyEnd - frequency) * progress;
      }

      // Generate waveform
      const t = i / sampleRate;
      const period = 1 / currentFreq;
      const phase = (t % period) / period;

      let sample = 0;
      switch (type) {
        case "sine":
          sample = Math.sin(phase * Math.PI * 2);
          break;
        case "square":
          sample = phase < 0.5 ? 1 : -1;
          break;
        case "sawtooth":
          sample = 2 * (phase - Math.floor(phase + 0.5));
          break;
        case "triangle":
          sample = 1 - 4 * Math.abs(Math.round(phase) - phase);
          break;
        default:
          sample = Math.sin(phase * Math.PI * 2);
      }

      // Apply envelope and volume
      data[i] = sample * envelope * volume;
    }

    // Convert buffer to blob
    const blob = this.bufferToWav(buffer);
    return URL.createObjectURL(blob);
  }

  // Convert AudioBuffer to WAV Blob
  bufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length;
    const data = new Float32Array(length * numChannels);

    // Extract data from buffer
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        data[i * numChannels + channel] = channelData[i];
      }
    }

    // Convert to 16-bit PCM
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const buffer16Bit = new Int16Array(data.length);
    for (let i = 0; i < data.length; i++) {
      const s = Math.max(-1, Math.min(1, data[i]));
      buffer16Bit[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    // Create WAV file
    const dataSize = buffer16Bit.length * bytesPerSample;
    const headerSize = 44;
    const wavBuffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(wavBuffer);

    // Write WAV header
    this.writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    this.writeString(view, 8, "WAVE");
    this.writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);
    this.writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);

    // Write audio data
    const bytes = new Uint8Array(wavBuffer, headerSize);
    const buffer8Bit = new Uint8Array(buffer16Bit.buffer);
    for (let i = 0; i < buffer8Bit.length; i++) {
      bytes[i] = buffer8Bit[i];
    }

    return new Blob([wavBuffer], { type: "audio/wav" });
  }

  writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}
