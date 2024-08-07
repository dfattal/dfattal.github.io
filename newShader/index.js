
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
      //views info
      uImage: gl.getUniformLocation(shaderProgram, 'uImage'),
      uDisparityMap: gl.getUniformLocation(shaderProgram, 'uDisparityMap'),
      invZmin: gl.getUniformLocation(shaderProgram, 'invZmin'),
      invZmax: gl.getUniformLocation(shaderProgram, 'invZmax'),
      uCameraPosition: gl.getUniformLocation(shaderProgram, 'uCameraPosition'),
      sk1: gl.getUniformLocation(shaderProgram, 'sk1'),
      sl1: gl.getUniformLocation(shaderProgram, 'sl1'),
      roll1: gl.getUniformLocation(shaderProgram, 'roll1'),
      f1: gl.getUniformLocation(shaderProgram, 'f1'),
      iRes: gl.getUniformLocation(shaderProgram, 'iRes'),
      // rendering info
      uFacePosition: gl.getUniformLocation(shaderProgram, 'uFacePosition'),
      sk2: gl.getUniformLocation(shaderProgram, 'sk2'),
      sk2: gl.getUniformLocation(shaderProgram, 'sl2'),
      roll2: gl.getUniformLocation(shaderProgram, 'roll2'),
      f2: gl.getUniformLocation(shaderProgram, 'f2'),
      oRes: gl.getUniformLocation(shaderProgram, 'oRes')
      //vd: gl.getUniformLocation(shaderProgram, 'vd'),
      //IO: gl.getUniformLocation(shaderProgram, 'IO'),
      //f: gl.getUniformLocation(shaderProgram, 'f')
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

function drawScene(gl, programInfo, buffers, views, renderCam) {
// TODO : takes in views/layers and renderCam info
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
  gl.bindTexture(gl.TEXTURE_2D, views[0].layers[0].albedo);
  gl.uniform1i(programInfo.uniformLocations.uImage, 0);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, views[0].layers[0].disparity);
  gl.uniform1i(programInfo.uniformLocations.uDisparityMap, 1);

  // views info
  gl.uniform3f(programInfo.uniformLocations.uCameraPosition, views[0].camPos.x, views[0].camPos.y, views[0].camPos.z);
  gl.uniform2f(programInfo.uniformLocations.sk1, views[0].sk.x,views[0].sk.y);
  gl.uniform2f(programInfo.uniformLocations.sl1, views[0].sl.x,views[0].sl.y);
  gl.uniform1f(programInfo.uniformLocations.roll1, views[0].roll);
  gl.uniform1f(programInfo.uniformLocations.f1, views[0].f); // in px
  gl.uniform1f(programInfo.uniformLocations.invZmin, views[0].layers[0].invZmin);
  gl.uniform1f(programInfo.uniformLocations.invZmax, views[0].layers[0].invZmax);
  gl.uniform2f(programInfo.uniformLocations.iRes, views[0].layers[0].width, views[0].layers[0].height);

  // rendering info
  gl.uniform3f(programInfo.uniformLocations.uFacePosition, renderCam.pos.x,renderCam.pos.y,renderCam.pos.z); // normalized to camera space
  gl.uniform2f(programInfo.uniformLocations.oRes, gl.canvas.width, gl.canvas.height);      // Add this line
  gl.uniform2f(programInfo.uniformLocations.sk2, renderCam.sk.x, renderCam.sk.y);
  gl.uniform2f(programInfo.uniformLocations.sl2, renderCam.sl.x, renderCam.sl.y);
  gl.uniform1f(programInfo.uniformLocations.roll2, renderCam.roll);
  gl.uniform1f(programInfo.uniformLocations.f2, renderCam.f); // in px
  //gl.uniform1f(programInfo.uniformLocations.vd, isMobileDevice() ? 0.7*restPos : restPos);
  //gl.uniform1f(programInfo.uniformLocations.f, 1.0);
  //gl.uniform1f(programInfo.uniformLocations.IO, 63.0);

  const vertexCount = 6;
  const type = gl.UNSIGNED_SHORT;
  const offset = 0;
  gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
}

async function main() {

  iOSmsg = document.getElementById("iOSmsg");
  function startVideo() {
    iOSmsg.remove();
    video.play();
  }
  const video = await setupCamera();
  let focalLength = Math.max(video.videoWidth,video.videoHeight);
  focalLength *= isMobileDevice() ? 0.8 : 1.0; // modify focal if mobile, likely wider angle
  console.log("using focal " + focalLength);

  if (isIOS()) {
    console.log("iOS Device Detected");
    iOSmsg.textContent = "iOS Device Detected. Click to start video.";
    document.addEventListener('click', startVideo, { once: true });
  } else {
    startVideo();
  }

  let facePosition = {x: 0, y: 0, z: 600};
  let oldFacePosition = {x: 0, y: 0, z: 600};
  function normFacePosition(pos) {
    const IO = 63;
    const OVD = restPos; // defined in common.js
    return {x: pos.x/IO, y: -pos.y/IO, z: (OVD-pos.z)/IO}
  }
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

  //const fragmentShaderSource = await loadShaderFile('./fragmentShader.glsl');
  const fragmentShaderSource = await loadShaderFile('./rayCastMono.glsl');
  const albedoImage = await loadImage('../images/albedo.jpg');
  const disparityImage = await loadImage('../images/disparity.png');

  // Set canvas size to match image aspect ratio
  //canvas.width = albedoImage.width;
  //canvas.height = albedoImage.height;

  const views = [{ // you get this info from decoding LIF
    camPos: {x: 0, y: 0, z: 0},
    sl: {x: 0, y:0},
    sk: {x:0, y:0},
    roll: 0,
    f: 1.0*albedoImage.width, // in px
    width: albedoImage.width, // original view width, pre outpainting
    height: albedoImage.height, //original view height, pre outpainting
    layers: [{
        albedo: createTexture(gl, albedoImage),
        disparity: createTexture(gl, disparityImage),
        width: albedoImage.width, // iRes.x for the layer, includes outpainting
        height: albedoImage.height, // // iRes.y for the layer, includes outpainting
        invZmin: 0.1,
        invZmax: 0.0
    }]
  }]
  console.log(views);

  const renderCam = {
    pos: {x: 0, y: 0, z: 0}, // default
    sl: {x: 0, y:0},
    sk: {x:0, y:0},
    roll: 0,
    f: views[0].f*viewportScale({x:albedoImage.width, y:albedoImage.height},{x: gl.canvas.width, y: gl.canvas.height})
  }
  console.log(renderCam);

  const invd = 0.8*views[0].layers[0].invZmin; // set focus point

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

    // update renderCam
    renderCam.pos = normFacePosition(facePosition); // normalize to camera space
    renderCam.sk.x = -renderCam.pos.x*invd/(1-renderCam.pos.z*invd); // sk2 = -C2.xy*invd/(1.0-C2.z*invd)
    renderCam.sk.y = -renderCam.pos.y*invd/(1-renderCam.pos.z*invd); // sk2 = -C2.xy*invd/(1.0-C2.z*invd)
    const vs = viewportScale({x:views[0].width, y:views[0].height},{x: gl.canvas.width, y: gl.canvas.height});
    renderCam.f = views[0].f*vs*Math.max(1-renderCam.pos.z*invd,1); // f2 = f1/adjustAr(iRes,oRes)*max(1.0-C2.z*invd,1.0);

    drawScene(gl, programInfo, buffers, views, renderCam);
    stats.end();
    requestAnimationFrame(render);
    //console.log(renderCam.pos);
  }

  render();
}

main();

