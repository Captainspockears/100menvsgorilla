import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export class ModelLoader {
  constructor() {
    this.loader = new GLTFLoader();
    this.textureLoader = new THREE.TextureLoader();
    this.cache = {};
    this.loadingPromises = {};
  }

  /**
   * Load a GLTF model
   * @param {string} path - Path to the model
   * @param {Object} options - Options for loading
   * @param {number} options.scale - Scale factor for the model
   * @param {boolean} options.castShadow - Whether the model casts shadows
   * @param {boolean} options.receiveShadow - Whether the model receives shadows
   * @returns {Promise<THREE.Group>} - The loaded model
   */
  async load(path, options = {}) {
    // Default options
    const defaultOptions = {
      scale: 1,
      castShadow: true,
      receiveShadow: true,
    };

    const finalOptions = { ...defaultOptions, ...options };

    // Check cache first
    if (this.cache[path]) {
      const cachedModel = this.cache[path].clone();
      this.processModel(cachedModel, finalOptions);
      return cachedModel;
    }

    // Check if already loading
    if (this.loadingPromises[path]) {
      const modelClone = await this.loadingPromises[path];
      const result = modelClone.clone();
      this.processModel(result, finalOptions);
      return result;
    }

    // Get the base path for textures
    const basePath = path.substring(0, path.lastIndexOf("/") + 1);

    // Create a resource manager to handle texture loading
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
      // If the URL is relative (doesn't start with http or /), prepend the base path
      if (
        !url.startsWith("http") &&
        !url.startsWith("/") &&
        !url.startsWith("blob:")
      ) {
        return basePath + url;
      }
      return url;
    });

    // Create loader with the manager
    const loader = new GLTFLoader(manager);

    // Start new loading
    const promise = new Promise((resolve, reject) => {
      loader.load(
        path,
        (gltf) => {
          // Clone the model before storing in cache
          const model = gltf.scene.clone();

          // Store in cache
          this.cache[path] = model.clone();

          // Process and return the model
          this.processModel(model, finalOptions);
          resolve(model);
        },
        (xhr) => {
          // Loading progress
          console.log(
            `${path}: ${Math.round((xhr.loaded / xhr.total) * 100)}% loaded`
          );
        },
        (error) => {
          // Error loading model
          console.error(`Error loading model ${path}:`, error);
          reject(error);
        }
      );
    });

    this.loadingPromises[path] = promise;
    return promise;
  }

  /**
   * Process a loaded model with options
   * @param {THREE.Group} model - The model to process
   * @param {Object} options - The processing options
   */
  processModel(model, options) {
    // Apply scale
    model.scale.set(options.scale, options.scale, options.scale);

    // Apply shadow settings and fix materials
    model.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = options.castShadow;
        node.receiveShadow = options.receiveShadow;

        // Ensure proper material settings for shadows
        if (node.material) {
          // Fix material rendering
          this.fixMaterialForBetterRendering(node.material);
        }
      }
    });

    return model;
  }

  /**
   * Fix materials to ensure proper rendering
   * @param {THREE.Material} material - The material to fix
   */
  fixMaterialForBetterRendering(material) {
    // Handle arrays of materials
    if (Array.isArray(material)) {
      material.forEach((mat) => this.fixMaterialForBetterRendering(mat));
      return;
    }

    // Make sure we're rendering both sides
    material.side = THREE.DoubleSide;

    // Fix transparent materials if needed
    if (material.transparent) {
      material.alphaTest = 0.5;
    }

    // Set reasonable defaults for PBR materials
    if (material.isMeshStandardMaterial) {
      // Increase default roughness for more realistic appearance
      material.roughness = Math.max(0.4, material.roughness);

      // If no metalness is set, assume non-metallic
      if (material.metalness === undefined) {
        material.metalness = 0.1;
      }

      // Ensure normal map intensity is reasonable
      if (material.normalMap) {
        material.normalScale.set(1, 1);
      }
    }

    // For basic materials, ensure good ambient reflectance
    if (material.isMeshBasicMaterial) {
      // If the model is appearing black, it might need some ambient color
      if (
        material.color.r < 0.1 &&
        material.color.g < 0.1 &&
        material.color.b < 0.1
      ) {
        material.color.setRGB(0.5, 0.5, 0.5);
      }
    }

    // Add some ambient contribution to PhongMaterial
    if (material.isMeshPhongMaterial) {
      material.shininess = Math.min(material.shininess || 30, 50);
      if (!material.specular) {
        material.specular = new THREE.Color(0.1, 0.1, 0.1);
      }
    }

    // For any material, try to ensure non-black appearance
    if (
      !material.map &&
      material.color &&
      material.color.r < 0.1 &&
      material.color.g < 0.1 &&
      material.color.b < 0.1
    ) {
      material.color.setRGB(0.5, 0.5, 0.5);
    }
  }

  /**
   * Loads a simple animated model with basic capabilities
   * @param {string} path - Path to the model
   * @param {Object} options - Options for loading
   * @returns {Promise<{model: THREE.Group, mixer: THREE.AnimationMixer, animations: Object}>}
   */
  async loadAnimatedModel(path, options = {}) {
    // Get the base path for textures
    const basePath = path.substring(0, path.lastIndexOf("/") + 1);

    // Create a resource manager to handle texture loading
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
      // If the URL is relative (doesn't start with http or /), prepend the base path
      if (
        !url.startsWith("http") &&
        !url.startsWith("/") &&
        !url.startsWith("blob:")
      ) {
        return basePath + url;
      }
      return url;
    });

    // Create loader with the manager
    const loader = new GLTFLoader(manager);

    return new Promise((resolve, reject) => {
      loader.load(
        path,
        (gltf) => {
          const model = gltf.scene;

          // Check if model is completely empty or has no visible geometry
          let hasMeshes = false;
          model.traverse((node) => {
            if (node.isMesh) hasMeshes = true;
          });

          if (!hasMeshes) {
            console.warn(`Model at ${path} loaded but contains no meshes`);
          }

          // Process model with options
          this.processModel(model, options);

          // Setup animation mixer
          const mixer = new THREE.AnimationMixer(model);
          const animations = {};

          // Map all animations
          if (gltf.animations && gltf.animations.length > 0) {
            gltf.animations.forEach((clip) => {
              animations[clip.name] = mixer.clipAction(clip);
            });
            console.log("Animations loaded:", Object.keys(animations));
          } else {
            console.log("No animations found in model");
          }

          console.log("Model loaded successfully:", path);

          resolve({
            model,
            mixer,
            animations,
            animationClips: gltf.animations || [],
          });
        },
        (xhr) => {
          // Loading progress
          console.log(
            `${path}: ${Math.round((xhr.loaded / xhr.total) * 100)}% loaded`
          );
        },
        (error) => {
          // Error loading model
          console.error(`Error loading model ${path}:`, error);
          reject(error);
        }
      );
    });
  }
}
