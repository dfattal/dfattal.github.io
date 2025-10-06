# WebXR Controller Controls Documentation

## Controller Axes Mapping

### Meta Quest Controllers (and similar WebXR controllers)

Each controller provides 4 axes in the `gamepad.axes` array:

**Left Controller:**
- `axes[0]` - Left thumbstick X-axis (horizontal): -1.0 (left) to +1.0 (right)
- `axes[1]` - Left thumbstick Y-axis (vertical): -1.0 (up/forward) to +1.0 (down/back)
- `axes[2]` - Left thumbstick X-axis duplicate (same as axes[0])
- `axes[3]` - Left thumbstick Y-axis duplicate (same as axes[1])

**Right Controller:**
- `axes[0]` - (typically unused or zero)
- `axes[1]` - (typically unused or zero)
- `axes[2]` - Right thumbstick X-axis (horizontal): -1.0 (left) to +1.0 (right)
- `axes[3]` - Right thumbstick Y-axis (vertical): -1.0 (up/forward) to +1.0 (down/back)

### Important Notes
- The X-axis for horizontal control is at **`axes[2]`** for both controllers
- The Y-axis for vertical control is at **`axes[3]`** for both controllers
- Controllers can be identified by `source.handedness` property ('left' or 'right')
- Dead zone threshold of 0.1 is recommended to avoid drift

## Button Mapping

Controllers provide buttons in the `gamepad.buttons` array:

### Common Button Indices:
- `buttons[0]` - **Trigger** (index finger button)
- `buttons[1]` - **Grip/Squeeze** (side grip button)
- `buttons[2]` - (varies by controller)
- `buttons[3]` - **A/X button** (face button)
- `buttons[4]` - **B/Y button** (face button, Quest only)

### Button State
Each button has:
- `pressed` - Boolean indicating if button is currently pressed
- `value` - Float 0.0 to 1.0 for analog buttons (like trigger)

## Usage Pattern

```javascript
const session = renderer.xr.getSession();
for (const source of session.inputSources) {
    if (source.gamepad) {
        const gamepad = source.gamepad;
        const axes = gamepad.axes;
        const buttons = gamepad.buttons;

        // Check handedness
        const isLeft = source.handedness === 'left';
        const isRight = source.handedness === 'right';

        // Read thumbstick (axes[2] = X, axes[3] = Y)
        if (axes.length >= 4) {
            const stickX = axes[2];
            const stickY = axes[3];

            if (Math.abs(stickX) > 0.1) {
                // Handle horizontal stick movement
            }
            if (Math.abs(stickY) > 0.1) {
                // Handle vertical stick movement
            }
        }

        // Read buttons with debouncing
        if (!source.userData) source.userData = {};

        if (buttons[0].pressed) {
            if (!source.userData.triggerPressed) {
                // Handle trigger press (once)
                source.userData.triggerPressed = true;
            }
        } else {
            source.userData.triggerPressed = false;
        }
    }
}
```

## RGBD Player Control Scheme

### Left Controller
- **Thumbstick Y (axes[3])**: Depth effect (invZmin: 0.01 - 0.1)
  - Up/Forward = more depth (increase invZmin)
  - Down/Back = less depth (decrease invZmin)
- **Thumbstick X (axes[2])**: Not used (disabled to avoid interference)
- **Trigger (buttons[0])**: Increase screen distance (hold to continue)
  - Moves screen farther away
- **Grip (buttons[1])**: Decrease edge feathering (hold to continue)
  - Makes edges sharper
- **X button (buttons[4])**: Exit VR session

### Right Controller
- **Thumbstick Y (axes[3])**: Focal length (0.5x - 2x, log scale)
  - Up/Forward = zoom in (increase focal, narrower FOV)
  - Down/Back = zoom out (decrease focal, wider FOV)
- **Thumbstick X (axes[2])**: Not used (disabled to avoid interference)
- **Trigger (buttons[0])**: Decrease screen distance (hold to continue)
  - Moves screen closer
- **Grip (buttons[1])**: Increase edge feathering (hold to continue)
  - Makes edges softer
- **A button (buttons[4])**: Play/pause video
- **B button (buttons[5])**: Toggle HUD on/off

## Debugging Tips

### Log All Axes
```javascript
const anyAxisMoved = axes.some(v => Math.abs(v) > 0.1);
if (anyAxisMoved && !source.userData.recentAxisLog) {
    console.log(`${source.handedness} axes (${axes.length}):`,
        axes.map((v, i) => `[${i}]=${v.toFixed(2)}`).join(' '));
    source.userData.recentAxisLog = true;
    setTimeout(() => source.userData.recentAxisLog = false, 500);
}
```

### Expected Output
Moving right stick to the right:
```
right axes (4): [0]=0.00 [1]=0.00 [2]=1.00 [3]=0.00
```

Moving left stick up:
```
left axes (4): [0]=0.00 [1]=-1.00 [2]=0.00 [3]=-1.00
```

## Common Issues

1. **Wrong axis index**: Always use `axes[2]` for X and `axes[3]` for Y, not `axes[0]` and `axes[1]`
2. **No debouncing**: Button presses fire every frame, use `userData` to track state
3. **Controller not found**: Check `source.handedness` to identify left vs right
4. **Axes length**: Always check `axes.length >= 3` or `>= 4` before accessing indices

## References

- WebXR Device API: https://immersive-web.github.io/webxr/
- Gamepad API: https://w3c.github.io/gamepad/
