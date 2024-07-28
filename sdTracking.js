// sdTracking.js

// Hugging Face API endpoints and headers
const BASE_API_URL = "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0";
const REFINER_API_URL = "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-refiner-1.0";
const AWS_LAMBDA_URL = 'https://sk5ppdkibbohlyjwygbjqoi2ru0dvwje.lambda-url.us-east-1.on.aws';

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
      uImage: gl.getUniformLocation(shaderProgram, 'uImage'),
      uDisparityMap: gl.getUniformLocation(shaderProgram, 'uDisparityMap'),
      uFacePosition: gl.getUniformLocation(shaderProgram, 'uFacePosition'),
      iRes: gl.getUniformLocation(shaderProgram, 'iRes'),
      oRes: gl.getUniformLocation(shaderProgram, 'oRes'),
      vd: gl.getUniformLocation(shaderProgram, 'vd'),
      IO: gl.getUniformLocation(shaderProgram, 'IO'),
      f: gl.getUniformLocation(shaderProgram, 'f')
    },
  };

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

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, textures.albedo);
  gl.uniform1i(programInfo.uniformLocations.uImage, 0);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, textures.disparity);
  gl.uniform1i(programInfo.uniformLocations.uDisparityMap, 1);
  gl.uniform3f(programInfo.uniformLocations.uFacePosition, facePosition.x, facePosition.y, facePosition.z);
  //gl.uniform2f(programInfo.uniformLocations.iRes, albedoImage.width, albedoImage.height);  // Add this line
  gl.uniform2f(programInfo.uniformLocations.iRes, textures.width, textures.height);  // Add this line
  gl.uniform2f(programInfo.uniformLocations.oRes, gl.canvas.width, gl.canvas.height);      // Add this line
  gl.uniform1f(programInfo.uniformLocations.vd, isMobileDevice() ? 0.7*restPos : restPos);
  gl.uniform1f(programInfo.uniformLocations.f, 1.0);
  gl.uniform1f(programInfo.uniformLocations.IO, 63.0);

  const vertexCount = 6;
  const type = gl.UNSIGNED_SHORT;
  const offset = 0;
  gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
}

async function generateImageAndDepthMap() {
    const prompt = document.getElementById('prompt').value;
    const negPrompt = document.getElementById('negPrompt').value;
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
            body: JSON.stringify({ inputs: prompt, negative_prompt: negPrompt })
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

        await generateDepthMap(imageURL);
    } catch (error) {
        logContainer.textContent += `\nError: ${error.message}\n${error.stack}`;
    }
}

async function getAccessToken() {
    const response = await axios.post(AWS_LAMBDA_URL, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Access-Control-Allow-Origin': '*'
        },
    });
    return response.data.access_token;
}

async function getStorageUrl(accessToken, fileName) {
    const response = await fetch('https://api.immersity.ai/api/v1/get-upload-url?fileName=' + fileName + '&mediaType=image%2Fjpeg', {
        method: 'GET',
        headers: {
            authorization: `Bearer ${accessToken}`,
            accept: 'application/json'
        },
    });
    const data = await response.json();
    return data.url;
}

async function uploadToStorage(url, file) {
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
}

async function generateDisparityMap(accessToken, storageUrl) {
    const response = await fetch('https://api.immersity.ai/api/v1/disparity', {
        method: 'POST',
        headers: {
            accept: 'application/json',
            authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            inputImageUrl: storageUrl,
            outputBitDepth: 'uint16'
        })
    });
    const data = await response.json();
    return data.resultPresignedUrl;
}

function displayDisparityMap(url) {
    document.getElementById('disp-map-container').innerHTML = `<img id="generatedDispMap" src="${url}" alt="Generated Disp Map">`;
}

async function generateDepthMap(imageURL) {
    const logContainer = document.getElementById('log');
    logContainer.textContent += '\nGenerating depth map...';

    try {
        const accessToken = await getAccessToken();
        const storageUrl = await getStorageUrl(accessToken, 'generated_image.jpg');
        await uploadToStorage(storageUrl, await (await fetch(imageURL)).blob());

        const disparityMapUrl = await generateDisparityMap(accessToken, storageUrl);

        const localDisparityMapUrl = await convertToLocalURL(disparityMapUrl);

        displayDisparityMap(localDisparityMapUrl);

        logContainer.textContent += '\nDepth map generated successfully.';
        startInteractiveExperience(imageURL, localDisparityMapUrl);
    } catch (error) {
        logContainer.textContent += `\nError generating depth map: ${error.message}\n${error.stack}`;
    }
}

async function convertToLocalURL(disparityMapUrl) {
    const response = await fetch(disparityMapUrl, { mode: 'cors' });
    const blob = await response.blob();
    return URL.createObjectURL(blob);
}

function startInteractiveExperience(imageURL, disparityMapUrl) {
    try{
        main(imageURL, disparityMapUrl);
    } catch (e) {
        console.log(e.message);
    }
}

async function main(imageURL, disparityMapUrl) {
    const video = await setupCamera();
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

    const fragmentShaderSource = await loadShaderFile('./rayCastMono.glsl');
    const albedoImage = await loadImage2(imageURL);
    const disparityImage = await loadImage2(disparityMapUrl);
    console.log(albedoImage);
    console.log(disparityImage);

    const textures = {
        albedo: createTexture(gl, albedoImage),
        disparity: createTexture(gl, disparityImage),
        width: albedoImage.width,
        height: albedoImage.height
    };

    const { programInfo, buffers } = setupWebGL(gl, fragmentShaderSource);

    const render = async () => {
        stats.begin();
        resizeCanvasToContainer();
        const predictions = await detector.estimateFaces(video, { flipHorizontal: false });
        const newFacePosition = extractFacePosition(predictions, focalLength);

        facePosition.x = (1 - axy) * oldFacePosition.x + axy * newFacePosition.x;
        facePosition.y = (1 - axy) * oldFacePosition.y + axy * newFacePosition.y;
        facePosition.z = (1 - az) * oldFacePosition.z + az * newFacePosition.z;
        oldFacePosition = facePosition;

        drawScene(gl, programInfo, buffers, textures, facePosition);
        stats.end();
        requestAnimationFrame(render);
    };

    render();
}
