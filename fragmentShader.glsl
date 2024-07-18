precision highp float;
varying highp vec2 vTextureCoord;
uniform sampler2D uImage;
uniform sampler2D uDisparityMap;
uniform vec3 uFacePosition;
uniform vec2 iRes, oRes;

// Placeholder for alpha function, replace with actual implementation
float alpha(float x, float y, float z, float disp) {
  // Custom alpha function based on position and disparity
  //return disp;
  return clamp((1.0-disp)*z/600.0,0.0,1.0); // Replace this with your actual alpha function
}

void main(void) {
  vec4 albedoColor = texture2D(uImage, vTextureCoord);
  float disparity = texture2D(uDisparityMap, vTextureCoord).r;
  float alphaValue = alpha(uFacePosition.x, uFacePosition.y, uFacePosition.z, disparity);
  gl_FragColor = vec4(albedoColor.rgb, alphaValue);
}
