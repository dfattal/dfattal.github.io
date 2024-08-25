// Helper functions --> move to module
async function loadImage2(url) { // without cache busting
    const img = new Image();
    img.crossorigin = "anonymous"; // Set cross-origin attribute
    img.src = url;
    return new Promise((resolve) => {
        img.onload = () => resolve(img);
    });
}

async function loadShaderFile(url) {
    const response = await fetch(url + '?t=' + new Date().getTime()); // Append cache-busting query parameter);
    return response.text();
}

function create4ChannelImage(rgbImage, maskImage) {

    const width = rgbImage.width;
    const height = rgbImage.height;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    // Pass { willReadFrequently: true } to optimize for frequent read operations
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Draw the RGB image
    ctx.drawImage(rgbImage, 0, 0, width, height);
    const rgbData = ctx.getImageData(0, 0, width, height).data;

    // Draw the mask image
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(maskImage, 0, 0, width, height);
    const maskData = ctx.getImageData(0, 0, width, height).data;

    // Create a new image data object for the 4-channel image
    const combinedData = ctx.createImageData(width, height);
    for (let i = 0; i < rgbData.length / 4; i++) {
        combinedData.data[i * 4] = rgbData[i * 4];
        combinedData.data[i * 4 + 1] = rgbData[i * 4 + 1];
        combinedData.data[i * 4 + 2] = rgbData[i * 4 + 2];
        combinedData.data[i * 4 + 3] = maskData[i * 4]; // Use the red channel of the mask image for the alpha channel
    }

    return combinedData;
}

function createTexture(image) {
    const texture = new THREE.Texture(image);
    texture.needsUpdate = true;
    return texture;
}

// focal calculations
function viewportScale(iRes, oRes) {
    return Math.min(oRes.x, oRes.y) / Math.min(iRes.x, iRes.y);
}

const MAX_LAYERS = 5; // set by the shader

async function main() {

    // Basic setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Position the camera
    camera.position.z = 0;
    let focus = 1.0;
    let vs; // viewport scaling / zoom

    // Create a sphere for FUN  
    const sphereGeometry = new THREE.SphereGeometry(0.5, 32, 32); // radius, widthSegments, heightSegments
    const sphereMaterial = new THREE.MeshStandardMaterial({
        color: 0x8c2cd4,  // purple color
        metalness: 0.5,   // half metallic
        roughness: 0.2    // Slightly shiny
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    scene.add(sphere);

    // Add a light source to create reflections
    const pointLight = new THREE.PointLight(0xffffff, 1); // color, intensity
    pointLight.position.set(0,0,0); // Position the light to the side and above
    scene.add(pointLight);

    // Optionally add ambient light for softer shadows and even lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5); // color, intensity
    scene.add(ambientLight);


    // Create a plane geometry
    const geometry = new THREE.PlaneGeometry(1, 1);

    //Load the shader material
    const vertexShader = `
    varying vec2 UV;
    void main() {
      UV = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;

    const fragmentShader = await loadShaderFile('./rayCastMonoLDI.glsl');

    // Set up the uniforms with preliminary values
    const uniforms = {
        uNumLayers: { value: 3 }, // Example value, replace as needed
        invZmin: { value: new Array(MAX_LAYERS).fill(0.1) },
        invZmax: { value: new Array(MAX_LAYERS).fill(5) },
        uViewPosition: { value: new THREE.Vector3(0, 0, 0) },
        sk1: { value: new THREE.Vector2(0.0, 0.0) },
        sl1: { value: new THREE.Vector2(0.0, 0.0) },
        roll1: { value: 0.0 },
        f1: { value: new Array(MAX_LAYERS).fill(0) },
        iRes: { value: [] },
        iResOriginal: { value: new THREE.Vector2(1920, 1080) },
        uFacePosition: { value: new THREE.Vector3(0, 0, 0) },
        sk2: { value: new THREE.Vector2(0.0, 0.0) },
        sl2: { value: new THREE.Vector2(0.0, 0.0) },
        roll2: { value: 0.0 },
        f2: { value: 400.0 },
        oRes: { value: new THREE.Vector2(1, 1) },
        uImage: { value: [] }, // Placeholder for textures
        uDisparityMap: { value: [] } // Placeholder for disparity maps
    };

    // Create the shader material
    const material = new THREE.ShaderMaterial({
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        uniforms: uniforms
    });

    // Create the plane mesh
    const plane = new THREE.Mesh(geometry, material);
    scene.add(plane);

    // Add file picker event listener
    const filePicker = document.getElementById('filePicker');
    filePicker.addEventListener('change', handleFileSelect, false);

    async function handleFileSelect(event) {

        const file = event.target.files[0];
        if (file) {
            const currentImgData = await parseLif5(file);
            console.log(currentImgData);
            const numLayers = currentImgData.layers.length;
            uniforms.uNumLayers.value = numLayers; // Update number of layers
            console.log("numLayers: " + numLayers);
            const mainImage = await loadImage2(currentImgData.rgb); // only needed to extract original width+height
            const mainDisp = await loadImage2(currentImgData.disp); // only needed to extract original width+height

            //views[0].f = currentImgData.f * views[0].width; // focal of main image
            // rest of views[0] has been initialized to zero before
            uniforms.iResOriginal.value = new THREE.Vector2(mainImage.width, mainImage.height);

            for (let i = 0; i < numLayers; i++) {
                const albedoImage = await loadImage2(currentImgData.layers[i].rgb);
                const disparityImage = await loadImage2(currentImgData.layers[i].disp);
                const maskImage = await loadImage2(currentImgData.layers[i].mask);
                const disparity4Image = create4ChannelImage(disparityImage, maskImage);

                uniforms.uImage.value.push(createTexture(albedoImage));
                uniforms.uDisparityMap.value.push(createTexture(disparity4Image));
                uniforms.f1.value[i] = currentImgData.f * mainImage.width; // temporary until LIF 5.3
                uniforms.invZmin.value[i] = -currentImgData.minDisp / currentImgData.f; // temporary until LIF 5.3
                uniforms.invZmax.value[i] = -currentImgData.maxDisp / currentImgData.f; // temporary until LIF 5.3
                uniforms.iRes.value.push(new THREE.Vector2(albedoImage.width, albedoImage.height));
            }

            // three.js wants all uniform arrays filled
            for (let i = numLayers; i < MAX_LAYERS; i++) {
                uniforms.uImage.value.push(createTexture(mainImage));
                uniforms.uDisparityMap.value.push(createTexture(mainDisp));
                uniforms.iRes.value.push(new THREE.Vector2(mainImage.width, mainImage.height));
            }

            // set plane position and size
            const d = 1 / uniforms.invZmin.value[0] / focus;
            plane.position.z = -d;
            plane.scale.x = d / currentImgData.f; // f was frac image width
            plane.scale.y = d / currentImgData.f * mainImage.height / mainImage.width;
            uniforms.oRes.value = new THREE.Vector2(plane.scale.x, plane.scale.y);

            // set Sphere postion and size
            sphere.position.z = 0.8 * plane.position.z;
            sphere.scale = 0.4;

            // initial renderCam
            vs = viewportScale(uniforms.iResOriginal.value, uniforms.oRes.value);
            console.log('vs: ', vs);
            uniforms.f2.value = uniforms.f1.value[0] * vs;

            console.log(uniforms);

            animate(); // only once file has been picked
        }

    }

    // Rendering loop
    function animate() {
        requestAnimationFrame(animate);

        // define camera motion and update uniforms
        const t = Date.now() / 1000; // current time in seconds
        const st = Math.sin(2 * Math.PI * t / 4);
        const ct = Math.cos(2 * Math.PI * t / 4);

        uniforms.uFacePosition.value.x = 2 * ct;
        camera.position.x = uniforms.uFacePosition.value.x;

        uniforms.uFacePosition.value.y = 1 * st;
        camera.position.y = uniforms.uFacePosition.value.y;

        uniforms.uFacePosition.value.z = 2 * st;
        camera.position.z = -uniforms.uFacePosition.value.z;

        uniforms.sk2.value.x = - uniforms.uFacePosition.value.x / Math.abs(plane.position.z - camera.position.z);
        uniforms.sk2.value.y = - uniforms.uFacePosition.value.y / Math.abs(plane.position.z - camera.position.z);
        uniforms.f2.value = uniforms.f1.value[0] * vs * Math.abs(1 - camera.position.z / plane.position.z);

        // render scene
        renderer.render(scene, camera);
    }
}

main();