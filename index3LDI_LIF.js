
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

async function main() {

  const video = await setupCamera();
  const textures = [];

  const canvas = document.getElementById('glCanvas');
  const gl = canvas.getContext('webgl');
  const container = document.getElementById('canvas-container');

  if (!gl) {
    console.error('Unable to initialize WebGL. Your browser or machine may not support it.');
    return;
  }

  async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        currentImgData = await parseLif5(file);
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
        document.getElementById("filePicker").remove();
        video.play();
        document.body.appendChild(stats.dom);
    }
  }
  document.getElementById('filePicker').addEventListener('change', handleFileSelect);

  let focalLength = Math.max(video.videoWidth,video.videoHeight);
  focalLength *= isMobileDevice() ? 0.8 : 1.0; // modify focal if mobile, likely wider angle
  console.log("using focal " + focalLength);

  let facePosition = {x: 0, y: 0, z: restPos};
  let oldFacePosition = {x: 0, y: 0, z: restPos};
  const axy = 0.5; // exponential smoothing
  const az = 0.1; // exponential smoothing

  const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
  const detectorConfig = {
    runtime: 'tfjs',
  };
  const detector = await faceLandmarksDetection.createDetector(model, detectorConfig);

  function resizeCanvasToContainer() {
      const displayWidth = container.clientWidth;
      const displayHeight = container.clientHeight;

      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;

        // Update the WebGL viewport
        gl.viewport(0, 0, canvas.width, canvas.height);
      }
    }

  // Event listener for window resize
  window.addEventListener('resize', resizeCanvasToContainer);
  resizeCanvasToContainer(); // Initial resize to set the correct canvas size

  //const fragmentShaderSource = await loadShaderFile('./fragmentShader.glsl');
  const fragmentShaderSource = await loadShaderFile('./rayCastMonoLDI.glsl');



  const { programInfo, buffers } = setupWebGL(gl, fragmentShaderSource);

  async function render() {
    stats.begin();
    resizeCanvasToContainer(); // Ensure canvas is resized before rendering
    const estimationConfig = {flipHorizontal: false};
    const predictions = await detector.estimateFaces(video, estimationConfig);
    const newFacePosition = extractFacePosition(predictions,focalLength);
    facePosition.x = (1-axy)*oldFacePosition.x + axy*newFacePosition.x;
    facePosition.y = (1-axy)*oldFacePosition.y + axy*newFacePosition.y;
    facePosition.z = (1-az)*oldFacePosition.z + az*newFacePosition.z;
    oldFacePosition = facePosition;
    //console.log([gl.canvas.width,gl.canvas.height]);
    drawScene(gl, programInfo, buffers, textures, facePosition);
    stats.end();
    requestAnimationFrame(render);
    //console.log(facePosition);
  }

  render();
}

main();


