
const numLayers = 2;
const MAX_LAYERS = 4;

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
      uImageL: [],
      uDisparityMapL: [],
      uImageR: [],
      uDisparityMapR: [],
      uNumLayers: gl.getUniformLocation(shaderProgram, 'uNumLayers'),
      uFacePosition: gl.getUniformLocation(shaderProgram, 'uFacePosition'),
      iRes: gl.getUniformLocation(shaderProgram, 'iRes'),
      oRes: gl.getUniformLocation(shaderProgram, 'oRes'),
      vd: gl.getUniformLocation(shaderProgram, 'vd'),
      IO: gl.getUniformLocation(shaderProgram, 'IO'),
      f: gl.getUniformLocation(shaderProgram, 'f')
    },
  };

  // Populate the uniform location arrays
  for (let i = 0; i < MAX_LAYERS; i++) { // looks like it works with numLayers instead of MAX_LAYERS...
    programInfo.uniformLocations.uImageL.push(gl.getUniformLocation(shaderProgram, `uImageL[${i}]`));
    programInfo.uniformLocations.uDisparityMapL.push(gl.getUniformLocation(shaderProgram, `uDisparityMapL[${i}]`));
    programInfo.uniformLocations.uImageR.push(gl.getUniformLocation(shaderProgram, `uImageR[${i}]`));
    programInfo.uniformLocations.uDisparityMapR.push(gl.getUniformLocation(shaderProgram, `uDisparityMapR[${i}]`));
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

  for (let i = 0; i < numLayers; i++) {
    gl.activeTexture(gl.TEXTURE0 + (4 * i));
    gl.bindTexture(gl.TEXTURE_2D, textures[i].albedoL);
    gl.uniform1i(programInfo.uniformLocations.uImageL[i], 4 * i);

    gl.activeTexture(gl.TEXTURE0 + (4 * i + 1));
    gl.bindTexture(gl.TEXTURE_2D, textures[i].disparityL);
    gl.uniform1i(programInfo.uniformLocations.uDisparityMapL[i], 4 * i + 1);

    gl.activeTexture(gl.TEXTURE0 + (4 * i + 2));
    gl.bindTexture(gl.TEXTURE_2D, textures[i].albedoR);
    gl.uniform1i(programInfo.uniformLocations.uImageR[i], 4 * i + 2);

    gl.activeTexture(gl.TEXTURE0 + (4 * i + 3));
    gl.bindTexture(gl.TEXTURE_2D, textures[i].disparityR);
    gl.uniform1i(programInfo.uniformLocations.uDisparityMapR[i], 4 * i + 3);
  }
  // Pass the actual number of layers to the shader
  gl.uniform1i(gl.getUniformLocation(programInfo.program, 'uNumLayers'), numLayers);

  gl.uniform3f(programInfo.uniformLocations.uFacePosition, facePosition.x, facePosition.y, facePosition.z);

  gl.uniform2f(programInfo.uniformLocations.iRes, textures[0].width, textures[0].height);  // Add this line
  gl.uniform2f(programInfo.uniformLocations.oRes, gl.canvas.width, gl.canvas.height); // Add this line

  gl.uniform1f(programInfo.uniformLocations.vd, isMobileDevice() ? 400 : 600);
  gl.uniform1f(programInfo.uniformLocations.f, 1.0);
  gl.uniform1f(programInfo.uniformLocations.IO, 63.0);

  const vertexCount = 6;
  const type = gl.UNSIGNED_SHORT;
  const offset = 0;
  gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
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
  const container = document.getElementById('canvas-container');

  if (!gl) {
    console.error('Unable to initialize WebGL. Your browser or machine may not support it.');
    return;
  }

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

  const fragmentShaderSource = await loadShaderFile('./rayCastStereoLDI.glsl');

  const textures = [];

  for (let i = 0; i < numLayers; i++) {
    const albedoImageL = await loadImage(`./images/JoeJuiceLDI/ldi0/rgb_${i}.jpg`);
    const disparityImageL = await loadImage(`./images/JoeJuiceLDI/ldi0/disparity_${i}.jpg`);
    const maskImageL = await loadImage(`./images/JoeJuiceLDI/ldi0/mask_${i}.png`);
    const disparity4ImageL = create4ChannelImage(disparityImageL, maskImageL);

    const albedoImageR = await loadImage(`./images/JoeJuiceLDI/ldi1/rgb_${i}.jpg`);
    const disparityImageR = await loadImage(`./images/JoeJuiceLDI/ldi1/disparity_${i}.jpg`);
    const maskImageR = await loadImage(`./images/JoeJuiceLDI/ldi1/mask_${i}.png`);
    const disparity4ImageR = create4ChannelImage(disparityImageR, maskImageR);

    textures.push({
      albedoL: createTexture(gl, albedoImageL),
      disparityL: createTexture(gl, disparity4ImageL),
      albedoR: createTexture(gl, albedoImageR),
      disparityR: createTexture(gl, disparity4ImageR),
      width: albedoImageL.width,
      height: albedoImageL.height
    });
  }
    console.log(textures);
  // Set canvas size to match image aspect ratio
  canvas.width = textures[0].width;
  canvas.height = textures[0].height;

  const { programInfo, buffers } = setupWebGL(gl, fragmentShaderSource);

  async function render() {
    resizeCanvasToContainer(); // Ensure canvas is resized before rendering
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


