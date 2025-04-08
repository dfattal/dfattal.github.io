const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl');

if (!gl) {
    console.error('WebGL not supported or disabled');
    document.body.innerHTML = 'WebGL not available';
    throw new Error('WebGL not available');
}

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
console.log('Canvas dimensions:', canvas.width, 'x', canvas.height);

// Vertex shader (pass-through)
const vertexSrc = `
  attribute vec2 aPosition;
  attribute vec2 aUV;
  varying vec2 vUV;
  void main() {
    vUV = aUV;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

// Create shader selection UI
const shaderSelector = document.createElement('div');
shaderSelector.id = 'shader-selector';
shaderSelector.innerHTML = `
  <div>
    <button id="stereoGlitch" class="active">Stereo Glitch</button>
    <button id="cinematicSweep">Cinematic Sweep</button>
  </div>
`;
document.body.appendChild(shaderSelector);

// Style shader selector
const style = document.createElement('style');
style.textContent = `
  #shader-selector {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
    background: rgba(0,0,0,0.5);
    padding: 10px;
    border-radius: 5px;
  }
  #shader-selector button {
    background: #333;
    color: white;
    border: none;
    padding: 8px 12px;
    margin: 0 5px;
    border-radius: 3px;
    cursor: pointer;
  }
  #shader-selector button.active {
    background: #0078d7;
  }
`;
document.head.appendChild(style);

// Track current shader
let currentShader = 'stereoGlitch';
let fragSrc, program, vs, fs;

// Load shader function
async function loadShader(shaderName) {
    document.getElementById('status').innerHTML = `Loading ${shaderName} shader...`;

    // Update UI
    document.querySelectorAll('#shader-selector button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(shaderName).classList.add('active');

    try {
        // Load fragment shader (fetch as text)
        fragSrc = await fetch(`${shaderName}.glsl`).then(res => res.text())
            .catch(err => {
                console.error('Failed to load shader:', err);
                return null;
            });

        console.log('Fragment shader loaded:', !!fragSrc);

        if (!fragSrc) {
            document.getElementById('status').innerHTML = `Failed to load ${shaderName}.glsl`;
            return false;
        }

        // Delete old program if it exists
        if (program) {
            gl.deleteProgram(program);
            gl.deleteShader(vs);
            gl.deleteShader(fs);
        }

        // Compile new shaders
        vs = compileShader(vertexSrc, gl.VERTEX_SHADER);
        fs = compileShader(fragSrc, gl.FRAGMENT_SHADER);

        if (!vs || !fs) {
            console.error('Shader compilation failed');
            document.getElementById('status').innerHTML = 'Shader compilation failed';
            return false;
        }

        // Create new program
        program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Program link failed:', gl.getProgramInfoLog(program));
            document.getElementById('status').innerHTML = 'Shader program linking failed';
            return false;
        }

        gl.useProgram(program);

        // Update attribute locations
        setupAttributes();

        // Update uniform locations
        setupUniforms();

        document.getElementById('status').innerHTML = `${shaderName} shader loaded successfully`;
        currentShader = shaderName;
        return true;
    } catch (e) {
        console.error('Error loading shader:', e);
        document.getElementById('status').innerHTML = `Error loading shader: ${e.message}`;
        return false;
    }
}

// Shader compiler
function compileShader(src, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        return null;
    }
    return shader;
}

// Quad geometry
const vertices = new Float32Array([
    -1, -1, 0, 0,
    1, -1, 1, 0,
    -1, 1, 0, 1,
    1, 1, 1, 1,
]);

const vao = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vao);
gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

// Attributes and uniforms
let aPosition, aUV, uTime, uTexture, uAmount;

function setupAttributes() {
    aPosition = gl.getAttribLocation(program, 'aPosition');
    aUV = gl.getAttribLocation(program, 'aUV');
    console.log('Attribute locations:', { aPosition, aUV });

    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aUV);
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 16, 8);
}

function setupUniforms() {
    uTime = gl.getUniformLocation(program, 'uTime');
    uTexture = gl.getUniformLocation(program, 'uTexture');

    // Special handling for uAmount which only exists in stereoGlitch shader
    if (currentShader === 'stereoGlitch') {
        uAmount = gl.getUniformLocation(program, 'uAmount');
    }

    console.log('Uniform locations:', { uTime, uTexture, uAmount });
}

// Add event listeners to shader buttons
document.getElementById('stereoGlitch').addEventListener('click', () => loadShader('stereoGlitch'));
document.getElementById('cinematicSweep').addEventListener('click', () => loadShader('cinematicSweep'));

// Load texture
const image = new Image();
const imagePath = './assets/input_2x1.jpg';
image.src = imagePath;
image.crossOrigin = 'anonymous'; // Try adding this if CORS is an issue

console.log('Attempting to load image from:', imagePath);
document.getElementById('status').innerHTML = 'Loading image...';

image.onerror = (err) => {
    console.error('Failed to load image:', err);
    document.getElementById('status').innerHTML = 'Error loading image: ' + imagePath;
};

let texture;

image.onload = () => {
    console.log('Image loaded successfully:', image.width, 'x', image.height);
    document.getElementById('status').innerHTML = 'Image loaded: ' + image.width + 'x' + image.height;

    try {
        // Create and setup texture
        texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);

        // Flip Y coordinate to match WebGL's coordinate system
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // Load initial shader
        loadShader('stereoGlitch').then(success => {
            if (success) {
                gl.uniform1i(uTexture, 0);
                requestAnimationFrame(draw);
            }
        });
    } catch (e) {
        console.error('Error setting up texture:', e);
        document.getElementById('status').innerHTML = 'Error setting up texture: ' + e.message;
    }
};

// Animation loop
function draw(time) {
    document.getElementById('status').innerHTML = `Running ${currentShader} - time: ${(time * 0.001).toFixed(2)}s`;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Animate based on current shader
    gl.uniform1f(uTime, time * 0.001);

    // Special handling for stereoGlitch shader
    if (currentShader === 'stereoGlitch') {
        // Animate glitch effect with adjustable frequency
        const frequency = 1.5; // Adjust for faster/slower oscillation
        gl.uniform1f(uTime, time * 0.001 * frequency);

        // Use a smaller value for a more subtle effect since we're amplifying it on edges
        gl.uniform1f(uAmount, 0.002); // Reduced from 0.005 as edge detection multiplies this
    }

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(draw);
}

// Add global error handler for WebGL
window.addEventListener('error', (event) => {
    document.getElementById('status').innerHTML = 'Error: ' + event.message;
    console.error('Global error:', event);
});