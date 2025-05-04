import * as THREE from "three";

export class Environment {
  constructor(scene) {
    this.scene = scene;
    this.mapBoundary = 20; // Match player/gorilla/bot boundary

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

  createTrees(count) {
    // Create trees, but place them strategically around the edges
    // to avoid obscuring the center play area
    for (let i = 0; i < count; i++) {
      // Get polar coordinates for more even distribution
      const radius = 15 + Math.random() * 3; // Trees near the boundary
      const angle = (i / count) * Math.PI * 2; // Evenly space around circle

      // Convert to cartesian coordinates
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      // Create trunk (cylinder)
      const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.5, 3, 8);
      const trunkMaterial = new THREE.MeshBasicMaterial({ color: 0x8b4513 }); // Brown
      const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
      trunk.position.set(x, 1.5, z);
      trunk.castShadow = true;

      // Create foliage (cone)
      const foliageGeometry = new THREE.ConeGeometry(2, 4, 8);
      const foliageMaterial = new THREE.MeshBasicMaterial({ color: 0x228b22 }); // Forest Green
      const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
      foliage.position.set(x, 5, z);
      foliage.castShadow = true;

      this.scene.add(trunk);
      this.scene.add(foliage);
    }
  }
}
