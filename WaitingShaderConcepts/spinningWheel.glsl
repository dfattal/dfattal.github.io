precision highp float;

uniform sampler2D uTexture;
uniform float uTime;
varying vec2 vUV;

// Rotate a 2D point around origin
vec2 rotate(vec2 point, float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return vec2(point.x * c - point.y * s, point.x * s + point.y * c);
}

void main() {
  // Extract only the left image from SBS format
  vec2 leftImageUV = vec2(vUV.x * 0.5, vUV.y);

  // Sample original left image color
  vec3 color = texture2D(uTexture, leftImageUV).rgb;

  // Dim the image slightly (reducing brightness by about 20%)
  vec3 dimmedColor = color * 0.8;

  // Calculate normalized coordinates from center (-1 to 1)
  vec2 centered = (vUV - 0.5) * 2.0;

  // Get distance from center (0 to 1)
  float dist = length(centered);

  // Rotate point based on time (clockwise rotation)
  float rotationSpeed = 1.0; // Controls speed of rotation
  vec2 rotated = rotate(centered, -uTime * rotationSpeed); // Negative for clockwise

  // Convert to polar coordinates
  float angle = atan(rotated.y, rotated.x);

  // Create a spinning highlight along the rim
  float rimWidth = 0.15; // Width of the rim highlight
  float rimRadius = 0.75; // Position of the rim (reduced from 0.85)
  float rimHighlight = smoothstep(rimWidth, 0.0, abs(dist - rimRadius));

  // Create a pulsating glow that travels around the rim
  float glowAngle = mod(uTime * rotationSpeed, 6.28); // Current angle of the glow
  float angleDiff = min(abs(angle - glowAngle), abs(angle - glowAngle + 6.28));
  angleDiff = min(angleDiff, abs(angle - glowAngle - 6.28));

  // Make glow fade based on angular distance
  float glowWidth = 1.0; // Angular width of the glow
  float angularGlow = smoothstep(glowWidth, 0.0, angleDiff);

  // Combine rim and angular glow
  float glow = rimHighlight * angularGlow;

  // Create secondary glows at opposite sides for balance
  float secondaryGlowAngle = mod(glowAngle + 3.14, 6.28); // Opposite side
  float secondaryAngleDiff = min(abs(angle - secondaryGlowAngle), abs(angle - secondaryGlowAngle + 6.28));
  secondaryAngleDiff = min(secondaryAngleDiff, abs(angle - secondaryGlowAngle - 6.28));
  float secondaryGlow = smoothstep(glowWidth * 1.5, 0.0, secondaryAngleDiff) * rimHighlight * 0.7;

  // Create subtle trails behind the main glow
  float trailAngle = mod(glowAngle - 0.5, 6.28); // Trail behind main glow
  float trailDiff = min(abs(angle - trailAngle), abs(angle - trailAngle + 6.28));
  trailDiff = min(trailDiff, abs(angle - trailAngle - 6.28));
  float trail = smoothstep(glowWidth * 2.0, 0.0, trailDiff) * rimHighlight * 0.4;

  // Combine all glow effects
  float combinedGlow = glow + secondaryGlow + trail;

  // Create a warm glow color that shifts slightly
  vec3 glowColor = vec3(1.0, 0.9, 0.7) * (0.9 + 0.1 * sin(uTime * 2.0)); 

  // Add subtle color variation based on position
  glowColor = mix(glowColor, vec3(0.9, 0.8, 1.0), sin(angle * 3.0) * 0.3 + 0.3);

  // Apply the glow to the dimmed image
  vec3 finalColor = dimmedColor + combinedGlow * glowColor * 0.5;

  // Add a subtle vignette to enhance the circular focus
  float vignette = 1.0 - smoothstep(0.5, 1.0, dist);
  finalColor *= mix(0.92, 1.0, vignette);

  // Apply additional subtle dimming near the glow for emphasis
  float glowProximity = combinedGlow * 0.6;
  finalColor = mix(finalColor, finalColor * 1.1, glowProximity);

  gl_FragColor = vec4(finalColor, 1.0);
}