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

    // Apply position if provided
    if (options.position) {
      model.position.set(
        options.position.x || 0,
        options.position.y || 0,
        options.position.z || 0
      );
    }

    // Apply rotation if provided
    if (options.rotation) {
      model.rotation.set(
        options.rotation.x || 0,
        options.rotation.y || 0,
        options.rotation.z || 0
      );
    }

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
   * Loads an animated model with all animations
   * @param {string} path - Path to the model
   * @param {Object} options - Options for loading
   * @returns {Promise<{model: THREE.Group, mixer: THREE.AnimationMixer, animations: Object}>}
   */
  async loadAnimatedModel(path, options = {}) {
    // Default options
    const defaultOptions = {
      scale: 1,
      castShadow: true,
      receiveShadow: true,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    };

    const finalOptions = { ...defaultOptions, ...options };

    console.log(`Loading animated model from ${path}...`, finalOptions);

    try {
      // Get the base path for textures
      const basePath = path.substring(0, path.lastIndexOf("/") + 1);

      // Create a resource manager to handle texture loading
      const manager = new THREE.LoadingManager();

      // Log loading errors
      manager.onError = (url) => {
        console.error(`Error loading resource: ${url}`);
      };

      // Log progress
      manager.onProgress = (url, loaded, total) => {
        if (total > 0) {
          console.log(`Loading ${url}: ${Math.round((loaded / total) * 100)}%`);
        }
      };

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

      // Try to load from a different path if this fails
      return new Promise((resolve, reject) => {
        const tryLoad = (currentPath, isRetry = false) => {
          console.log(
            `${
              isRetry ? "Retrying" : "Attempting"
            } to load model from: ${currentPath}`
          );

          loader.load(
            currentPath,
            (gltf) => {
              // Successfully loaded the model
              console.log(
                `Model loaded successfully from ${currentPath}`,
                gltf
              );

              const model = gltf.scene;

              // Process the model with the provided options
              this.processModel(model, finalOptions);

              // Check if model has any children (meshes)
              if (model.children.length === 0) {
                console.warn("Loaded model has no children/meshes!");
              } else {
                console.log(`Model has ${model.children.length} children`);
              }

              // Create a new animation mixer for the model
              const mixer = new THREE.AnimationMixer(model);

              // Process animations
              const animations = {};

              if (gltf.animations && gltf.animations.length > 0) {
                console.log(`Model has ${gltf.animations.length} animations`);

                gltf.animations.forEach((clip) => {
                  // Create an animation action for this clip
                  const action = mixer.clipAction(clip);

                  // Store the action by name for easy access
                  animations[clip.name] = action;

                  console.log(
                    `Added animation: ${clip.name}, duration: ${clip.duration}s`
                  );
                });
              } else {
                console.warn("Model has no animations");
              }

              // Return model, mixer, and animations
              resolve({
                model,
                mixer,
                animations,
              });
            },
            (xhr) => {
              // Loading progress
              if (xhr.lengthComputable) {
                const percent = Math.round((xhr.loaded / xhr.total) * 100);
                console.log(`Loading ${currentPath}: ${percent}%`);
              }
            },
            (error) => {
              // Error loading model
              console.error(`Error loading model ${currentPath}:`, error);

              // If this is the first attempt, try the fallback path
              if (!isRetry) {
                const fallbackPath = `/models/${
                  currentPath.includes("gorilla") ? "gorilla" : "human"
                }/scene2.gltf`;
                console.warn(`Trying fallback model path: ${fallbackPath}`);
                tryLoad(fallbackPath, true);
              } else {
                // Both attempts failed
                console.error("All model loading attempts failed");
                reject(error);
              }
            }
          );
        };

        // Start with the original path
        tryLoad(path);
      });
    } catch (error) {
      console.error(
        `Exception during model loading setup: ${error.message}`,
        error
      );
      throw error;
    }
  }
}
