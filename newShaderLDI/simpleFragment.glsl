precision mediump float;

uniform vec3 uColor; // The color uniform, used when no texture is loaded
uniform sampler2D uImage[1]; // The texture uniform array
uniform int uNumLayers; // The number of layers (1 in this case)
varying vec2 vUv; // The UV coordinates passed from the vertex shader

void main() {
    // Default color is grey
    vec4 color = vec4(uColor, 1.0);

    // If a texture is loaded, use it
    if (uNumLayers > 0) {
        color = texture2D(uImage[0], vUv);
    }

    gl_FragColor = color;
}