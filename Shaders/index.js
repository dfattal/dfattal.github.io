import { createShaderProgram, createBuffers, drawScene } from './webglUtils.js';

async function main() {
    const imgElement = document.getElementById('image');
    const canvas = document.getElementById('glCanvas');
    const gl = canvas.getContext('webgl');

    if (!gl) {
        console.error('WebGL not supported');
        return;
    }

    // Add an event listener for image loading
    imgElement.addEventListener('load', async () => {
        console.log("Image loaded");

        // Set the canvas size to match the image size
        canvas.width = imgElement.width;
        canvas.height = imgElement.height;
        gl.viewport(0, 0, canvas.width, canvas.height);

        // Load and compile shaders
        const program = await createShaderProgram(gl, 'vertex.glsl', 'fragment-test.glsl');

        // Create buffers for geometry (a quad)
        const buffers = createBuffers(gl);

        // Create a texture from the image
        const texture = createTextureFromImage(gl, imgElement);

        // Draw the scene with the shader applied to the texture
        drawScene(gl, program, buffers, texture);
    });

    // Check if the image is already loaded (for cached images)
    if (imgElement.complete) {
        imgElement.dispatchEvent(new Event('load'));
    }
}

// Create a WebGL texture from an image element
function createTextureFromImage(gl, imgElement) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    
    // Flip the image's Y axis to match WebGL's texture coordinates
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    // Load the image into the texture
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgElement);

    // Set texture parameters
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    return texture;
}

// Start the main function
main();