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

const MAX_LAYERS = 4; // set by the shader

async function main() {

    let alreadyRunning = 0;
    let mono = 1;

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
    pointLight.position.set(0, 0, 0); // Position the light to the side and above
    scene.add(pointLight);

    // Optionally add ambient light for softer shadows and even lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5); // color, intensity
    scene.add(ambientLight);


    // Create a plane geometry
    const geometry = new THREE.PlaneGeometry(1, 1);

    //Load the shader material
    const vertexShader = `
    varying vec2 v_texcoord;
    void main() {
      v_texcoord = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;

    const fragmentShaderMN = await loadShaderFile('../Shaders/rayCastMonoLDI.glsl');
    const fragmentShaderST = await loadShaderFile('../Shaders/rayCastStereoLDI.glsl');

    // Set up the uniforms with preliminary values
    const uniformsMN = {
        iResOriginal: { value: new THREE.Vector2(1920, 1080) },
        // view info
        uNumLayers: { value: 3 }, // Example value, replace as needed
        uImage: { value: [] }, // Placeholder for textures
        uDisparityMap: { value: [] }, // Placeholder for disparity maps
        invZmin: { value: new Array(MAX_LAYERS).fill(0.1) },
        invZmax: { value: new Array(MAX_LAYERS).fill(0) },
        uViewPosition: { value: new THREE.Vector3(0, 0, 0) },
        sk1: { value: new THREE.Vector2(0.0, 0.0) },
        sl1: { value: new THREE.Vector2(0.0, 0.0) },
        roll1: { value: 0.0 },
        f1: { value: new Array(MAX_LAYERS).fill(0) },
        iRes: { value: [] },
        // render info
        uFacePosition: { value: new THREE.Vector3(0, 0, 0) },
        sk2: { value: new THREE.Vector2(0.0, 0.0) },
        sl2: { value: new THREE.Vector2(0.0, 0.0) },
        roll2: { value: 0.0 },
        f2: { value: 400.0 },
        oRes: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 1.0 },
        feathering: { value: 0.1},
        background: { value: new THREE.Vector3(0.0, 0.0, 0.0) }
    };

    const uniformsST = {
        iResOriginal: { value: new THREE.Vector2(1920, 1080) },
        // view L info
        uNumLayersL: { value: 3 }, // Example value, replace as needed
        uImageL: { value: [] }, // Placeholder for textures
        uDisparityMapL: { value: [] }, // Placeholder for disparity maps
        invZminL: { value: new Array(MAX_LAYERS).fill(0.1) },
        invZmaxL: { value: new Array(MAX_LAYERS).fill(0) },
        uViewPositionL: { value: new THREE.Vector3(0, 0, 0) },
        sk1L: { value: new THREE.Vector2(0.0, 0.0) },
        sl1L: { value: new THREE.Vector2(0.0, 0.0) },
        roll1L: { value: 0.0 },
        f1L: { value: new Array(MAX_LAYERS).fill(0) },
        iResL: { value: [] },
        uNumLayersR: { value: 3 }, // Example value, replace as needed
        uImageR: { value: [] }, // Placeholder for textures
        uDisparityMapR: { value: [] }, // Placeholder for disparity maps
        invZminR: { value: new Array(MAX_LAYERS).fill(0.1) },
        invZmaxR: { value: new Array(MAX_LAYERS).fill(0) },
        uViewPositionR: { value: new THREE.Vector3(0, 0, 0) },
        sk1R: { value: new THREE.Vector2(0.0, 0.0) },
        sl1R: { value: new THREE.Vector2(0.0, 0.0) },
        roll1R: { value: 0.0 },
        f1R: { value: new Array(MAX_LAYERS).fill(0) },
        iResR: { value: [] },
        iResOriginalR: { value: new THREE.Vector2(1920, 1080) },
        //render info
        uFacePosition: { value: new THREE.Vector3(0, 0, 0) },
        sk2: { value: new THREE.Vector2(0.0, 0.0) },
        sl2: { value: new THREE.Vector2(0.0, 0.0) },
        roll2: { value: 0.0 },
        f2: { value: 400.0 },
        oRes: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 1.0 },
        feathering: { value: 0.1},
        background: { value: new THREE.Vector3(0.0, 0.0, 0.0) }
    };

    // Create the shader material
    const materialMN = new THREE.ShaderMaterial({
        vertexShader: vertexShader,
        fragmentShader: fragmentShaderMN,
        uniforms: uniformsMN
    });

    const materialST = new THREE.ShaderMaterial({
        vertexShader: vertexShader,
        fragmentShader: fragmentShaderST,
        uniforms: uniformsST
    });

    // Create the plane mesh
    const planeMN = new THREE.Mesh(geometry, materialMN);
    const planeST = new THREE.Mesh(geometry, materialST);
    //scene.add(plane);

    // Add file picker event listener
    const filePicker = document.getElementById('filePicker');
    filePicker.addEventListener('change', handleFileSelect, false);

    async function parseObjectAndCreateTextures(obj) {
        for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
                if (key === 'image') {
                    try {
                        const img = await loadImage2(obj[key].url);
                        obj[key]['texture'] = createTexture(img);
                    } catch (error) {
                        console.error('Error loading image:', error);
                    }
                } else if (key === 'invZ' && obj.hasOwnProperty('mask')) {
                    try {
                        const maskImg = await loadImage2(obj['mask'].url);
                        const invzImg = await loadImage2(obj['invZ'].url);
                        const maskedInvz = create4ChannelImage(invzImg, maskImg);
                        obj['invZ']['texture'] = createTexture(maskedInvz);
                    } catch (error) {
                        console.error('Error loading mask or invz image:', error);
                    }
                } else if (key === 'invZ') { // no mask
                    try {
                        const invzImg = await loadImage2(obj['invZ'].url);
                        obj['invZ']['texture'] = createTexture(invzImg);
                    } catch (error) {
                        console.error('Error loading invz image:', error);
                    }

                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    // Recursively parse nested objects
                    await parseObjectAndCreateTextures(obj[key]);
                }
            }
        }
    }

    async function handleFileSelect(event) {

        const file = event.target.files[0];
        if (file) {
            scene.remove(planeMN);
            scene.remove(planeST);
            const lifInfo = await parseLif53(file);
            //console.log(lifInfo);
            views = replaceKeys(lifInfo.views,
                ['width_px', 'height_px', 'focal_px', 'inv_z_map', 'layers_top_to_bottom', 'frustum_skew', 'rotation_slant'],
                ['width', 'height', 'f', 'invZ', 'layers', 'sk', 'sl']
            );
            await parseObjectAndCreateTextures(views);
            console.log(views);

            // reset pushed uniforms
            uniformsMN.uImage.value = [];
            uniformsMN.uDisparityMap.value = [];
            uniformsMN.iRes.value = [];
            uniformsST.uImageL.value = [];
            uniformsST.uDisparityMapL.value = [];
            uniformsST.iResL.value = [];
            uniformsST.uImageR.value = [];
            uniformsST.uDisparityMapR.value = [];
            uniformsST.iResR.value = [];

            // Now that we know if mono or stereo setup webGL
            if (views.length < 2) { // MONO VIEW
                mono = 1;
                const numLayers = views[0].layers.length;
                uniformsMN.uNumLayers.value = numLayers; // Update number of layers
                console.log("numLayers: " + numLayers);
                uniformsMN.iResOriginal.value = new THREE.Vector2(views[0].width, views[0].height);

                for (const [i, layer] of views[0].layers.entries()) {

                    uniformsMN.uImage.value.push(layer.image.texture);
                    uniformsMN.uDisparityMap.value.push(layer.invZ.texture);
                    uniformsMN.f1.value[i] = layer.f;
                    uniformsMN.invZmin.value[i] = layer.invZ.min;
                    uniformsMN.invZmax.value[i] = layer.invZ.max;
                    uniformsMN.iRes.value.push(new THREE.Vector2(layer.width, layer.height));
                }

                // three.js wants all uniform arrays filled
                for (let i = numLayers; i < MAX_LAYERS; i++) {
                    uniformsMN.uImage.value.push(views[0].image.texture);
                    uniformsMN.uDisparityMap.value.push(views[0].invZ.texture);
                    uniformsMN.iRes.value.push(new THREE.Vector2(views[0].width, views[0].height));
                }
                scene.add(planeMN);

            } else { // STEREO VIEWS
                mono = 0;
                // View L
                const numLayersL = views[0].layers.length;
                uniformsST.uNumLayersL.value = numLayersL; // Update number of layers
                console.log("numLayersL: " + numLayersL);
                uniformsST.iResOriginal.value = new THREE.Vector2(views[0].width, views[0].height);
                uniformsST.uViewPositionL.value = new THREE.Vector3(views[0].position.x, views[0].position.y, views[0].position.z);

                for (const [i, layer] of views[0].layers.entries()) {

                    uniformsST.uImageL.value.push(layer.image.texture);
                    uniformsST.uDisparityMapL.value.push(layer.invZ.texture);
                    uniformsST.f1L.value[i] = layer.f;
                    uniformsST.invZminL.value[i] = layer.invZ.min;
                    uniformsST.invZmaxL.value[i] = layer.invZ.max;
                    uniformsST.iResL.value.push(new THREE.Vector2(layer.width, layer.height));
                }

                // three.js wants all uniform arrays filled
                for (let i = numLayersL; i < MAX_LAYERS; i++) {
                    uniformsST.uImageL.value.push(views[0].image.texture);
                    uniformsST.uDisparityMapL.value.push(views[0].invZ.texture);
                    uniformsST.iResL.value.push(new THREE.Vector2(views[0].width, views[0].height));
                }

                // View R
                const numLayersR = views[1].layers.length;
                uniformsST.uNumLayersR.value = numLayersR; // Update number of layers
                console.log("numLayersR: " + numLayersR);
                uniformsST.uViewPositionR.value = new THREE.Vector3(views[1].position.x, views[1].position.y, views[1].position.z);

                for (const [i, layer] of views[1].layers.entries()) {

                    uniformsST.uImageR.value.push(layer.image.texture);
                    uniformsST.uDisparityMapR.value.push(layer.invZ.texture);
                    uniformsST.f1R.value[i] = layer.f;
                    uniformsST.invZminR.value[i] = layer.invZ.min;
                    uniformsST.invZmaxR.value[i] = layer.invZ.max;
                    uniformsST.iResR.value.push(new THREE.Vector2(layer.width, layer.height));
                }

                // three.js wants all uniform arrays filled
                for (let i = numLayersR; i < MAX_LAYERS; i++) {
                    uniformsST.uImageR.value.push(views[1].image.texture);
                    uniformsST.uDisparityMapR.value.push(views[1].invZ.texture);
                    uniformsST.iResR.value.push(new THREE.Vector2(views[1].width, views[1].height));
                }

                scene.add(planeST);

            }

            // set plane position and size
            const dMN = 1 / uniformsMN.invZmin.value[0] / focus;
            const dST = 1 / uniformsST.invZminL.value[0] / focus;
            
            planeMN.position.z = -dMN;
            planeMN.scale.x = dMN / views[0].f * views[0].width;
            planeMN.scale.y = dMN / views[0].f * views[0].height;
            uniformsMN.oRes.value = new THREE.Vector2(planeMN.scale.x, planeMN.scale.y);

            planeST.position.z = -dST;
            planeST.scale.x = dST / views[0].f * views[0].width;
            planeST.scale.y = dST / views[0].f * views[0].height;
            uniformsST.oRes.value = new THREE.Vector2(planeST.scale.x, planeST.scale.y);

            // set Sphere postion and size
            sphere.position.z = 0.8 * mono ? planeMN.position.z : planeST.position.z ;
            sphere.scale = 0.4;

            // initial renderCam
            //console.log(views[0]);
            vs = viewportScale(new THREE.Vector2(views[0].width, views[0].height), new THREE.Vector2(mono ? planeMN.scale.x : planeST.scale.x , mono ? planeMN.scale.y : planeST.scale.y) );
            uniformsMN.f2.value = uniformsMN.f1.value[0] * vs;
            uniformsST.f2.value = uniformsST.f1L.value[0] * vs;

            if (!alreadyRunning) {
                animate(); // only once file has been picked
            }
            alreadyRunning = 1;
        }

    }

    // Rendering loop
    function animate() {
        requestAnimationFrame(animate);

        // define camera motion and update uniforms
        const t = Date.now() / 1000; // current time in seconds
        const st = Math.sin(2 * Math.PI * t / 4);
        const ct = Math.cos(2 * Math.PI * t / 4);

        uniformsMN.uFacePosition.value.x = 2 * ct;
        uniformsST.uFacePosition.value.x = uniformsMN.uFacePosition.value.x;
        camera.position.x = uniformsMN.uFacePosition.value.x;

        uniformsMN.uFacePosition.value.y = 1 * st;
        uniformsST.uFacePosition.value.y = uniformsMN.uFacePosition.value.y;
        camera.position.y = uniformsMN.uFacePosition.value.y;

        uniformsMN.uFacePosition.value.z = 2 * st;
        uniformsST.uFacePosition.value.z = uniformsMN.uFacePosition.value.z;
        camera.position.z = -uniformsMN.uFacePosition.value.z;

        uniformsMN.sk2.value.x = - uniformsMN.uFacePosition.value.x / Math.abs(planeMN.position.z - camera.position.z);
        uniformsMN.sk2.value.y = - uniformsMN.uFacePosition.value.y / Math.abs(planeMN.position.z - camera.position.z);
        uniformsMN.f2.value = uniformsMN.f1.value[0] * vs * Math.abs(1 - camera.position.z / planeMN.position.z);
        uniformsST.sk2.value.x = uniformsMN.sk2.value.x;
        uniformsST.sk2.value.y = uniformsMN.sk2.value.y;
        uniformsST.f2.value = uniformsST.f1L.value[0] * vs * Math.abs(1 - camera.position.z / planeST.position.z);

        // render scene
        try {
            renderer.render(scene, camera);
        } catch (e) {
            console.log('Render Error: ', e);
        }
    }
}

main();