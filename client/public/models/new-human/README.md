# Human Character Model Instructions

This directory should contain an animated human character model with animation support.

## How to Get an Animated Human Character Model

1. Visit [Mixamo](https://www.mixamo.com/) and sign in with an Adobe ID (free)

2. Select a human character you like (e.g., "Y Bot", "X Bot", or any other character)

3. Download the character in T-pose:
   - Click on "Download" button
   - Format: glTF (.glb)
   - Skeleton: With skin
   - Animation: No animation
   - Click "Download"
   - Save the file as `character.glb` in this directory

4. Go back to Mixamo and download these essential animations for the same character:
   - Idle animation (search for "idle")
   - Walking animation (search for "walking")
   - Running animation (search for "running")
   - Jump animation (search for "jump")
   - Attack animation (search for "punch" or "attack")
   - Death animation (search for "death")

5. For each animation:
   - Select the animation
   - Click "Download"
   - Format: glTF (.glb)
   - Skin: With skin
   - Animation: With animation
   - Frame rate: 30
   - Click "Download"
   - Save each as a separate file with descriptive names:
     - idle.glb
     - walking.glb
     - running.glb
     - jump.glb
     - attack.glb
     - death.glb

6. Use the [glTF Animation Combiner](https://nilooy.github.io/character-animation-combiner/) or a similar tool to combine all animations into a single character.glb file

7. Alternative: Use Blender to combine animations:
   - Import the T-pose character
   - Import each animation file
   - Use the "Action Editor" to combine animations
   - Export as a single glTF file

## Character Requirements

The character model should:
- Be in T-pose by default
- Include all the above animations
- Be properly rigged for animation
- Be exported in glTF (.glb) format
- Be named `character.glb` in this directory 