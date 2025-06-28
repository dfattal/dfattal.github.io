# WebXR Dynamic Spaces: Moving Camera Rigs Through Reference Space Transforms

## Overview

WebXR reference spaces work **inversely** compared to regular 3D object transforms. This document explains how to properly manipulate camera rigs by creating dynamic reference spaces.

## The Core Concept

When you want to move the camera rig (and thus the user's viewpoint) in WebXR, you don't directly transform the camera. Instead, you transform the **reference space** that defines the coordinate system everything is measured against.

### The Inverse Relationship

The key insight is that reference spaces work in **reverse**:
- To move the camera rig to position `(x, y, z)`, you apply the **inverse** of that transform to the reference space
- The coordinate system moves in the opposite direction, effectively moving the observer to the desired location

## Step-by-Step Process

### 1. Define the Transform (Think Like a Regular Object)

Create an `XRRigidTransform` as if you were positioning a regular 3D object:

```javascript
const transform = new XRRigidTransform(
    { x: 2, y: 0, z: 0 },  // Position where you want the camera
    { x: 0, y: Math.sin(angle), z: 0, w: Math.cos(angle) }  // Rotation quaternion
);
```

### 2. Apply the Inverse to the Reference Space

Use the **inverse** of your transform to create the offset reference space:

```javascript
mySpace = localSpace.getOffsetReferenceSpace(transform.inverse);
```

### 3. Set the New Reference Space

Tell the renderer to use your custom reference space:

```javascript
renderer.xr.setReferenceSpace(mySpace);
```

## Complete Example: Orbiting Camera

Here's how to make the camera orbit around a point at (2,0,0):

```javascript
function updateOrbitingSpace() {
    if (!localSpace) return;

    // Define transform as if positioning an object at (2,0,0) with Y rotation
    const transform = new XRRigidTransform(
        { x: 2, y: 0, z: 0},
        { x: 0, y: Math.sin(Math.sin(orbitAngle/2)*Math.PI/8), z: 0, w: Math.cos(Math.sin(orbitAngle/2)*Math.PI/8) }
    );
    
    // Apply the INVERSE to create the reference space
    mySpace = localSpace.getOffsetReferenceSpace(transform.inverse);

    // Set the renderer to use our custom orbiting space
    renderer.xr.setReferenceSpace(mySpace);

    // Update for next frame
    orbitAngle += orbitSpeed;
}
```

## Mental Model

Think of it this way:
1. **Regular Object Transform**: "Move the object to position X"
2. **Reference Space Transform**: "Move the coordinate system so the observer appears to be at position X"

Since moving the coordinate system has the opposite effect of moving within it, you need the inverse transform.

## Common Use Cases

- **Camera orbiting**: Rotate the camera around a specific point in space
- **Teleportation**: Instantly move the user to a new location
- **Following objects**: Make the camera track moving objects
- **Cinematic sequences**: Create smooth camera movements for presentations

## Integration with Three.js

When using Three.js with WebXR:

```javascript
// Setup in XR session start
renderer.xr.addEventListener('sessionstart', () => {
    const session = renderer.xr.getSession();
    session.requestReferenceSpace('local').then((referenceSpace) => {
        localSpace = referenceSpace;
        // Start your dynamic space updates
    });
});

// Update in animation loop
function animate() {
    if (renderer.xr.isPresenting) {
        updateDynamicSpace();
    }
    renderer.render(scene, camera);
}
```

## Key Takeaways

1. **Always use `transform.inverse`** when creating offset reference spaces for camera movement
2. **Think in object coordinates first**, then apply the inverse
3. **Reference spaces define the coordinate system**, not the camera position directly
4. **Update the reference space each frame** for smooth animations
5. **Handle session lifecycle** - reset spaces when sessions end
6. **Use cameras for lookAt calculations**, not generic Object3D instances

## Calculating Look-At Quaternions

For camera movements that need to look at specific targets, you can't always use simple rotation formulas. Here's a reliable method using Three.js:

```javascript
function calculateLookAtQuaternion(eyeX, eyeY, eyeZ, targetX, targetY, targetZ) {
    // Use Three.js Camera for proper lookAt calculation (cameras default to looking down -Z)
    const tempCamera = new THREE.PerspectiveCamera();
    const eyePos = new THREE.Vector3(eyeX, eyeY, eyeZ);
    const targetPos = new THREE.Vector3(targetX, targetY, targetZ);

    // Position the camera at the eye position
    tempCamera.position.copy(eyePos);

    // Make it look at the target
    tempCamera.lookAt(targetPos);

    // Extract the quaternion
    const quaternion = tempCamera.quaternion;

    return { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w };
}
```

### Critical Coordinate System Issue

When implementing lookAt calculations, **always use `THREE.PerspectiveCamera`** instead of `THREE.Object3D`:

- **`THREE.Object3D`**: Default forward direction is **+Z** (positive Z)
- **`THREE.PerspectiveCamera`**: Default forward direction is **-Z** (negative Z)

WebXR cameras expect to look down the negative Z-axis, so using `Object3D` will give incorrect quaternions (often 180° rotations). This was the root cause of the "world point moving around" issue.

### Usage Example

```javascript
// Calculate orbital position
const x = orbitRadius * Math.sin(orbitAngle);
const y = 0;
const z = orbitRadius * Math.cos(orbitAngle);

// Get proper lookAt quaternion
const lookAtQuaternion = calculateLookAtQuaternion(x, y, z, 0, 0, 0);

// Apply to WebXR transform
const transform = new XRRigidTransform(
    { x: x, y: y, z: z },
    { x: lookAtQuaternion.x, y: lookAtQuaternion.y, z: lookAtQuaternion.z, w: lookAtQuaternion.w }
);
```

## Debugging Tips

- If the camera moves in the wrong direction, you likely forgot the `.inverse`
- If rotations feel backwards, check your quaternion calculations
- Always verify that `localSpace` exists before creating offset spaces
- Test with simple translations before adding complex rotations
- If objects appear to orbit instead of the camera, you're using `Object3D` instead of `Camera` for lookAt calculations 