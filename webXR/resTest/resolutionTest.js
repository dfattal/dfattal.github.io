// WebGL globals
let gl;
let canvas;
let shaderProgram;
let scale = 1.0;
let devicePixelRatio = window.devicePixelRatio || 1;
console.log("devicePixelRatio: ", devicePixelRatio);

// Fragment shader for concentric circles
const fragmentShader = `
#ifdef GL_ES
precision highp float;
#endif

uniform vec2 u_resolution;  // viewport size in pixels
uniform float u_scale;      // controls sine wave period
void main() {
    // pixel coords
    vec2 p = gl_FragCoord.xy;
    // center of screen
    vec2 c = u_resolution * 0.5;
    // distance from center
    float d = length(p - c);
    // smooth transition between rings
    float ring = d / 2.0;
    // smooth alternating pattern using sine
    float col = 0.5 + 0.5 * sin(ring * 3.14159 * u_scale);
    gl_FragColor = vec4(vec3(col), 1.0);
}
`;

function init() {
    // Get canvas and WebGL context
    canvas = document.getElementById('glCanvas');
    gl = canvas.getContext('webgl', { antialias: false });
    if (!gl) {
        console.error('WebGL not supported');
        return;
    }

    // Create shader program
    shaderProgram = gl.createProgram();

    // Create and compile vertex shader
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, `
        attribute vec2 a_position;
        void main() {
            gl_Position = vec4(a_position, 0, 1);
        }
    `);
    gl.compileShader(vertexShader);

    // Create and compile fragment shader
    const fragShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragShader, fragmentShader);
    gl.compileShader(fragShader);

    // Attach and link shaders
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragShader);
    gl.linkProgram(shaderProgram);
    gl.useProgram(shaderProgram);

    // Setup scale slider
    const scaleSlider = document.getElementById('scaleSlider');
    const scaleValue = document.getElementById('scaleValue');
    scaleSlider.addEventListener('input', (e) => {
        scale = parseFloat(e.target.value);
        scaleValue.textContent = scale.toFixed(2);
        updateCanvasSize();
    });

    // Handle window resize
    window.addEventListener('resize', updateCanvasSize);

    // Initial draw
    updateCanvasSize();
}

function updateCanvasSize() {
    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate scaled dimensions with minimum size of 1
    const scaledWidth = viewportWidth * devicePixelRatio;
    const scaledHeight = viewportHeight * devicePixelRatio;

    // Update canvas size
    canvas.width = scaledWidth;
    canvas.height = scaledHeight;

    // Update viewport
    gl.viewport(0, 0, scaledWidth, scaledHeight);

    // Update resolution uniform
    const resolutionLocation = gl.getUniformLocation(shaderProgram, 'u_resolution');
    if (resolutionLocation) {
        gl.uniform2f(resolutionLocation, scaledWidth, scaledHeight);
    }
    const scaleLocation = gl.getUniformLocation(shaderProgram, 'u_scale');
    if (scaleLocation) {
        gl.uniform1f(scaleLocation, scale);
    }

    draw();
}

function draw() {
    // Clear the canvas
    gl.clearColor(0.5, 0.5, 0.5, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Create position buffer
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
        1, -1,
        -1, 1,
        1, 1
    ]), gl.STATIC_DRAW);

    // Set up position attribute
    const positionLocation = gl.getAttribLocation(shaderProgram, 'a_position');
    if (positionLocation >= 0) {
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        // Draw
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
}

// Initialize when the document is loaded
window.addEventListener('DOMContentLoaded', init); 