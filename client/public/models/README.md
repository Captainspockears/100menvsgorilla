# 3D Model Integration Guide for 100MenVsGorilla

This guide explains how to set up and integrate animated 3D models for the human and gorilla characters in the game.

## Directory Structure

The models directory is organized as follows:

```
client/public/models/
├── human/             # Human character model
│   ├── human.bin      # Human binary data file
│   ├── human.gltf     # Human model file
│   └── license.txt    # License information for human model
├── gorilla/           # Gorilla character model
│   ├── gorilla.bin    # Gorilla binary data file
│   ├── gorilla.gltf   # Gorilla model file
│   ├── textures/      # Textures for gorilla model
│   └── TGorilla_*.png # Texture files for gorilla
└── tree/              # Tree model for environment
    ├── tree.bin       # Tree binary data file
    ├── tree.gltf      # Tree model file
    ├── license.txt    # License information for tree model
    └── textures/      # Textures for tree model (if any)
```

## Model Usage in Code

The game uses these models as follows:

- Human model: `/models/human/human.gltf` - Used for player characters
- Gorilla model: `/models/gorilla/gorilla.gltf` - Used for the gorilla character
- Tree model: `/models/tree/tree.gltf` - Used for environmental trees

Models are loaded in the `Player.js`, `Gorilla.js`, and `Environment.js` files via the `loadAnimatedModel` or `load` methods from the `ModelLoader` class.

## Testing Your Models

After placing your models in the appropriate directories, test them as follows:

1. Start the game server:
   ```
   cd /path/to/100menvsgorilla
   npm run dev
   ```

2. Open your browser and navigate to the game

3. Check if your character loads properly with the new model

4. Test each animation by:
   - Standing still (idle animation)
   - Moving with WASD keys (walk animation)
   - Sprinting (run animation)
   - Jumping with Spacebar (jump animation)
   - Attacking with J key (attack animation)
   - Getting killed (death animation)

## Troubleshooting Animation Issues

If animations don't work correctly:

1. Check your browser console for errors
2. Ensure your model's animations have the correct naming conventions:
   - Names should match standard terms like "idle", "walk", "run", etc.
   - Or include related keywords (e.g., "standing" for idle)
3. Try simplifying your model if it's too complex
4. Ensure your model is correctly scaled and oriented

## File Format Requirements

- Format: glTF/GLB (.glb or .gltf with associated files)
- Mesh: Low to medium poly count for performance
- Textures: Optimized for web (1024x1024 or smaller)
- Animations: 30fps standard frame rate
- Rigging: Humanoid/biped skeleton compatible with Mixamo
- Scale: Models should be to scale relative to each other

## Advanced Model Customization

To modify models further:
1. Use Blender to edit the models
2. Import the .glb file
3. Make desired changes to mesh, textures, or animations
4. Export back to .glb format

## Technical Details

- The game uses Three.js for 3D rendering
- Animations are managed via THREE.AnimationMixer
- Model loading is handled via GLTFLoader
- Models are automatically scaled and positioned in code
- Animation detection uses name-based matching

## Credits

When using third-party models, ensure you:
1. Follow the license terms of the model
2. Include proper attribution when required
3. Don't use commercial models without permission

If you have any issues integrating models, check the troubleshooting section or contact the development team. 