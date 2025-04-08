precision highp float;

uniform sampler2D uTexture;
uniform float uTime;
varying vec2 vUV;

void main() {
  // Calculate base UV for left image (SBS format)
    vec2 leftUV = vec2(vUV.x * 0.5, vUV.y);

  // Sample original colors from left image only
    vec3 leftColor = texture2D(uTexture, leftUV).rgb;

  // Create a moving light sweep effect (faster speed)
    float sweepPos = mod(uTime * 0.3, 1.5) - 0.25; // Increased from 0.15 to 0.3 for faster movement
    float distance = abs(leftUV.x - sweepPos);

  // Soft falloff for the light
    float intensity = smoothstep(0.3, 0.0, distance) * 0.18; // Adjust falloff and intensity

  // Warm light color (slightly orange/yellow)
    vec3 lightColor = vec3(1.0, 0.9, 0.7);

  // Apply the warm light to the left image
    vec3 enhancedLeftColor = leftColor + (lightColor * intensity);

  // Output only the enhanced left image (no anaglyph)
    gl_FragColor = vec4(enhancedLeftColor, 1.0);
}