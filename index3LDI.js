
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

  if (!gl) {
    console.error('Unable to initialize WebGL. Your browser or machine may not support it.');
    return;
  }

  //const fragmentShaderSource = await loadShaderFile('./fragmentShader.glsl');
  const fragmentShaderSource = await loadShaderFile('./rayCastMono.glsl');
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


