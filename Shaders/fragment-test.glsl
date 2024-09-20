precision highp float;
varying vec2 v_texcoord;
uniform sampler2D u_texture;

void main() {
    // Sample the texture at the given coordinates
    vec4 color = texture2D(u_texture, v_texcoord);

    // Apply a simple shader effect (e.g., invert colors for demonstration)
    gl_FragColor = vec4(1.0 - color.rgb, color.a); // Invert the colors
}