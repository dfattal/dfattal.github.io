# Textures

## Required Sand Textures

This project uses sand textures for the ground plane.

### Option 1: Download from Original Repository (Recommended)

Download the sand textures from the source repository:

```bash
# Navigate to the textures directory
cd src/textures/sand/

# Download sand textures
curl -o "Sand 002_COLOR.jpg" "https://raw.githubusercontent.com/tamani-coding/threejs-character-controls-example/main/src/textures/sand/Sand%20002_COLOR.jpg"
curl -o "Sand 002_NRM.jpg" "https://raw.githubusercontent.com/tamani-coding/threejs-character-controls-example/main/src/textures/sand/Sand%20002_NRM.jpg"
curl -o "Sand 002_DISP.jpg" "https://raw.githubusercontent.com/tamani-coding/threejs-character-controls-example/main/src/textures/sand/Sand%20002_DISP.jpg"
curl -o "Sand 002_OCC.jpg" "https://raw.githubusercontent.com/tamani-coding/threejs-character-controls-example/main/src/textures/sand/Sand%20002_OCC.jpg"
```

Or visit: https://github.com/tamani-coding/threejs-character-controls-example/tree/main/src/textures

### Option 2: Use Alternative Textures

You can use any PBR texture set. Good sources:

- [Poly Haven](https://polyhaven.com/textures)
- [3D Textures](https://3dtextures.me/)
- [CC0 Textures](https://cc0textures.com/)

### Required Texture Maps

Place these files in `src/textures/`:

1. **Sand 002_COLOR.jpg** - Base color/diffuse map
2. **Sand 002_NRM.jpg** - Normal map
3. **Sand 002_DISP.jpg** - Displacement/height map
4. **Sand 002_OCC.jpg** - Ambient occlusion map

### File Format

- Format: JPG
- Resolution: 2048x2048 or higher recommended
- The textures will be tiled 10x10 across the ground plane

### Updating Texture Paths

If using different texture names, update the paths in `src/index.ts`:

```typescript
const sandBaseColor = textureLoader.load('./textures/YourTexture_COLOR.jpg');
const sandNormalMap = textureLoader.load('./textures/YourTexture_NRM.jpg');
const sandHeightMap = textureLoader.load('./textures/YourTexture_DISP.jpg');
const sandAmbientOcclusion = textureLoader.load('./textures/YourTexture_OCC.jpg');
```
