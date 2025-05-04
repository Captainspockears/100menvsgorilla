# Gorilla Character Model Instructions

This directory should contain an animated gorilla character model with animation support.

## How to Get an Animated Gorilla Character Model

Since Mixamo doesn't have gorilla models, here are options to create one:

### Option 1: Use a Mixamo Quadruped or Large Character

1. Visit [Mixamo](https://www.mixamo.com/) and sign in with an Adobe ID (free)

2. Select a large character like "Big Vegas" or another suitable character that can represent a gorilla

3. Download the character in T-pose:
   - Click on "Download" button
   - Format: glTF (.glb)
   - Skeleton: With skin
   - Animation: No animation
   - Click "Download"
   - Save the file as `character.glb` in this directory

4. Go back to Mixamo and download these essential animations for the same character:
   - Idle animation (search for "idle")
   - Walking animation (search for "walking" or "stomping")
   - Running animation (search for "running")
   - Jump animation (search for "jump")
   - Attack animation (search for "punch" or "attack")
   - Death animation (search for "death")

5. Follow the same process as for human animations to combine them into one file

### Option 2: Find a Free Gorilla Model

1. Search free 3D model sites like:
   - [Sketchfab](https://sketchfab.com/search?q=gorilla&type=models)
   - [TurboSquid](https://www.turbosquid.com/Search/3D-Models/free/gorilla)
   - [CGTrader](https://www.cgtrader.com/free-3d-models/gorilla)

2. Requirements for the model:
   - Must be properly rigged (has a skeleton)
   - Must be in glTF/GLB format or convertible to it
   - Must include animations or be compatible with Mixamo animations
   - Ideally has T-pose for easy animation

3. Save the model as `character.glb` in this directory

### Option 3: Adapt a Humanoid Model into a Gorilla

1. In Blender:
   - Import a humanoid model from Mixamo
   - Modify the proportions (longer arms, hunched posture, etc.)
   - Apply fur/hair textures
   - Ensure the rig remains compatible with Mixamo animations
   - Export as glTF

2. Save the model as `character.glb` in this directory

## Animation Requirements

Regardless of the source, the gorilla model should have these animations:
- Idle animation
- Walking animation
- Running animation
- Attack animation (preferably multiple variations)
- Jump animation
- Death animation

## Final Character Requirements

The character model should:
- Be properly rigged for animation
- Include all the necessary animations
- Be exported in glTF (.glb) format
- Be named `character.glb` in this directory 