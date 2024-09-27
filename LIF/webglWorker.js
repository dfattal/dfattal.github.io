let gl;
let programInfo;
let animationFrame;
let views;

onmessage = async function (e) {
    if (e.data.canvas) {
        const offscreenCanvas = e.data.canvas;
        gl = offscreenCanvas.getContext('webgl');
        views = e.data.views;

        const fragmentShaderUrl = e.data.fragmentShaderUrl;
        const vertexShaderUrl = e.data.vertexShaderUrl;

        // Initialize WebGL shaders and textures
        await setupWebGL(views, vertexShaderUrl, fragmentShaderUrl);
        startRendering();
    }

    if (e.data.action === 'stop') {
        cancelAnimationFrame(animationFrame);
    }
};

async function setupWebGL(views) {
    // Example WebGL setup (reuse parts of your existing setup methods)
    const vsSource = await loadShaderFile('../Shaders/vertex.glsl');
    const fsSource = await loadShaderFile('../Shaders/rayCastMonoLDIGlow.glsl');

    const shaderProgram = await initShaderProgram(vsSource, fsSource);
    programInfo = {
        program: shaderProgram,
        attribLocations: {
            vertexPosition: gl.getAttribLocation(shaderProgram, 'a_position'),
            textureCoord: gl.getAttribLocation(shaderProgram, 'a_texcoord')
        },
        uniformLocations: {
            uTime: gl.getUniformLocation(shaderProgram, 'uTime'),
            uImage: [],
            uDisparityMap: [],
            uNumLayers: gl.getUniformLocation(shaderProgram, 'uNumLayers'),
            uViewPosition: gl.getUniformLocation(shaderProgram, 'uViewPosition')
        }
    };

    // Set up textures, buffers, etc.
    await parseObjAndCreateTextures(views);
}

function startRendering() {
    function render(time) {
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Bind textures, set uniforms, and draw scene
        drawScene(time);

        animationFrame = requestAnimationFrame(render);
    }

    render(0);
}

function drawScene(time) {
    // WebGL rendering logic (adapted from your existing rendering code)
}

async function loadShaderFile(url) {
    const response = await fetch(url + '?t=' + new Date().getTime());
    return response.text();
}

async function initShaderProgram(vsSource, fsSource) {
    const vertexShader = loadShader(gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl.FRAGMENT_SHADER, fsSource);
    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        console.error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
        return null;
    }

    return shaderProgram;
}

function loadShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}