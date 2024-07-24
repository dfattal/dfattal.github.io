
const restPos = 700; // rest distance for viewing

const vertexShaderSource = `
    attribute vec4 aVertexPosition;
    attribute vec2 aTextureCoord;
    varying highp vec2 vTextureCoord;

    void main(void) {
      gl_Position = aVertexPosition;
      vTextureCoord = aTextureCoord;
    }
  `;

async function setupCamera() {
  const video = document.getElementById('video');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
        width: { ideal: 640 },
        facingMode: 'user' // 'user' for front camera, 'environment' for rear camera
      }
  });
  video.srcObject = stream;
  const track = stream.getVideoTracks()[0];
  const settings = track.getSettings();
  console.log([settings.width,settings.height]);

  return new Promise((resolve) => {
    video.onloadedmetadata = () => {
      resolve(video);
    };
  });
}

// Function to check if the device is Mobile to adjust vd
function isMobileDevice() {
  var userAgent = navigator.userAgent || navigator.vendor || window.opera;

  // Check for the presence of common mobile device identifiers
  if (/android|linux|galaxy|pixel/i.test(userAgent)) {
    return true;
  }

  if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
    return true;
  }

  // Additional checks for other mobile devices
  if (/mobile/i.test(userAgent)) {
    return true;
  }

  return false;
}

// Function to check if the device is iOS
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
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
      const focalLength = isMobileDevice() ? 640*0.5 : 640; // Focal length in pixels (estimated)
      const realInterocularDistance = 63; // Real interocular distance in mm

      const depth = (focalLength * realInterocularDistance) / interocularDistance;

      const faceCenterX = (leftEye.x + rightEye.x) / 2;
      const faceCenterY = (leftEye.y + rightEye.y) / 2;

      // Convert face center to world coordinates
      const x = -(faceCenterX - video.width / 2) * depth / focalLength;
      const y = -(faceCenterY - video.height / 2) * depth / focalLength;
      return {x:x, y:y, z:depth};
    } else {
      return {x:0, y:0, z:restPos};
    }
}

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

async function getFacePosition() {
  const facePosition = await estimatePose();
  console.log(facePosition);
  return facePosition;
}

function create4ChannelImage(rgbImage, maskImage) {
  const width = rgbImage.width;
  const height = rgbImage.height;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');

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

// Log all uniforms
function logAllUniforms(gl, program) {
  const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  const uniforms = {};

  for (let i = 0; i < numUniforms; ++i) {
    const info = gl.getActiveUniform(program, i);
    const location = gl.getUniformLocation(program, info.name);
    const value = gl.getUniform(program, location);
    uniforms[info.name] = value;
  }

  console.log('Uniforms:', uniforms);
}