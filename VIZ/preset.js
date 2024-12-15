
const MAX_LAYERS = 4;
let fname;

function toggleControls() {
  const motionType = document.querySelector('input[name="motionType"]:checked').value;
  document.querySelector('.harmonic-controls').style.display = motionType === 'harmonic' ? 'block' : 'none';
  document.querySelector('.arc-controls').style.display = motionType === 'arc' ? 'block' : 'none';
}

function updateSliderValue(sliderId, valueId) {
  const slider = document.getElementById(sliderId);
  const valueDisplay = document.getElementById(valueId);
  slider.addEventListener('input', () => {
    valueDisplay.textContent = slider.value;
  });
}

document.querySelectorAll('input[name="motionType"]').forEach(radio => {
  radio.addEventListener('change', toggleControls);
});

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
      uImage: [],
      uDisparityMap: [],
      uNumLayers: gl.getUniformLocation(shaderProgram, 'uNumLayers'),
      invZmin: gl.getUniformLocation(shaderProgram, 'invZmin'), // float array
      invZmax: gl.getUniformLocation(shaderProgram, 'invZmax'), // float array
      uViewPosition: gl.getUniformLocation(shaderProgram, 'uViewPosition'),
      sk1: gl.getUniformLocation(shaderProgram, 'sk1'),
      sl1: gl.getUniformLocation(shaderProgram, 'sl1'),
      roll1: gl.getUniformLocation(shaderProgram, 'roll1'),
      f1: gl.getUniformLocation(shaderProgram, 'f1'),
      iRes: gl.getUniformLocation(shaderProgram, 'iRes'), // vec2 array
      iResOriginal: gl.getUniformLocation(shaderProgram, 'iResOriginal'),

      // rendering info
      uFacePosition: gl.getUniformLocation(shaderProgram, 'uFacePosition'),
      sk2: gl.getUniformLocation(shaderProgram, 'sk2'),
      sl2: gl.getUniformLocation(shaderProgram, 'sl2'),
      roll2: gl.getUniformLocation(shaderProgram, 'roll2'),
      f2: gl.getUniformLocation(shaderProgram, 'f2'),
      oRes: gl.getUniformLocation(shaderProgram, 'oRes')
      //vd: gl.getUniformLocation(shaderProgram, 'vd'),
      //IO: gl.getUniformLocation(shaderProgram, 'IO'),
      //f: gl.getUniformLocation(shaderProgram, 'f')
    },
  };

  // Populate the uniform location arrays
  for (let i = 0; i < MAX_LAYERS; i++) { // looks like it works with numLayers instead of MAX_LAYERS...
    programInfo.uniformLocations.uImage.push(gl.getUniformLocation(shaderProgram, `uImage[${i}]`));
    programInfo.uniformLocations.uDisparityMap.push(gl.getUniformLocation(shaderProgram, `uDisparityMap[${i}]`));
  }

  // Vertex positions and texture coordinates
  const positions = new Float32Array([
    -1.0, 1.0,
    1.0, 1.0,
    -1.0, -1.0,
    1.0, -1.0,
  ]);
  const textureCoords = new Float32Array([
    0.0, 0.0,
    1.0, 0.0,
    0.0, 1.0,
    1.0, 1.0,
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

function setupWebGLST(gl, fragmentShaderSource) {

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

      //view L info
      uImageL: [],
      uDisparityMapL: [],
      uNumLayersL: gl.getUniformLocation(shaderProgram, 'uNumLayersL'),
      invZminL: gl.getUniformLocation(shaderProgram, 'invZminL'), // float array
      invZmaxL: gl.getUniformLocation(shaderProgram, 'invZmaxL'), // float array
      uViewPositionL: gl.getUniformLocation(shaderProgram, 'uViewPositionL'),
      sk1L: gl.getUniformLocation(shaderProgram, 'sk1L'),
      sl1L: gl.getUniformLocation(shaderProgram, 'sl1L'),
      roll1L: gl.getUniformLocation(shaderProgram, 'roll1L'),
      f1L: gl.getUniformLocation(shaderProgram, 'f1L'),
      iResL: gl.getUniformLocation(shaderProgram, 'iResL'), // vec2 array

      //view R info
      uImageR: [],
      uDisparityMapR: [],
      uNumRayersR: gl.getUniformLocation(shaderProgram, 'uNumLayersR'),
      invZminR: gl.getUniformLocation(shaderProgram, 'invZminR'), // float array
      invZmaxR: gl.getUniformLocation(shaderProgram, 'invZmaxR'), // float array
      uViewPositionR: gl.getUniformLocation(shaderProgram, 'uViewPositionR'),
      sk1R: gl.getUniformLocation(shaderProgram, 'sk1R'),
      sl1R: gl.getUniformLocation(shaderProgram, 'sl1R'),
      roll1R: gl.getUniformLocation(shaderProgram, 'roll1R'),
      f1R: gl.getUniformLocation(shaderProgram, 'f1R'),
      iResR: gl.getUniformLocation(shaderProgram, 'iResR'), // vec2 array

      // rendering info
      iResOriginal: gl.getUniformLocation(shaderProgram, 'iResOriginal'),
      uFacePosition: gl.getUniformLocation(shaderProgram, 'uFacePosition'),
      sk2: gl.getUniformLocation(shaderProgram, 'sk2'),
      sl2: gl.getUniformLocation(shaderProgram, 'sl2'),
      roll2: gl.getUniformLocation(shaderProgram, 'roll2'),
      f2: gl.getUniformLocation(shaderProgram, 'f2'),
      oRes: gl.getUniformLocation(shaderProgram, 'oRes')
      //vd: gl.getUniformLocation(shaderProgram, 'vd'),
      //IO: gl.getUniformLocation(shaderProgram, 'IO'),
      //f: gl.getUniformLocation(shaderProgram, 'f')
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
    -1.0, 1.0,
    1.0, 1.0,
    -1.0, -1.0,
    1.0, -1.0,
  ]);
  const textureCoords = new Float32Array([
    0.0, 0.0,
    1.0, 0.0,
    0.0, 1.0,
    1.0, 1.0,
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

  const numLayers = views[0].layers.length;
  // Loop through each layer and bind textures
  for (let i = 0; i < numLayers; i++) {
    gl.activeTexture(gl.TEXTURE0 + (2 * i));
    gl.bindTexture(gl.TEXTURE_2D, views[0].layers[i].image.texture);
    gl.uniform1i(programInfo.uniformLocations.uImage[i], 2 * i);

    gl.activeTexture(gl.TEXTURE0 + (2 * i + 1));
    gl.bindTexture(gl.TEXTURE_2D, views[0].layers[i].invZ.texture);
    gl.uniform1i(programInfo.uniformLocations.uDisparityMap[i], 2 * i + 1);
  }
  // Pass the actual number of layers to the shader
  gl.uniform1i(gl.getUniformLocation(programInfo.program, 'uNumLayers'), numLayers);

  // views info
  gl.uniform3f(programInfo.uniformLocations.uViewPosition, views[0].position.x, views[0].position.y, views[0].position.z);
  gl.uniform2f(programInfo.uniformLocations.sk1, views[0].sk.x, views[0].sk.y);
  gl.uniform2f(programInfo.uniformLocations.sl1, views[0].rotation.sl.x, views[0].rotation.sl.y);
  gl.uniform1f(programInfo.uniformLocations.roll1, views[0].rotation.roll_degrees);
  gl.uniform1fv(programInfo.uniformLocations.f1, views[0].layers.map(layer => layer.f)); // in px
  gl.uniform1fv(programInfo.uniformLocations.invZmin, views[0].layers.map(layer => layer.invZ.min));
  gl.uniform1fv(programInfo.uniformLocations.invZmax, views[0].layers.map(layer => layer.invZ.max));
  gl.uniform2fv(programInfo.uniformLocations.iRes, views[0].layers.map(layer => [layer.width, layer.height]).flat());

  // rendering info
  gl.uniform2f(programInfo.uniformLocations.iResOriginal, views[0].width, views[0].height); // for window effect only
  gl.uniform3f(programInfo.uniformLocations.uFacePosition, renderCam.pos.x, renderCam.pos.y, renderCam.pos.z); // normalized to camera space
  gl.uniform2f(programInfo.uniformLocations.oRes, gl.canvas.width, gl.canvas.height);
  gl.uniform2f(programInfo.uniformLocations.sk2, renderCam.sk.x, renderCam.sk.y);
  gl.uniform2f(programInfo.uniformLocations.sl2, renderCam.sl.x, renderCam.sl.y);
  gl.uniform1f(programInfo.uniformLocations.roll2, renderCam.roll);
  gl.uniform1f(programInfo.uniformLocations.f2, renderCam.f); // in px

  const vertexCount = 6;
  const type = gl.UNSIGNED_SHORT;
  const offset = 0;
  //logAllUniforms(gl, programInfo.program);
  gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
}

function drawSceneST(gl, programInfo, buffers, views, renderCam) {

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

  // view L info
  const numLayersL = views[0].layers.length;

  // Loop through each layer and bind textures
  for (let i = 0; i < numLayersL; i++) {
    gl.activeTexture(gl.TEXTURE0 + (4 * i));
    gl.bindTexture(gl.TEXTURE_2D, views[0].layers[i].image.texture);
    gl.uniform1i(programInfo.uniformLocations.uImageL[i], 4 * i);

    gl.activeTexture(gl.TEXTURE0 + (4 * i + 1));
    gl.bindTexture(gl.TEXTURE_2D, views[0].layers[i].invZ.texture);
    gl.uniform1i(programInfo.uniformLocations.uDisparityMapL[i], 4 * i + 1);
  }
  // Pass the actual number of layers to the shader
  gl.uniform1i(programInfo.uniformLocations.uNumLayersL, numLayersL);

  gl.uniform3f(programInfo.uniformLocations.uViewPositionL, views[0].position.x, views[0].position.y, views[0].position.z);
  gl.uniform2f(programInfo.uniformLocations.sk1L, views[0].sk.x, views[0].sk.y);
  gl.uniform2f(programInfo.uniformLocations.sl1L, views[0].rotation.sl.x, views[0].rotation.sl.y);
  gl.uniform1f(programInfo.uniformLocations.roll1L, views[0].rotation.roll_degrees);
  gl.uniform1fv(programInfo.uniformLocations.f1L, views[0].layers.map(layer => layer.f)); // in px
  gl.uniform1fv(programInfo.uniformLocations.invZminL, views[0].layers.map(layer => layer.invZ.min));
  gl.uniform1fv(programInfo.uniformLocations.invZmaxL, views[0].layers.map(layer => layer.invZ.max));
  gl.uniform2fv(programInfo.uniformLocations.iResL, views[0].layers.map(layer => [layer.width, layer.height]).flat());

  // view R info
  const numLayersR = views[1].layers.length;

  // Loop through each layer and bind textures
  for (let i = 0; i < numLayersR; i++) {
    gl.activeTexture(gl.TEXTURE0 + (4 * i + 2));
    gl.bindTexture(gl.TEXTURE_2D, views[1].layers[i].image.texture);
    gl.uniform1i(programInfo.uniformLocations.uImageR[i], 4 * i + 2);

    gl.activeTexture(gl.TEXTURE0 + (4 * i + 3));
    gl.bindTexture(gl.TEXTURE_2D, views[1].layers[i].invZ.texture);
    gl.uniform1i(programInfo.uniformLocations.uDisparityMapR[i], 4 * i + 3);
  }
  // Pass the actual number of layers to the shader
  gl.uniform1i(programInfo.uniformLocations.uNumLayersr, numLayersR);

  gl.uniform3f(programInfo.uniformLocations.uViewPositionR, views[1].position.x, views[1].position.y, views[1].position.z);
  gl.uniform2f(programInfo.uniformLocations.sk1R, views[1].sk.x, views[1].sk.y);
  gl.uniform2f(programInfo.uniformLocations.sl1R, views[1].rotation.sl.x, views[1].rotation.sl.y);
  gl.uniform1f(programInfo.uniformLocations.roll1R, views[1].rotation.roll_degrees);
  gl.uniform1fv(programInfo.uniformLocations.f1R, views[1].layers.map(layer => layer.f)); // in px
  gl.uniform1fv(programInfo.uniformLocations.invZminR, views[1].layers.map(layer => layer.invZ.min));
  gl.uniform1fv(programInfo.uniformLocations.invZmaxR, views[1].layers.map(layer => layer.invZ.max));
  gl.uniform2fv(programInfo.uniformLocations.iResR, views[1].layers.map(layer => [layer.width, layer.height]).flat());

  // rendering info
  gl.uniform2f(programInfo.uniformLocations.iResOriginal, views[0].width, views[0].height); // for window effect only
  gl.uniform3f(programInfo.uniformLocations.uFacePosition, renderCam.pos.x, renderCam.pos.y, renderCam.pos.z); // normalized to camera space
  gl.uniform2f(programInfo.uniformLocations.oRes, gl.canvas.width, gl.canvas.height);
  gl.uniform2f(programInfo.uniformLocations.sk2, renderCam.sk.x, renderCam.sk.y);
  gl.uniform2f(programInfo.uniformLocations.sl2, renderCam.sl.x, renderCam.sl.y);
  gl.uniform1f(programInfo.uniformLocations.roll2, renderCam.roll);
  gl.uniform1f(programInfo.uniformLocations.f2, renderCam.f); // in px

  const vertexCount = 6;
  const type = gl.UNSIGNED_SHORT;
  const offset = 0;
  //logAllUniforms(gl, programInfo.program);
  gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
}

function hideAddressBar() {
  window.scrollTo(0, 1);
}

async function main() {

  let saving = 0;
  updateSliderValue('animTime', 'animTval');
  updateSliderValue('focus', 'focusval');
  updateSliderValue('x0', 'x0val');
  updateSliderValue('x1', 'x1val');
  updateSliderValue('x2', 'x2val');
  updateSliderValue('y0', 'y0val');
  updateSliderValue('y1', 'y1val');
  updateSliderValue('y2', 'y2val');
  updateSliderValue('z0', 'z0val');
  updateSliderValue('z1', 'z1val');
  updateSliderValue('z2', 'z2val');
  updateSliderValue('ampX', 'ampXval');
  updateSliderValue('ampY', 'ampYval');
  updateSliderValue('phaseY', 'phYval');
  updateSliderValue('ampZ', 'ampZval');
  updateSliderValue('phaseZ', 'phZval');
  updateSliderValue('dcX', 'dcXval');
  updateSliderValue('dcY', 'dcYval');
  updateSliderValue('dcZ', 'dcZval');

  let views;

  const renderCam = {
    pos: { x: 0, y: 0, z: 0 }, // default
    sl: { x: 0, y: 0 },
    sk: { x: 0, y: 0 },
    roll: 0,
    f: 0 // placeholder
  }
  let invd;

  const canvas = document.getElementById('glCanvas');
  const gl = canvas.getContext('webgl');
  const container = document.getElementById('canvas-container');

  if (!gl) {
    console.error('Unable to initialize WebGL. Your browser or machine may not support it.');
    return;
  }

  async function handleFileSelect(event) {
    const file = event.target.files[0];
    fname = file.name;
    visualizeFile(file);
  }

  let c = 0;
  function debugTexture(imgData) {
    const img = document.createElement('img');
    img.style.width = '50%';
    img.id = `debug-im${c}`;
    img.classList.add('debug-im');
    if (imgData.src) {
      img.src = imgData.src;
      document.body.appendChild(document.createElement('br'));
    } else {
      displayImageInImgTag(imgData, img.id);
    }
    document.body.appendChild(img);
    c += 1;
  }
  async function parseObjectAndCreateTextures(obj) {
    for (let key in obj) {
      if (obj.hasOwnProperty(key)) {
        if (key === 'image') {
          try {
            const img = await loadImage2(obj[key].url);
            obj[key]['texture'] = createTexture(gl, img);
            debugTexture(img);
          } catch (error) {
            console.error('Error loading image:', error);
          }
        } else if (key === 'invZ' && obj.hasOwnProperty('mask')) {
          try {
            const maskImg = await loadImage2(obj['mask'].url);
            const invzImg = await loadImage2(obj['invZ'].url);
            const maskedInvz = create4ChannelImage(invzImg, maskImg);
            obj['invZ']['texture'] = createTexture(gl, maskedInvz);
            debugTexture(maskedInvz);
          } catch (error) {
            console.error('Error loading mask or invz image:', error);
          }
        } else if (key === 'invZ') { // no mask
          try {
            const invzImg = await loadImage2(obj['invZ'].url);
            obj['invZ']['texture'] = createTexture(gl, invzImg);
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

  async function visualizeFile(file) {
    //const file = event.target.files[0];
    if (file) {
      const lifInfo = await parseLif53(file);
      //console.log(lifInfo);
      views = replaceKeys(lifInfo.views,
        ['width_px', 'height_px', 'focal_px', 'inv_z_map', 'layers_top_to_bottom', 'frustum_skew', 'rotation_slant'],
        ['width', 'height', 'f', 'invZ', 'layers', 'sk', 'sl']
      );
      await parseObjectAndCreateTextures(views);
      console.log(views);

      // Now that we know if mono or stereo setup webGL
      if (views.length < 2) {
        const fragmentShaderSource = await loadShaderFile('../Shaders/rayCastMonoLDI.glsl');
        ({ programInfo, buffers } = setupWebGL(gl, fragmentShaderSource));
      } else {
        const fragmentShaderSource = await loadShaderFile('../Shaders/rayCastStereoLDI.glsl');
        ({ programInfo, buffers } = setupWebGLST(gl, fragmentShaderSource));
      }

      renderCam.f = views[0].f * viewportScale({ x: views[0].width, y: views[0].height }, { x: gl.canvas.width, y: gl.canvas.height })
      //console.log(renderCam);

      invd = 0.0 * views[0].layers[0].invZ.min; // set focus point

      document.getElementById("filePicker").remove();

      document.body.appendChild(stats.dom);
      render();


    }
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
  // Adjust canvas size when entering fullscreen
  document.addEventListener('fullscreenchange', resizeCanvasToContainer);
  document.addEventListener('webkitfullscreenchange', resizeCanvasToContainer);
  document.addEventListener('msfullscreenchange', resizeCanvasToContainer);

  let programInfo, buffers;
  let accumulatedPhase = 0;
  let oldTime = Date.now() / 1000;

  function updateRenderCamPosition(phase) {
    const motionType = document.querySelector('input[name="motionType"]:checked').value;

    if (motionType === 'harmonic') {
      const ampX = parseFloat(document.getElementById('ampX').value);
      const dcX = parseFloat(document.getElementById('dcX').value);
      const phaseX = 0;

      const ampY = parseFloat(document.getElementById('ampY').value);
      const dcY = -parseFloat(document.getElementById('dcY').value);
      const phaseY = parseFloat(document.getElementById('phaseY').value);

      const ampZ = parseFloat(document.getElementById('ampZ').value);
      const dcZ = parseFloat(document.getElementById('dcZ').value);
      const phaseZ = parseFloat(document.getElementById('phaseZ').value);

      // Harmonic motion calculations
      renderCam.pos = {
        x: dcX + ampX * Math.cos(2 * Math.PI * (phase + phaseX)),
        y: dcY + ampY * Math.cos(2 * Math.PI * (phase + phaseY)),
        z: dcZ + ampZ * Math.cos(2 * Math.PI * (phase + phaseZ))
      };
    } else if (motionType === 'arc') {
      const x0 = parseFloat(document.getElementById('x0').value);
      const x1 = parseFloat(document.getElementById('x1').value);
      const x2 = parseFloat(document.getElementById('x2').value);

      const y0 = -parseFloat(document.getElementById('y0').value);
      const y1 = -parseFloat(document.getElementById('y1').value);
      const y2 = -parseFloat(document.getElementById('y2').value);

      const z0 = parseFloat(document.getElementById('z0').value);
      const z1 = parseFloat(document.getElementById('z1').value);
      const z2 = parseFloat(document.getElementById('z2').value);

      // Arc motion interpolation
      const u = (phase) % 1;
      const u2 = u * u;
      renderCam.pos = {
        x: (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * x1 + u2 * x2,
        y: (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * y1 + u2 * y2,
        z: (1 - u) * (1 - u) * z0 + 2 * (1 - u) * u * z1 + u2 * z2
      };
    }
    const focus = parseFloat(document.getElementById('focus').value);
    invd = focus * views[0].layers[0].invZ.min; // set focus point
    renderCam.sk.x = -renderCam.pos.x * invd / (1 - renderCam.pos.z * invd);
    renderCam.sk.y = -renderCam.pos.y * invd / (1 - renderCam.pos.z * invd);
    const vs = viewportScale({ x: views[0].width, y: views[0].height }, { x: gl.canvas.width, y: gl.canvas.height });
    renderCam.f = views[0].f * vs * Math.max(1 - renderCam.pos.z * invd, 0);
  }

  document.getElementById('createVideoButton').addEventListener('click', async () => {
    // Get the current canvas dimensions as default values
    saving = 1;
    const defaultWidth = canvas.width;
    const defaultHeight = canvas.height;
    const defaultFps = 30;

    // Prompt the user for video settings
    const videoWidth = parseInt(prompt("Enter video width:", defaultWidth), 10) || defaultWidth;
    const videoHeight = parseInt(prompt("Enter video height:", defaultHeight), 10) || defaultHeight;
    const videoFps = parseInt(prompt("Enter video fps:", defaultFps), 10) || defaultFps;

    const animTime = parseFloat(document.getElementById('animTime').value);
    const numFrames = Math.ceil(animTime * videoFps);
    const frameDuration = 1000 / videoFps; // Duration of each frame in milliseconds

    // Create an off-screen canvas to render the frames
    const offscreenCanvas = document.createElement('canvas');
    const offscreenCtx = offscreenCanvas.getContext('2d');

    canvas.width = videoWidth;
    canvas.height = videoHeight;
    offscreenCanvas.width = videoWidth;
    offscreenCanvas.height = videoHeight;

    const stream = offscreenCanvas.captureStream(videoFps);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/mp4' });
    const chunks = [];

    recorder.ondataavailable = (e) => chunks.push(e.data);

    // Force re-rendering and copy of the first frame twice before starting the recording
    let accumulatedPhase = 0;
    updateRenderCamPosition(accumulatedPhase);
    drawScene(gl, programInfo, buffers, views, renderCam);

    // Copy the WebGL canvas content to the off-screen canvas twice to ensure stability
    for (let j = 0; j < 2; j++) {
      offscreenCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
      offscreenCtx.drawImage(canvas, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
    }

    // Wait for a short moment to stabilize
    await new Promise(resolve => setTimeout(resolve, 100));

    recorder.start();

    for (let i = 0; i < numFrames; i++) {
      accumulatedPhase = (i / numFrames);

      // Update renderCam position based on the motion type and current phase
      updateRenderCamPosition(accumulatedPhase);

      drawScene(gl, programInfo, buffers, views, renderCam);

      // Copy the WebGL canvas content to the off-screen canvas
      offscreenCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
      offscreenCtx.drawImage(canvas, 0, 0, offscreenCanvas.width, offscreenCanvas.height);

      //await new Promise(requestAnimationFrame);
      await new Promise(resolve => setTimeout(resolve, frameDuration)); // Wait for the duration of each frame
    }

    recorder.stop();

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      saving = 0;
      resizeCanvasToContainer();

      // Extract the original file name from the file picker
      let originalFileName = fname.split('.').slice(0, -1).join('.');

      // Remove "_LIF5" if it exists
      originalFileName = originalFileName.replace('_LIF5', '');

      const outputFileName = `${originalFileName}.mp4`;

      // Create a temporary download link and click it
      const a = document.createElement('a');
      a.href = url;
      a.download = outputFileName;
      document.body.appendChild(a);
      a.click();

      // Clean up
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    };
  });

  async function render() {
    if (!saving) {
      stats.begin();
      resizeCanvasToContainer(); // Ensure canvas is resized before rendering

      const t = Date.now() / 1000; // current time in seconds

      // const st = Math.sin(2 * Math.PI * t / animTime);
      // const ct = Math.cos(2 * Math.PI * t / animTime);
      const animTime = parseFloat(document.getElementById('animTime').value);
      accumulatedPhase += (t - oldTime) / animTime;
      oldTime = t;

      updateRenderCamPosition(accumulatedPhase);

      if (views.length < 2) {
        drawScene(gl, programInfo, buffers, views, renderCam);
      } else {
        drawSceneST(gl, programInfo, buffers, views, renderCam);
      }
      stats.end();
    }
    requestAnimationFrame(render);
  }

  // Retrieve the base64 string from localStorage
  async function getFromIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("lifFileDB", 1);

      request.onsuccess = function (event) {
        const db = event.target.result;

        if (!db.objectStoreNames.contains("lifFiles")) {
          console.warn("Object store 'lifFiles' not found.");
          resolve(null); // Resolve with null if the object store doesn't exist
          return;
        }

        const transaction = db.transaction(["lifFiles"], "readonly");
        const objectStore = transaction.objectStore("lifFiles");

        const requestGet = objectStore.get("lifFileData");

        requestGet.onsuccess = function (event) {
          if (event.target.result) {
            resolve(event.target.result.data);
          } else {
            resolve(null); // Resolve with null if no data is found
          }
        };

        requestGet.onerror = function () {
          reject("Error retrieving file from IndexedDB");
        };
      };

      request.onerror = function () {
        reject("Error opening IndexedDB");
      };
    });
  }

  async function deleteFromIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("lifFileDB", 1);

      request.onsuccess = function (event) {
        const db = event.target.result;

        if (!db.objectStoreNames.contains("lifFiles")) {
          console.warn("Object store 'lifFiles' not found.");
          resolve(); // Resolve without error if the object store doesn't exist
          return;
        }

        const transaction = db.transaction(["lifFiles"], "readwrite");
        const objectStore = transaction.objectStore("lifFiles");

        const requestDelete = objectStore.delete("lifFileData");

        requestDelete.onsuccess = function () {
          console.log("Data deleted from IndexedDB successfully!");
          resolve();
        };

        requestDelete.onerror = function () {
          reject("Error deleting data from IndexedDB");
        };
      };

      request.onerror = function () {
        reject("Error opening IndexedDB");
      };
    });
  }

  const filePicker = document.getElementById('filePicker');
  //const base64String = localStorage.getItem('lifFileData');
  try {
    const base64String = await getFromIndexedDB();
    //console.log("Retrieved base64 string from localStorage:", base64String ? "found" : "not found");

    if (base64String) {

      // Decode the base64 string back to binary string
      console.log("Decoding base64 string...");
      const byteCharacters = atob(base64String);

      console.log("Creating Uint8Array from decoded data...");
      const byteNumbers = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }

      console.log("Constructing File object from Uint8Array...");
      const file = new File([byteNumbers], "uploaded-file", { type: "application/octet-stream" });
      console.log("File object created:", file);

      // Call the visualization function with the file
      console.log("Calling visualizeFile function...");
      visualizeFile(file);

      // Clean up by removing the data from localStorage
      console.log("Cleaning up localStorage...");
      await deleteFromIndexedDB();
      document.getElementById("tmpMsg").remove();

    } else {
      console.log("No base64 string found in localStorage.");
      document.getElementById("tmpMsg").remove();
      filePicker.addEventListener('change', handleFileSelect);
      filePicker.style.display = 'inline';

    }
  } catch (e) {
    console.log("No base64 string found in localStorage.");
    filePicker.addEventListener('change', handleFileSelect);
    filePicker.style.display = 'inline';
    document.getElementById("tmpMsg").remove();
  };

}

main();


