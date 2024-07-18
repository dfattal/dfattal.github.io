
async function setupCamera() {
  const video = document.getElementById('video');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true
  });
  video.srcObject = stream;

  return new Promise((resolve) => {
    video.onloadedmetadata = () => {
      resolve(video);
    };
  });
}

function calculateAverageKeypoint(filteredKeypoints) {
      if (filteredKeypoints.length === 0) {
        return { x: 0, y: 0, z: 0 }; // or handle the empty case as needed
      }
      const sum = filteredKeypoints.reduce((acc, keypoint) => {
        return {
          x: acc.x + keypoint.x,
          y: acc.y + keypoint.y,
          z: acc.z + keypoint.z
        };
      }, { x: 0, y: 0, z: 0 });

      return {
        x: sum.x / filteredKeypoints.length,
        y: sum.y / filteredKeypoints.length,
        z: sum.z / filteredKeypoints.length
      };
    }

function extractFacePosition(predictions) {
    if (predictions.length > 0) {
      const keypoints = predictions[0].keypoints;

      // Calculate the center of the face
      const leftEyePts = keypoints.filter(keypoint => keypoint.name && keypoint.name === "leftEye");
      const rightEyePts = keypoints.filter(keypoint => keypoint.name && keypoint.name === "rightEye");
      const leftEye = calculateAverageKeypoint(leftEyePts);
      const rightEye = calculateAverageKeypoint(rightEyePts);

      // Calculate distances (Assuming average interocular distance is 63mm)
      const interocularDistance = Math.sqrt(
        Math.pow(rightEye.x - leftEye.x, 2) +
        Math.pow(rightEye.y - leftEye.y, 2) +
        Math.pow(rightEye.z - leftEye.z, 2)
      );
      const focalLength = 640*1.0; // Focal length in pixels (estimated)
      const realInterocularDistance = 63; // Real interocular distance in mm

      const depth = (focalLength * realInterocularDistance) / interocularDistance;

      const faceCenterX = (leftEye.x + rightEye.x) / 2;
      const faceCenterY = (leftEye.y + rightEye.y) / 2;

      // Convert face center to world coordinates
      const x = -(faceCenterX - video.width / 2) * depth / focalLength;
      const y = -(faceCenterY - video.height / 2) * depth / focalLength;
      return {x:x, y:y, z:depth};
    } else {
      return {x:0, y:0, z:600};
    }
}

// Function to load a shader from a file
async function loadShaderFile(url) {
  const response = await fetch(url + '?t=' + new Date().getTime()); // Append cache-busting query parameter);
  return response.text();
}

async function loadImage(url) {
  const img = new Image();
  //img.src = url;
  img.src = url + '?t=' + new Date().getTime(); // Append cache-busting query parameter
  return new Promise((resolve) => {
    img.onload = () => resolve(img);
  });
}

function setupWebGL(gl, fragmentShaderSource) {
  const vsSource = `
    attribute vec4 aVertexPosition;
    attribute vec2 aTextureCoord;
    varying highp vec2 vTextureCoord;

    void main(void) {
      gl_Position = aVertexPosition;
      vTextureCoord = aTextureCoord;
    }
  `;

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

function initShaderProgram(gl, vsSource, fsSource) {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

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

function loadShader(gl, type, source) {
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

function createTexture(gl, image) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  return texture;
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

  const vertexCount = 6;
  const type = gl.UNSIGNED_SHORT;
  const offset = 0;
  gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
}

async function getFacePosition() {
  const facePosition = await estimatePose();
  console.log(facePosition);
  return facePosition;
}

async function main() {

  const video = await setupCamera();
  video.play();

  let facePosition = {x: 0, y: 0, z: 600};
  let oldFacePosition = {x: 0, y: 0, z: 600};
  const axy = 0.5; // exponential smoothing
  const az = 0.1; // exponential smoothing

  const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
  const detectorConfig = {
    runtime: 'tfjs',
  };
  const detector = await faceLandmarksDetection.createDetector(model, detectorConfig);
  const canvas = document.getElementById('glCanvas');
  const gl = canvas.getContext('webgl');

  if (!gl) {
    console.error('Unable to initialize WebGL. Your browser or machine may not support it.');
    return;
  }

  //const fragmentShaderSource = await loadShaderFile('./fragmentShader.glsl');
  const fragmentShaderSource = await loadShaderFile('./rayCast.glsl');
  const albedoImage = await loadImage('./images/albedo.jpg');
  const disparityImage = await loadImage('./images/disparity.png');

  // Set canvas size to match image aspect ratio
  canvas.width = albedoImage.width;
  canvas.height = albedoImage.height;

  const textures = {
    albedo: createTexture(gl, albedoImage),
    disparity: createTexture(gl, disparityImage),
    width: albedoImage.width,
    height: albedoImage.height
  };

  const { programInfo, buffers } = setupWebGL(gl, fragmentShaderSource);

  async function render() {
    const estimationConfig = {flipHorizontal: false};
    const predictions = await detector.estimateFaces(video, estimationConfig);
    const newFacePosition = extractFacePosition(predictions);
    facePosition.x = (1-axy)*oldFacePosition.x + axy*newFacePosition.x;
    facePosition.y = (1-axy)*oldFacePosition.y + axy*newFacePosition.y;
    facePosition.z = (1-az)*oldFacePosition.z + az*newFacePosition.z;
    oldFacePosition = facePosition;

    drawScene(gl, programInfo, buffers, textures, facePosition);
    requestAnimationFrame(render);
    console.log(facePosition);
  }

  render();
}

main();


