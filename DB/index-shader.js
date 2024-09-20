import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.1.0/+esm';

const supabaseUrl = 'https://jcrggsguegcmuvdglifa.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impjcmdnc2d1ZWdjbXV2ZGdsaWZhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNTY3MzEzMywiZXhwIjoyMDQxMjQ5MTMzfQ.V1_vSCOo7tINwWuU6PFU7fQnBCMNrAwPYG-XMtonmLA';
const supabase = createClient(supabaseUrl, supabaseKey);

const bucketName = 'testAppImages';
let deleteMode = false; // Track if the user is in delete mode

// IndexedDB functions for caching
function openIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("imageCacheDB", 1);
        request.onupgradeneeded = function (event) {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("images")) {
                db.createObjectStore("images", { keyPath: "id" });
            }
        };
        request.onsuccess = function (event) {
            resolve(event.target.result);
        };
        request.onerror = function (event) {
            reject("Error opening IndexedDB");
        };
    });
}

async function cacheImage(id, imageData) {
    const db = await openIndexedDB();
    const transaction = db.transaction("images", "readwrite");
    const objectStore = transaction.objectStore("images");
    objectStore.put({ id, data: imageData });
}

async function getCachedImage(id) {
    const db = await openIndexedDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("images", "readonly");
        const objectStore = transaction.objectStore("images");
        const request = objectStore.get(id);
        request.onsuccess = function (event) {
            resolve(event.target.result ? event.target.result.data : null);
        };
        request.onerror = function () {
            reject("Error fetching image from cache");
        };
    });
}

async function removeCachedImage(id) {
    const db = await openIndexedDB();
    const transaction = db.transaction("images", "readwrite");
    const objectStore = transaction.objectStore("images");
    objectStore.delete(id);
}

// Function to handle image uploading
async function uploadImage() {
    const fileInput = document.getElementById('imageInput');
    const file = fileInput.files[0];

    if (!file) {
        alert('Please select an image to upload.');
        return;
    }

    const fileName = `${file.name}`;
    const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(fileName, file);

    if (error) {
        console.error('Error uploading image:', error);
        alert('Failed to upload image.');
    } else {
        const publicURL = supabase.storage.from(bucketName).getPublicUrl(file.name);

        if (publicURL) {
            appendImageToGrid(fileName, publicURL.data.publicUrl);
            cacheImage(fileName, publicURL.data.publicUrl);
            alert('Image uploaded successfully!');
        }
    }
}

// ShaderImage Class
class ShaderImage {
    constructor(imgElement, fragmentShaderSource) {
        this.imgElement = imgElement;
        this.fragmentShaderSource = fragmentShaderSource;
        this.canvas = document.createElement('canvas');
        this.gl = this.canvas.getContext('webgl');
        this.time = 0;
        this.animationFrame = null;

        // Replace the image with a canvas
        this.canvas.style.display = 'none';
        this.canvas.width = this.imgElement.width;
        this.canvas.height = this.imgElement.height;
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.imgElement.parentNode.insertBefore(this.canvas, this.imgElement);

        // Set up shader
        this.setupShader();
        this.loadTexture();

        // Add event listeners for hover and mouse out
        this.imgElement.parentNode.addEventListener('mouseover', () => this.startAnimation());
        this.imgElement.parentNode.addEventListener('mouseout', () => this.stopAnimation());
    }

    async setupShader() {
        const vertexShaderSource = `
            attribute vec2 a_position;
            varying vec2 v_texcoord;
            void main() {
                gl_Position = vec4(a_position, 0, 1);
                v_texcoord = (a_position + 1.0) * 0.5;
            }
        `;

        const vertexShader = this.createShader(this.gl, this.gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.createShader(this.gl, this.gl.FRAGMENT_SHADER, this.fragmentShaderSource);

        this.program = this.createProgram(this.gl, vertexShader, fragmentShader);
        this.gl.useProgram(this.program);

        this.positionAttributeLocation = this.gl.getAttribLocation(this.program, "a_position");

        // Set up geometry
        const positions = new Float32Array([
            -1, -1,  // bottom left
            1, -1,   // bottom right
            -1, 1,   // top left
            1, 1     // top right
        ]);

        const positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);

        this.gl.enableVertexAttribArray(this.positionAttributeLocation);
        this.gl.vertexAttribPointer(this.positionAttributeLocation, 2, this.gl.FLOAT, false, 0, 0);
    }

    createShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    createProgram(gl, vertexShader, fragmentShader) {
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error(gl.getProgramInfoLog(program));
            gl.deleteProgram(program);
            return null;
        }
        return program;
    }

    loadTexture() {
        // Create texture
        this.texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    
        // Flip the image's Y axis to match WebGL's texture coordinate system
        this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
    
        // Fill with a placeholder while loading the actual image
        const placeholderColor = new Uint8Array([255, 0, 0, 255]); // Red square placeholder
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, 1, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, placeholderColor);
    
        const img = new Image();
        img.crossOrigin = "anonymous"; // This might be needed depending on where the image is hosted
        img.src = this.imgElement.src;
        img.onload = () => {
            // Now bind the texture and load the actual image data into it
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, img);
    
            // Set texture parameters for NPOT textures
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR); // No mipmaps for NPOT
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);

            // this.startAnimation();
        };
    }

    startAnimation() {
        this.imgElement.style.display = 'none'; // Hide the image when starting the shader
        this.canvas.style.display = 'block'; // Show the canvas
    
        const uImageLocation = this.gl.getUniformLocation(this.program, "u_image"); // Uniform for texture
        this.gl.uniform1i(uImageLocation, 0); // Texture unit 0
    
        this.time = 0;
        const render = (time) => {
            this.time += 0.01; // Increment time
            const uTimeLocation = this.gl.getUniformLocation(this.program, "u_time");
            this.gl.uniform1f(uTimeLocation, this.time); // Pass the time to the shader
    
            // Clear and draw
            this.gl.clear(this.gl.COLOR_BUFFER_BIT);
            this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    
            this.animationFrame = requestAnimationFrame(render);
        };
        this.animationFrame = requestAnimationFrame(render);
    }
    
    stopAnimation() {
        cancelAnimationFrame(this.animationFrame);
        this.imgElement.style.display = 'block'; // Show the image again
        this.canvas.style.display = 'none'; // Hide the canvas when the animation stops
    }
}

// Function to display images in the grid
async function displayImages() {
    
    const { data, error } = await supabase.storage
        .from(bucketName)
        .list();
    if (error) {
        console.error('Error retrieving images:', error);
        return;
    }

    const imageGrid = document.getElementById('imageGrid');
    imageGrid.innerHTML = ''; // Clear the grid without full reload

    for (const file of data) {
        let cachedImage = await getCachedImage(file.name);
        if (cachedImage) {
            await appendImageToGrid(file.name, cachedImage);
        } else {
            try {
                const publicURL = supabase.storage.from(bucketName).getPublicUrl(file.name);
                if (publicURL) {
                    appendImageToGrid(file.name, publicURL.data.publicUrl);
                    cacheImage(file.name, publicURL.data.publicUrl);
                }
            } catch (err) {
                console.error('Error processing file:', file.name, err);
            }
        }
    }
}

async function appendImageToGrid(id, url) {
    const container = document.createElement('div');
    container.classList.add('grid-item');

    const img = document.createElement('img');
    img.src = url;
    img.alt = id;

    // Append the image element to the container
    container.appendChild(img);
    
    // Append the container to the image grid in the DOM
    document.getElementById('imageGrid').appendChild(container);
    const fragmentShaderSource = await loadFragmentShader('../Shaders/fragment-shader.glsl');
    new ShaderImage(img, fragmentShaderSource);
}

// Load the fragment shader from external file
async function loadFragmentShader(url) {
    const response = await fetch(url);
    return await response.text();
}

// Apply the shader to images on page load
document.addEventListener('DOMContentLoaded', async () => {
    //const fragmentShaderSource = await loadFragmentShader('fragment-shader.glsl');
    
    // First, display the images from Supabase
    await displayImages();

    // Then, apply the shader to the images
    // const images = document.querySelectorAll('.grid img');
    // images.forEach(img => {
    //     new ShaderImage(img, fragmentShaderSource);
    // });
});