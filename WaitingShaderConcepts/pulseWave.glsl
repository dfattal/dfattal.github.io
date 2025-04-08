precision highp float;

uniform sampler2D uTexture;
uniform float uTime;
varying vec2 vUV;

void main() {
  // Extract only the left image from SBS format but map it to full screen
  vec2 leftImageUV = vec2(vUV.x * 0.5, vUV.y);

  // Sample original left image color
  vec3 color = texture2D(uTexture, leftImageUV).rgb;

  // Create radial wave effect - center relative to the full screen now
  vec2 center = vec2(0.5, 0.5);
  float dist = distance(vUV, center);

  // Create more pronounced waves
  float wave1 = sin(dist * 20.0 - uTime * 1.0) * 0.5 + 0.5;
  float wave2 = sin(dist * 15.0 - uTime * 0.6) * 0.5 + 0.5;
  float wave3 = sin(dist * 8.0 - uTime * 0.3) * 0.5 + 0.5;

  // Combine waves with different weights and fade with distance
  float combinedWave = mix(wave1 * 0.3, wave2 * 0.4 + wave3 * 0.3, 0.5);
  combinedWave *= smoothstep(0.8, 0.0, dist); // Fade out from center

  // Enhance the wave effect a bit
  combinedWave = pow(combinedWave, 0.7) * 1.2;

  // Apply more visible color variations based on waves
  float colorVariation = combinedWave * 0.18;
  vec3 colorTint = vec3(1.0 + colorVariation * 0.8, 1.0 + colorVariation * 0.4, 1.0 + colorVariation * 0.5);

  // Apply the color tint with more emphasis
  vec3 finalColor = color * mix(vec3(1.0), colorTint, 0.35);

  // Add pulsing vignette
  float vignette = 1.0 - smoothstep(0.4, 0.8, dist);
  float pulsingVignette = vignette * (0.93 + 0.07 * sin(uTime * 0.8));
  finalColor *= mix(0.96, pulsingVignette, 0.4);

  // Add more pronounced light rings with wider amplitude
  float ringSize = 0.25 + 0.15 * sin(uTime * 0.4); // Increased ring amplitude
  float ringWidth = 0.18; // Wider rings
  float ring = smoothstep(ringWidth, 0.0, abs(dist - ringSize));
  finalColor += ring * 0.2 * vec3(1.0, 0.97, 0.9); // Increased brightness

  // Add a second inner ring with more movement
  float innerRingSize = 0.15 + 0.1 * sin(uTime * 0.7 + 1.0); // Increased amplitude
  float innerRing = smoothstep(0.08, 0.0, abs(dist - innerRingSize)); // Wider
  finalColor += innerRing * 0.15 * vec3(0.97, 1.0, 0.97); // Increased brightness

  // Add a third large outer ring with wide amplitude
  float outerRingSize = 0.4 + 0.2 * sin(uTime * 0.3 + 2.0); // Large amplitude
  float outerRing = smoothstep(0.15, 0.0, abs(dist - outerRingSize)); // Very wide
  finalColor += outerRing * 0.12 * vec3(1.0, 0.95, 0.85);

  gl_FragColor = vec4(finalColor, 1.0);

  // Debug toggle: uncomment to see wave pattern directly
  // gl_FragColor = vec4(vec3(combinedWave * 0.5), 1.0);
}