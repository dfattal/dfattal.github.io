precision mediump float;
varying vec2 v_texcoord;
uniform sampler2D u_image;
uniform float u_time;

void main() {
    vec4 color = texture2D(u_image, v_texcoord);

    // Animate the swap of red and blue channels over time
    if (mod(u_time, 2.0) > 1.0) {
        gl_FragColor = vec4(color.b, color.g, color.r, color.a); // Swap red and blue
    } else {
        gl_FragColor = color; // Original color
    }
}