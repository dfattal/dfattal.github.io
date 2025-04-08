precision highp float;  // Using highp for better precision

uniform sampler2D uTexture;
uniform float uTime;
uniform float uAmount;
varying vec2 vUV;

// Hash function for pseudo-randomness
float hash(float n) {
    return fract(sin(n) * 43758.5453123);
}

// Edge detection helper function
float getEdgeIntensity(vec2 uv) {
    float offset = 0.001;

  // Sample neighboring pixels
    vec3 center = texture2D(uTexture, uv).rgb;
    vec3 left = texture2D(uTexture, uv - vec2(offset, 0.0)).rgb;
    vec3 right = texture2D(uTexture, uv + vec2(offset, 0.0)).rgb;
    vec3 up = texture2D(uTexture, uv - vec2(0.0, offset)).rgb;
    vec3 down = texture2D(uTexture, uv + vec2(0.0, offset)).rgb;

  // Calculate differences
    vec3 dx = abs(right - left);
    vec3 dy = abs(up - down);

  // Combined edge intensity
    return length(dx + dy);
}

void main() {
  // Calculate base UV for left and right images (SBS format)
    vec2 leftUV = vec2(vUV.x * 0.5, vUV.y);
    vec2 rightUV = vec2(0.5 + vUV.x * 0.5, vUV.y);

  // Sample original colors from SBS image
    vec3 leftColor = texture2D(uTexture, leftUV).rgb;
    vec3 rightColor = texture2D(uTexture, rightUV).rgb;

  // Create glitch timing pattern (sudden bursts)
    float t = uTime * 4.0; // Speed up time
    float glitchSeed = floor(t); // Integer time steps for random seeds
    float glitchFraction = fract(t); // Fractional part for transition

  // Random timing of glitches
    float r1 = hash(glitchSeed);
    float r2 = hash(glitchSeed + 42.0);

  // Determine when glitches happen (rare, sudden events)
    bool glitchActive = r1 < 0.25; // 25% chance of glitch per time unit

  // Intensity of the glitch effect based on edge detection
    float edgeIntensity = getEdgeIntensity(leftUV);

  // Calculate glitch effect
    float glitchAmount = uAmount * 10.0 * (0.5 + 0.5 * sin(uTime * 30.0)); // Rapid oscillation during glitch

  // Apply stronger effect on edges
    vec2 leftGlitchUV = leftUV + vec2(glitchAmount * edgeIntensity, 0.0);
    vec2 rightGlitchUV = rightUV - vec2(glitchAmount * edgeIntensity, 0.0);

  // Sample with glitch effect
    vec3 leftGlitched = texture2D(uTexture, leftGlitchUV).rgb;
    vec3 rightGlitched = texture2D(uTexture, rightGlitchUV).rgb;

  // Create anaglyph effect
    vec3 anaglyphColor = vec3(leftGlitched.r, rightGlitched.g, rightGlitched.b);

  // Rapidly oscillate between showing regular left image and anaglyph during glitch
    float oscillator = step(0.5, fract(uTime * 15.0)); // Fast oscillation during glitch

  // Choose output color based on glitch state
    vec3 outputColor;
    if(glitchActive) {
        // During glitch: oscillate between normal and anaglyph
        outputColor = mix(leftColor, anaglyphColor, oscillator);

        // Add color distortion during glitch
        float distortionAmount = 0.1 * sin(uTime * 50.0);
        if(oscillator > 0.5) {
            outputColor.r += distortionAmount;
            outputColor.b -= distortionAmount;
        }
    } else {
        // Normal state: show left image only
        outputColor = leftColor;
    }

    gl_FragColor = vec4(outputColor, 1.0);
}