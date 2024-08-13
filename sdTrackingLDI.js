// sdTrackingLDI.js

// Hugging Face API endpoints and headers
const BASE_API_URL = "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0";
const REFINER_API_URL = "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-refiner-1.0";
const AWS_LAMBDA_URL = 'https://sk5ppdkibbohlyjwygbjqoi2ru0dvwje.lambda-url.us-east-1.on.aws';

let numLayers = 3;
const MAX_LAYERS = 5;

let currentImgData = {};

function setupWebGL(gl, fragmentShaderSource) {

  const vsSource = vertexShaderSource;
  const fsSource = fragmentShaderSource;

  // Initialize shaders and program
  const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
  const programInfo = {
    program: shaderProgram,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
      textureCoord: gl.getAttribLocation(shaderProgram, 'aTextureCoord'),
    },
    uniformLocations: {
      uImage: [],
      uDisparityMap: [],
      uNumLayers: gl.getUniformLocation(shaderProgram, 'uNumLayers'),
      uFacePosition: gl.getUniformLocation(shaderProgram, 'uFacePosition'),
      iRes: gl.getUniformLocation(shaderProgram, 'iRes'),
      oRes: gl.getUniformLocation(shaderProgram, 'oRes'),
      vd: gl.getUniformLocation(shaderProgram, 'vd'),
      IO: gl.getUniformLocation(shaderProgram, 'IO'),
      f: gl.getUniformLocation(shaderProgram, 'f'),
      minDisp: gl.getUniformLocation(shaderProgram, 'minDisp'),
      maxDisp: gl.getUniformLocation(shaderProgram, 'maxDisp'),
      outpaintRatio: gl.getUniformLocation(shaderProgram, 'outpaintRatio')
    },
  };

  // Populate the uniform location arrays
  for (let i = 0; i < MAX_LAYERS; i++) { // looks like it works with numLayers instead of MAX_LAYERS...
    programInfo.uniformLocations.uImage.push(gl.getUniformLocation(shaderProgram, `uImage[${i}]`));
    programInfo.uniformLocations.uDisparityMap.push(gl.getUniformLocation(shaderProgram, `uDisparityMap[${i}]`));
  }

  // Vertex positions and texture coordinates
  const positions = new Float32Array([
    -1.0,  1.0,
     1.0,  1.0,
    -1.0, -1.0,
     1.0, -1.0,
  ]);
  const textureCoords = new Float32Array([
    0.0,  0.0,
    1.0,  0.0,
    0.0,  1.0,
    1.0,  1.0,
]);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  const textureCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, textureCoords, gl.STATIC_DRAW);

  const indexBuffer = gl.createBuffer();
  const indices = [0, 1, 2, 2, 1, 3];
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

  return { programInfo, buffers: { position: positionBuffer, textureCoord: textureCoordBuffer, indices: indexBuffer } };
}

function drawScene(gl, programInfo, buffers, textures, facePosition) {
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(programInfo.program);

  // Vertex positions
  {
    const numComponents = 2;
    const type = gl.FLOAT;
    const normalize = false;
    const stride = 0;
    const offset = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, numComponents, type, normalize, stride, offset);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
  }

  // Texture coordinates
  {
    const numComponents = 2;
    const type = gl.FLOAT;
    const normalize = false;
    const stride = 0;
    const offset = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.textureCoord);
    gl.vertexAttribPointer(programInfo.attribLocations.textureCoord, numComponents, type, normalize, stride, offset);
    gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);
  }

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);

  // Loop through each layer and bind textures
  for (let i = 0; i < numLayers; i++) {
    gl.activeTexture(gl.TEXTURE0 + (2 * i));
    gl.bindTexture(gl.TEXTURE_2D, textures[i].albedo);
    gl.uniform1i(programInfo.uniformLocations.uImage[i], 2 * i);

    gl.activeTexture(gl.TEXTURE0 + (2 * i + 1));
    gl.bindTexture(gl.TEXTURE_2D, textures[i].disparity);
    gl.uniform1i(programInfo.uniformLocations.uDisparityMap[i], 2 * i + 1);
  }
  // Pass the actual number of layers to the shader
  gl.uniform1i(gl.getUniformLocation(programInfo.program, 'uNumLayers'), currentImgData.layers.length);


  gl.uniform3f(programInfo.uniformLocations.uFacePosition, facePosition.x, facePosition.y, facePosition.z);
  //gl.uniform2f(programInfo.uniformLocations.iRes, albedoImage.width, albedoImage.height);  // Add this line
  gl.uniform2f(programInfo.uniformLocations.iRes, textures[0].width, textures[0].height);  // Add this line
  gl.uniform2f(programInfo.uniformLocations.oRes, gl.canvas.width, gl.canvas.height);      // Add this line
  gl.uniform1f(programInfo.uniformLocations.vd, isMobileDevice() ? 0.7*restPos : restPos);
  gl.uniform1f(programInfo.uniformLocations.f, currentImgData.f);
  gl.uniform1f(programInfo.uniformLocations.minDisp, currentImgData.minDisp);
  gl.uniform1f(programInfo.uniformLocations.maxDisp, currentImgData.maxDisp);
  //gl.uniform1f(programInfo.uniformLocations.outpaintRatio, currentImgData.outpaintWidth ? textures[0].width / (textures[0].width - currentImgData.outpaintWidth : currentImgData.totalOutpaintWidth));
  gl.uniform1f(programInfo.uniformLocations.outpaintRatio,currentImgData.outpaintRatio);
  console.log(currentImgData.outpaintRatio);
  gl.uniform1f(programInfo.uniformLocations.IO, 63.0);

  const vertexCount = 6;
  const type = gl.UNSIGNED_SHORT;
  const offset = 0;
  gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);

  //logAllUniforms(gl, programInfo.program);
}

async function generateImageAndLif() {
    const prompt = document.getElementById('prompt').value;
    const negPrompt = document.getElementById('negPrompt').value;
    const seed = document.getElementById('seed').value;
    const logContainer = document.getElementById('log');
    const token = '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';

    logContainer.textContent = 'Generating image...';

    try {
        const response = await fetch(BASE_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ inputs: prompt, negative_prompt: negPrompt, seed: seed ? parseInt(seed) : undefined })
        });

        if (!response.ok) {
            const errorResponse = await response.json();
            const errorMessage = errorResponse.error || `HTTP error! status: ${response.status}`;
            throw new Error(errorMessage);
        }

        const result = await response.blob();
        const imageURL = URL.createObjectURL(result);

        document.getElementById('image-container').innerHTML = `<img id="generatedImage" src="${imageURL}" alt="Generated Image">`;
        logContainer.textContent += '\nImage generated successfully.';

        await processImageForLDL(result);
    } catch (error) {
        logContainer.textContent += `\nError: ${error.message}\n${error.stack}`;
    }
}

async function processImageForLDL(imageBlob) {
    const logContainer = document.getElementById('log');
    logContainer.textContent += '\nGenerating LDI...';

    try {
        const accessToken = await getAccessToken();
        logContainer.textContent += '\nAuthenticated to IAI Cloud 🤗';
        const storageUrl = await getStorageUrl(accessToken, 'generated_image.jpg');
        logContainer.textContent += '\nGot temporary storage URL on IAI Cloud 💪';
        await uploadToStorage(storageUrl, imageBlob);
        logContainer.textContent += '\nuploaded AI Image to IAI Cloud 🚀';


        const ldiUrl = await generateLifUrl(accessToken, storageUrl);
        logContainer.textContent += '\nIAI Cloud returned LDI image 🎉';
        //displayDisparityMap(ldiUrl);

        const ldiResponse = await fetch(ldiUrl, { mode: 'cors' });
        const ldiBlob = await ldiResponse.blob();
        logContainer.textContent += '\nStarting Interactive Session 😍';
        startInteractiveExperience(ldiBlob);
    } catch (error) {
        logContainer.textContent += `\nError generating LDI: ${error.message}\n${error.stack}`;
    }
}

async function getAccessToken() {
    const response = await axios.post(AWS_LAMBDA_URL, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Access-Control-Allow-Origin': '*'
        },
    });
    console.log('Access token acquired:', response.data);
    return response.data.access_token;
}

async function getStorageUrl(accessToken, fileName) {
    //const response = await fetch('https://api.immersity.ai/api/v1/get-upload-url?fileName=' + fileName + '&mediaType=image%2Fjpeg', {
    const response = await fetch('https://api.dev.immersity.ai/api/v1/get-upload-url?fileName=' + fileName + '&mediaType=image%2Fjpeg', {
        method: 'GET',
        headers: {
            authorization: `Bearer ${accessToken}`,
            accept: 'application/json'
        },
    });
    const data = await response.json();
    console.log('upload URL : ', data.url);
    return data.url;
}

async function uploadToStorage(url, file) {
    try {
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': file.type
            },
            body: file
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        console.log('File uploaded successfully');
    } catch (error) {
        console.error('Error uploading file:', error);
    }
}

async function generateLifUrl(accessToken, storageUrl) {
    //const response = await fetch('https://api.immersity.ai/api/v1/disparity', {
    const response = await fetch('https://api.dev.immersity.ai/api/v1/ldl', {
        method: 'POST',
        headers: {
            accept: 'application/json',
            authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            inputImageUrl: storageUrl
        })
    });
    const data = await response.json();
    console.log("LDI endpoint returned presigned URL: ", data.resultPresignedUrl);
    return data.resultPresignedUrl;
}

function startInteractiveExperience(lifFile) {
    try{
        main(lifFile);
    } catch (e) {
        console.log(e.message);
    }
}

async function main(lifFile) {

    const video = await setupCamera();
    const textures = [];
    document.getElementById('prompt-container').style.display = 'none';
    document.getElementById('canvas-container').style.display = 'flex';
    const focalLength = Math.max(video.videoWidth, video.videoHeight) * (isMobileDevice() ? 0.8 : 1.0);
    const iOSmsg = document.getElementById('iOSmsg');
    const stats = new Stats();
    stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom


    function startVideo() {
        iOSmsg.remove();
        document.body.appendChild(stats.dom);
        video.play();
    }

    if (isIOS()) {
        iOSmsg.style.display = 'flex';
        iOSmsg.textContent = 'iOS Device Detected. Click to start video.';
        document.addEventListener('click', startVideo, { once: true });
    } else {
        startVideo();
    }

    let facePosition = {x: 0, y: 0, z: 600};
    let oldFacePosition = {x: 0, y: 0, z: 600};
    const axy = 0.5; // exponential smoothing
    const az = 0.1; // exponential smoothing

    const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
    const detector = await faceLandmarksDetection.createDetector(model, { runtime: 'tfjs' });
    const canvas = document.getElementById('glCanvas');
    const gl = canvas.getContext('webgl');
    const container = document.getElementById('canvas-container');

    if (!gl) {
        console.error('Unable to initialize WebGL. Your browser or machine may not support it.');
        return;
    }

    const resizeCanvasToContainer = () => {
        const displayWidth = container.clientWidth;
        const displayHeight = container.clientHeight;

        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
            canvas.width = displayWidth;
            canvas.height = displayHeight;
            gl.viewport(0, 0, canvas.width, canvas.height);
        }
    };

    window.addEventListener('resize', resizeCanvasToContainer);
    resizeCanvasToContainer();

    const fragmentShaderSource = await loadShaderFile('./rayCastMonoLDI.glsl');

    currentImgData = await parseLif5(lifFile);
    numLayers = currentImgData.layers.length;

    for (let i = 0; i < numLayers; i++) {
        const albedoImage = await loadImage2(currentImgData.layers[i].rgb);
        const disparityImage = await loadImage2(currentImgData.layers[i].disp);
        const maskImage = await loadImage2(currentImgData.layers[i].mask);
        const disparity4Image = create4ChannelImage(disparityImage, maskImage);

        textures.push({
          albedo: createTexture(gl, albedoImage),
          disparity: createTexture(gl, disparity4Image),
          width: albedoImage.width,
          height: albedoImage.height
        });
    }
    const mainImage = await loadImage2(currentImgData.rgb);
    currentImgData.outpaintRatio = textures[0].width/mainImage.width;
    console.log(currentImgData);

    const { programInfo, buffers } = setupWebGL(gl, fragmentShaderSource);

    const render = async () => {
        stats.begin();
        resizeCanvasToContainer();

        if (textures.length==numLayers) {
            const predictions = await detector.estimateFaces(video, { flipHorizontal: false });
            const newFacePosition = extractFacePosition(predictions, focalLength);
            if (newFacePosition) {
                facePosition.x = (1-axy)*oldFacePosition.x + axy*newFacePosition.x;
                facePosition.y = (1-axy)*oldFacePosition.y + axy*newFacePosition.y;
                facePosition.z = (1-az)*oldFacePosition.z + az*newFacePosition.z;
                oldFacePosition = facePosition;
            } else {
                facePosition = oldFacePosition;
            }

            drawScene(gl, programInfo, buffers, textures, facePosition);
        }
        stats.end();
        requestAnimationFrame(render);
    };

    render();
}
