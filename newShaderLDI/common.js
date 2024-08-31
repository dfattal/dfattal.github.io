
const restPos = 600; // rest distance for viewing

const vertexShaderSource = `
    attribute vec4 aVertexPosition;
    attribute vec2 aTextureCoord;
    varying highp vec2 UV;

    void main(void) {
      gl_Position = aVertexPosition;
      UV = aTextureCoord;
    }
  `;

async function setupCamera() {
  const video = document.getElementById('video');
  //  const video = document.createElement('video');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      //width: { ideal: 640 },
      facingMode: { ideal: 'user' } // 'user' for front camera, 'environment' for rear camera
    }
  });
  video.srcObject = stream;

  return new Promise((resolve) => {
    video.onloadedmetadata = () => {
      console.log(`Actual video resolution: ${video.videoWidth}x${video.videoHeight}`);
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

function extractFacePosition(predictions, focalLength) {

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
    //const focalLength = isMobileDevice() ? 640*0.8 : 640; // Focal length in pixels (estimated)
    const realInterocularDistance = 63; // Real interocular distance in mm

    const depth = (focalLength * realInterocularDistance) / interocularDistance;

    const faceCenterX = (leftEye.x + rightEye.x) / 2;
    const faceCenterY = (leftEye.y + rightEye.y) / 2;

    // Convert face center to world coordinates
    const x = -(faceCenterX - video.width / 2) * depth / focalLength;
    const y = -(faceCenterY - video.height / 2) * depth / focalLength;
    //console.log([x,y,depth].map(Math.round));
    return { x: x, y: y, z: depth };
  } else {
    //console.log("no face - defaulting to " + [0,0,restPos]);
    return null;
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

async function loadImage2(url) { // without cache busting
  const img = new Image();
  img.crossorigin = "anonymous"; // Set cross-origin attribute
  img.src = url;
  return new Promise((resolve) => {
    img.onload = () => resolve(img);
  });
}

async function downsampleImage(img_url, factor) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // This is necessary if you're loading an image from a different domain

    img.onload = function () {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Set the canvas size to the new downsampled size
      canvas.width = img.width / factor;
      canvas.height = img.height / factor;

      // Draw the image on the canvas at the new size
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Create a new Image object from the downsampled canvas
      const downsampledImg = new Image();
      downsampledImg.src = canvas.toDataURL();

      resolve(downsampledImg);
    };

    img.onerror = function (err) {
      reject(err);
    };

    img.src = img_url;
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
  //console.log(facePosition);
  return facePosition;
}

function create4ChannelImage(dispImage, maskImage) {

  const width = dispImage.width;
  const height = dispImage.height;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  // Pass { willReadFrequently: true } to optimize for frequent read operations
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // Draw the disp image
  ctx.drawImage(dispImage, 0, 0, width, height);
  const dispData = ctx.getImageData(0, 0, width, height).data;

  // Draw the mask image
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(maskImage, 0, 0, width, height);
  const maskData = ctx.getImageData(0, 0, width, height).data;

  // Create a new image data object for the 4-channel image
  const combinedData = ctx.createImageData(width, height);
  for (let i = 0; i < dispData.length / 4; i++) {
    combinedData.data[i * 4] = dispData[i * 4];
    combinedData.data[i * 4 + 1] = dispData[i * 4 + 1];
    combinedData.data[i * 4 + 2] = dispData[i * 4 + 2];
    combinedData.data[i * 4 + 3] = maskData[i * 4]; // Use the red channel of the mask image for the alpha channel
  }

  return combinedData;
}

function combineImgDisp(rgbImage, dispImage, maskImage = null) {

  const width = rgbImage.width;
  const height = rgbImage.height;

  // Create a canvas to handle image data processing
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // Draw the display image
  ctx.drawImage(dispImage, 0, 0, width, height);
  const dispData = ctx.getImageData(0, 0, width, height).data;

  // If maskImage is provided, create a combined 4-channel image
  let combinedData = null;
  if (maskImage) {
    // Draw the mask image
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(maskImage, 0, 0, width, height);
    const maskData = ctx.getImageData(0, 0, width, height).data;

    // Create a new image data object for the combined 4-channel image
    combinedData = ctx.createImageData(width, height);
    for (let i = 0; i < dispData.length / 4; i++) {
      combinedData.data[i * 4] = dispData[i * 4];
      combinedData.data[i * 4 + 1] = dispData[i * 4 + 1];
      combinedData.data[i * 4 + 2] = dispData[i * 4 + 2];
      combinedData.data[i * 4 + 3] = maskData[i * 4]; // Use the red channel of the mask image for the alpha channel
    }
  } else {
    // If no maskImage is provided, use the dispImage data directly with full opacity
    combinedData = ctx.createImageData(width, height);
    for (let i = 0; i < dispData.length / 4; i++) {
      combinedData.data[i * 4] = dispData[i * 4];
      combinedData.data[i * 4 + 1] = dispData[i * 4 + 1];
      combinedData.data[i * 4 + 2] = dispData[i * 4 + 2];
      combinedData.data[i * 4 + 3] = 255; // Set alpha to 1 (255 in 8-bit)
    }
  }

  // Now, create the 4-channel image from the additional image with alpha=1
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(rgbImage, 0, 0, width, height);
  const additionalData = ctx.getImageData(0, 0, width, height).data;

  const extendedWidth = width * 2; // New width to accommodate both images side by side
  const extendedData = ctx.createImageData(extendedWidth, height);

  // Fill the left half with the additional image and alpha=255
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const extendedIndex = (y * extendedWidth + x) * 4;

      extendedData.data[extendedIndex] = additionalData[index];
      extendedData.data[extendedIndex + 1] = additionalData[index + 1];
      extendedData.data[extendedIndex + 2] = additionalData[index + 2];
      extendedData.data[extendedIndex + 3] = 255; // Set alpha to 1 (255 in 8-bit)
    }
  }

  // Fill the right half with the combined data
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const extendedIndex = (y * extendedWidth + (x + width)) * 4;

      extendedData.data[extendedIndex] = combinedData.data[index];
      extendedData.data[extendedIndex + 1] = combinedData.data[index + 1];
      extendedData.data[extendedIndex + 2] = combinedData.data[index + 2];
      extendedData.data[extendedIndex + 3] = combinedData.data[index + 3];
    }
  }
  return extendedData;
}

function displayImageInImgTag(imageData, imgTagId) {
  // Create a canvas to hold the image data
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');

  // Put the image data onto the canvas
  ctx.putImageData(imageData, 0, 0);

  // Convert the canvas to a Blob and set it as the src of the img tag
  canvas.toBlob(function(blob) {
    const url = URL.createObjectURL(blob);
    const imgTag = document.getElementById(imgTagId);
    imgTag.src = url;
  });
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

// focal calculations
function viewportScale(iRes, oRes) {
  return Math.min(oRes.x, oRes.y) / Math.min(iRes.x, iRes.y);
}