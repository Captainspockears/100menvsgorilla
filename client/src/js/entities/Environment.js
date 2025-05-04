import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export class Environment {
  constructor(scene, modelLoader) {
    this.scene = scene;
    this.modelLoader = modelLoader;
    this.mapBoundary = 20; // Match player/gorilla/bot boundary
    this.trees = []; // Store tree references

    // Set scene background color (sky)
    this.scene.background = new THREE.Color(0x87ceeb);

    // Create ground
    this.createGround();

    // Add fewer trees in strategic locations
    this.createTrees(15);

    // Create visible boundary
    this.createMapBoundary();
  }

  createGround() {
    // Create a large flat plane for the ground
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshBasicMaterial({
      color: 0x3a5f0b, // Forest green
      side: THREE.DoubleSide,
    });

    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = Math.PI / 2; // Rotate to be horizontal
    ground.position.y = 0;
    ground.receiveShadow = true;

    // Add grid to help with visualization
    const gridHelper = new THREE.GridHelper(
      this.mapBoundary * 2,
      20,
      0xffffff,
      0xffffff
    );
    gridHelper.position.y = 0.01; // Slightly above the ground to prevent z-fighting

    this.scene.add(ground);
    this.scene.add(gridHelper);
  }

  createMapBoundary() {
    // Create a visible boundary to show players the game area limits
    const boundaryMaterial = new THREE.LineBasicMaterial({
      color: 0x666666, // Subtle gray instead of bright red
      linewidth: 2,
    });

    const points = [];
    // Create square boundary at ground level
    points.push(new THREE.Vector3(-this.mapBoundary, 0.1, -this.mapBoundary));
    points.push(new THREE.Vector3(this.mapBoundary, 0.1, -this.mapBoundary));
    points.push(new THREE.Vector3(this.mapBoundary, 0.1, this.mapBoundary));
    points.push(new THREE.Vector3(-this.mapBoundary, 0.1, this.mapBoundary));
    points.push(new THREE.Vector3(-this.mapBoundary, 0.1, -this.mapBoundary));

    const boundaryGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const boundaryLine = new THREE.Line(boundaryGeometry, boundaryMaterial);

    this.scene.add(boundaryLine);

    // Add boundary posts at corners
    this.createBoundaryPost(-this.mapBoundary, -this.mapBoundary);
    this.createBoundaryPost(this.mapBoundary, -this.mapBoundary);
    this.createBoundaryPost(this.mapBoundary, this.mapBoundary);
    this.createBoundaryPost(-this.mapBoundary, this.mapBoundary);
  }

  createBoundaryPost(x, z) {
    const postGeometry = new THREE.CylinderGeometry(0.2, 0.2, 3, 8);
    const postMaterial = new THREE.MeshBasicMaterial({ color: 0x666666 }); // Subtle gray
    const post = new THREE.Mesh(postGeometry, postMaterial);
    post.position.set(x, 1.5, z);
    this.scene.add(post);
  }

  async createTrees(count) {
    // Create trees, but place them strategically around the edges
    // to avoid obscuring the center play area
    for (let i = 0; i < count; i++) {
      // Get polar coordinates for more even distribution
      const radius = 15 + Math.random() * 3; // Trees near the boundary
      const angle = (i / count) * Math.PI * 2; // Evenly space around circle

      // Convert to cartesian coordinates
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      // Add a slight random offset for more natural placement
      const xOffset = (Math.random() - 0.5) * 3;
      const zOffset = (Math.random() - 0.5) * 3;

      try {
        // Create a custom tree with fixed materials since textures are missing
        const loader = new GLTFLoader();

        // Set texture loading error handler to prevent console errors
        THREE.DefaultLoadingManager.onError = (url) => {
          console.log(`Silently handling texture loading error for: ${url}`);
          // Return without showing error in console
        };

        const gltf = await new Promise((resolve, reject) => {
          loader.load(
            "/models/tree/tree.gltf",
            (gltf) => {
              console.log("Tree model loaded successfully:", gltf);
              console.log(
                "Tree model structure:",
                gltf.scene.children
                  .map((c) => `${c.name} (${c.type})`)
                  .join(", ")
              );

              // Log mesh details
              gltf.scene.traverse((child) => {
                if (child.isMesh) {
                  console.log(
                    `Found mesh: ${child.name}, Material: ${
                      child.material ? child.material.type : "none"
                    }`
                  );
                }
              });

              resolve(gltf);
            },
            (progress) => {
              console.log("Loading progress:", progress);
            },
            (error) => {
              console.log("Handling load error silently:", error);
              // We'll still reject so the fallback tree creation happens
              reject(error);
            }
          );
        });

        // Apply custom materials to the tree parts
        let isTrunkFound = false;
        let isLeafFound = false;

        gltf.scene.traverse((child) => {
          if (child.isMesh) {
            // For trunk (brown)
            if (
              child.name.includes("Trunk") ||
              child.name.includes("TP23_Trunk")
            ) {
              child.material = new THREE.MeshStandardMaterial({
                color: 0x8b4513, // Brown for trunk
                roughness: 0.8,
                metalness: 0.1,
                emissive: 0x3a2a1b, // Slight emissive glow to be visible in normal lighting
                emissiveIntensity: 0.2,
                side: THREE.DoubleSide,
              });
              isTrunkFound = true;
            }
            // For leaves (green)
            else if (
              child.name.includes("Leaf") ||
              child.name.includes("TP23_Leaf")
            ) {
              child.material = new THREE.MeshStandardMaterial({
                color: 0x228b22, // Forest green for leaves
                roughness: 0.7,
                metalness: 0.0,
                emissive: 0x0a3a0a, // Slight emissive glow to be visible in normal lighting
                emissiveIntensity: 0.2,
                side: THREE.DoubleSide,
              });
              isLeafFound = true;
            }
            // If not identified by name but one of first meshes, assign trunk material
            else if (!isTrunkFound) {
              child.material = new THREE.MeshStandardMaterial({
                color: 0x8b4513, // Brown for trunk
                roughness: 0.8,
                metalness: 0.1,
                emissive: 0x3a2a1b, // Slight emissive glow
                emissiveIntensity: 0.2,
                side: THREE.DoubleSide,
              });
              isTrunkFound = true;
            }
            // If not identified by name and not first mesh, assign leaf material
            else if (!isLeafFound) {
              child.material = new THREE.MeshStandardMaterial({
                color: 0x228b22, // Forest green for leaves
                roughness: 0.7,
                metalness: 0.0,
                emissive: 0x0a3a0a, // Slight emissive glow
                emissiveIntensity: 0.2,
                side: THREE.DoubleSide,
              });
              isLeafFound = true;
            }

            // Set shadow properties
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        // Scale and position the tree
        gltf.scene.scale.set(0.3, 0.3, 0.3); // Increased scale to 0.3 (3x the previous 0.1)
        gltf.scene.position.set(x + xOffset, 0, z + zOffset);
        gltf.scene.rotation.y = Math.random() * Math.PI * 2;

        // Log tree position
        console.log(
          `Tree positioned at: x: ${x + xOffset}, y: 0, z: ${
            z + zOffset
          }, scale: 0.3`
        );

        // Ensure model is properly grounded - calculate bounding box and adjust
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const boxSize = box.getSize(new THREE.Vector3());
        const boxCenter = box.getCenter(new THREE.Vector3());

        // Adjust position to place bottom of model at ground level
        const yOffset = boxCenter.y - boxSize.y / 2;
        gltf.scene.position.y = -yOffset * gltf.scene.scale.y;

        console.log(
          `Tree bounding box: width=${boxSize.x}, height=${boxSize.y}, depth=${boxSize.z}`
        );
        console.log(`Adjusted Y position: ${gltf.scene.position.y}`);

        // Randomly scale for variety
        const randomScale = 0.9 + Math.random() * 0.2;
        gltf.scene.scale.multiplyScalar(randomScale);

        // Add tree to scene and store reference
        this.scene.add(gltf.scene);
        this.trees.push(gltf.scene);
      } catch (error) {
        console.error(
          "Failed to load tree model, using simple tree instead:",
          error
        );
        this.createSimpleTree(x + xOffset, z + zOffset);
      }
    }
  }

  // Create a simple tree using basic shapes (fallback if model loading fails)
  createSimpleTree(x, z) {
    // Create trunk (cylinder)
    const trunkGeometry = new THREE.CylinderGeometry(1.2, 1.2, 8, 8); // Increased size
    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b4513, // Brown
      roughness: 0.8,
      metalness: 0.1,
      emissive: 0x3a2a1b, // Slight emissive glow
      emissiveIntensity: 0.2,
    });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.set(x, 4, z); // Adjusted to sit on ground (half height)
    trunk.castShadow = true;
    trunk.receiveShadow = true;

    // Create foliage (cone)
    const foliageGeometry = new THREE.ConeGeometry(4.5, 10, 8); // Increased size
    const foliageMaterial = new THREE.MeshStandardMaterial({
      color: 0x228b22, // Forest Green
      roughness: 0.7,
      metalness: 0.0,
      emissive: 0x0a3a0a, // Slight emissive glow
      emissiveIntensity: 0.2,
    });
    const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
    foliage.position.set(x, 13, z); // Adjusted to sit on top of trunk
    foliage.castShadow = true;
    foliage.receiveShadow = true;

    this.scene.add(trunk);
    this.scene.add(foliage);

    this.trees.push(trunk);
    this.trees.push(foliage);
  }
}
