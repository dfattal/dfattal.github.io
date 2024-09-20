
const MAX_LAYERS = 4;

 
function createFramebuffer(gl, width, height) {
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    console.error('framebuffer is not complete');
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { framebuffer, texture, size: { width, height } };
}


const postProcessingVertexShaderSource = `
  attribute vec4 aVertexPosition;
  attribute vec2 aTextureCoord;
  varying vec2 vTextureCoord;
  void main() {
    gl_Position = aVertexPosition;
    vTextureCoord = aTextureCoord;
  }
`;

const postProcessingFragmentShaderSource = `
  precision highp float;
  varying vec2 vTextureCoord;
  uniform sampler2D uTexture;
  uniform vec2 oRes;

  float getSoftEdgeProximity(vec4 c, vec2 xy) { // relative radius, soft edges
    float edge_proximity = 0.0;
    float radius = 1.0;
    const float edge_detection = 0.05; // considering making 0.05 to include more edges
    float relative_scale = 0.001;
    vec2 ts = normalize(oRes);
    for (float x = -3.0; x <= 3.0; x += 1.0) {
        for (float y = -3.0; y <= 3.0; y += 1.0) {
            vec2 offset_xy = xy + radius * 2.0 * relative_scale * vec2(x, y) / ts;
            vec4 s = texture2D(uTexture, offset_xy);
            if (c.a - s.a > edge_detection) {
                edge_proximity += (4.25 - length(vec2(x,y)));
            }
            if (s.a - c.a > edge_detection) {
                edge_proximity += (4.25 - length(vec2(x,y)));
            }
        }
    }      
    return pow(clamp(edge_proximity, 0.0, 49.0) / 49.0, 2.0);
  }

  // blurred edges, radius of blur depends on edge proximity
  vec4 edge_blur(vec2 xy) {
      vec4 c = texture2D(uTexture, xy);
      float edge_proximity = getSoftEdgeProximity(c, xy);
      //if (mod(xy.y * 8.0, 1.0) > 0.5) return vec4(vec3(edge_proximity), 1.0); // uncomment for edge mask debugging

      if (edge_proximity <= 0.01) return vec4(c.rgb, 1.0); // optimization
      
      vec4 result = vec4(0.0);
      float sum = 0.0;

      for (float x = -3.0; x <= 3.0; x += 1.0) {
          for (float y = -3.0; y <= 3.0; y += 1.0) {
              vec2 offset_xy = xy + edge_proximity * vec2(x, y) / oRes;
              vec4 s = texture2D(uTexture, offset_xy);
              float w = 4.25 - length(vec2(x,y));
              result += s * w;
              sum += w;
          }
      }
      
      return vec4((result / sum).rgb, 1.0);
  }

  void main() {
    gl_FragColor = edge_blur(vTextureCoord);
  }
`;

function setupPostProcessingShader(gl) {
  const vsSource = postProcessingVertexShaderSource;
  const fsSource = postProcessingFragmentShaderSource;

  const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
  return {
    program: shaderProgram,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
      textureCoord: gl.getAttribLocation(shaderProgram, 'aTextureCoord'),
    },
    uniformLocations: {
      uTexture: gl.getUniformLocation(shaderProgram, 'uTexture'),
      oRes: gl.getUniformLocation(shaderProgram, 'oRes'),
    },
  };
}

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
      oRes: gl.getUniformLocation(shaderProgram, 'oRes'),
      writeDepthToAlpha: gl.getUniformLocation(shaderProgram, 'writeDepthToAlpha'),
      isMultisamplePass: gl.getUniformLocation(shaderProgram, 'isMultisamplePass'),
      bypassMultisampling: gl.getUniformLocation(shaderProgram, 'bypassMultisampling'),
      uPreviousRendering: gl.getUniformLocation(shaderProgram, 'uPreviousRendering'),
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

  const framebuffer1 = createFramebuffer(gl, gl.canvas.width, gl.canvas.height);
  const framebuffer2 = createFramebuffer(gl, gl.canvas.width, gl.canvas.height);
  const postProcessingShader = setupPostProcessingShader(gl);

  return { programInfo, postProcessingShader, buffers: { position: positionBuffer, textureCoord: textureCoordBuffer, indices: indexBuffer }, framebuffer1, framebuffer2 };
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
      oRes: gl.getUniformLocation(shaderProgram, 'oRes'),
      writeDepthToAlpha: gl.getUniformLocation(shaderProgram, 'writeDepthToAlpha'),
      isMultisamplePass: gl.getUniformLocation(shaderProgram, 'isMultisamplePass'),
      bypassMultisampling: gl.getUniformLocation(shaderProgram, 'bypassMultisampling'),
      uPreviousRendering: gl.getUniformLocation(shaderProgram, 'uPreviousRendering'),
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

  const framebuffer1 = createFramebuffer(gl, gl.canvas.width, gl.canvas.height);
  const framebuffer2 = createFramebuffer(gl, gl.canvas.width, gl.canvas.height);
  const postProcessingShader = setupPostProcessingShader(gl);

  return { programInfo, postProcessingShader, buffers: { position: positionBuffer, textureCoord: textureCoordBuffer, indices: indexBuffer }, framebuffer1, framebuffer2 };
}

let multiPass = false;
let bypassMultisampling = false;
const toggleInterval = 1000; // 1 Second
function toggleModes() {
  const elapsedSeconds = Math.floor(Date.now() / toggleInterval);
  const cyclePosition = elapsedSeconds % 3;
  if (cyclePosition == 0) { // first second no extra steps
    multiPass = false;
    bypassMultisampling = true;
  } else if (cyclePosition == 1) { // second second - blur only
    multiPass = true;
    bypassMultisampling = true;
  } else if (cyclePosition == 2) { // third second - multisample then blur
    multiPass = true;
    bypassMultisampling = false;
  }
}

function drawScene(gl, programInfo, postProcessingShader, framebuffer1, framebuffer2, buffers, views, renderCam) {
  toggleModes();
  // enforce rendering mode if needed
  // multiPass = true;
  // bypassMultisampling = true;  

  // First pass: Render to framebuffer
  if (multiPass) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer1.framebuffer);
    gl.viewport(0, 0, framebuffer1.size.width, framebuffer1.size.height);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  }

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

  gl.activeTexture(gl.TEXTURE0 + 2 * numLayers);
  gl.bindTexture(gl.TEXTURE_2D, views[0].layers[0].image.texture); // need to set any texture here to avoid feedback loop
  gl.uniform1i(programInfo.uniformLocations.uPreviousRendering, 2 * numLayers);

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
  gl.uniform1f(programInfo.uniformLocations.writeDepthToAlpha, multiPass ? 1.0 : 0.0);

  gl.uniform1i(programInfo.uniformLocations.isMultisamplePass, false);

  const vertexCount = 6;
  const type = gl.UNSIGNED_SHORT;
  const offset = 0;
  //logAllUniforms(gl, programInfo.program);
  gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
   
  if (multiPass) {

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer2.framebuffer);
    gl.viewport(0, 0, framebuffer2.size.width, framebuffer2.size.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Second pass: multisampling by casting more rays around edges, using same shader program but with added inpus:
    gl.uniform1i(programInfo.uniformLocations.isMultisamplePass, true);
    gl.uniform1i(programInfo.uniformLocations.bypassMultisampling, bypassMultisampling); // for toggling
    gl.activeTexture(gl.TEXTURE0 + 2 * numLayers);
    gl.bindTexture(gl.TEXTURE_2D, framebuffer1.texture);
    gl.uniform1i(programInfo.uniformLocations.uPreviousRendering, 2 * numLayers);
    gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);

    // Third pass: Post-processing edges with blur
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(postProcessingShader.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, framebuffer2.texture);
    gl.uniform1i(postProcessingShader.uniformLocations.uTexture, 0);
    gl.uniform2f(postProcessingShader.uniformLocations.oRes, gl.canvas.width, gl.canvas.height);
    gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
  }
}

function drawSceneST(gl, programInfo, postProcessingShader, framebuffer1, framebuffer2, buffers, views, renderCam) {
  toggleModes();

  if (multiPass) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer1.framebuffer);
    gl.viewport(0, 0, framebuffer1.size.width, framebuffer1.size.height);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  }

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

  gl.activeTexture(gl.TEXTURE0 + 4 * numLayersL);
  gl.bindTexture(gl.TEXTURE_2D, views[0].layers[0].image.texture); // need to set any texture here to avoid feedback loop
  gl.uniform1i(programInfo.uniformLocations.uPreviousRendering, 4 * numLayersL);

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
  gl.uniform1i(programInfo.uniformLocations.uNumLayersR, numLayersR);

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
  gl.uniform1f(programInfo.uniformLocations.writeDepthToAlpha, multiPass ? 1.0 : 0.0);

  gl.uniform1i(programInfo.uniformLocations.isMultisamplePass, false); // normal pass first

  const vertexCount = 6;
  const type = gl.UNSIGNED_SHORT;
  const offset = 0;
  //logAllUniforms(gl, programInfo.program);
  gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);

  if (multiPass) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer2.framebuffer);
    gl.viewport(0, 0, framebuffer2.size.width, framebuffer2.size.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Second pass: multisampling by casting more rays around edges, using same shader program but with added inpus:
    gl.uniform1i(programInfo.uniformLocations.isMultisamplePass, true);
    gl.uniform1i(programInfo.uniformLocations.bypassMultisampling, bypassMultisampling); // for toggling
    gl.activeTexture(gl.TEXTURE0 + 4 * numLayersL);
    gl.bindTexture(gl.TEXTURE_2D, framebuffer1.texture);
    gl.uniform1i(programInfo.uniformLocations.uPreviousRendering, 4 * numLayersL);
    gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);

    // Third pass: Post-processing edges with blur
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(postProcessingShader.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, framebuffer2.texture);
    gl.uniform1i(postProcessingShader.uniformLocations.uTexture, 0);
    gl.uniform2f(postProcessingShader.uniformLocations.oRes, gl.canvas.width, gl.canvas.height);
    gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
  }
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

async function main() {

  let views;
  // Tracking Setup
  let trackingFocal;
  let OVD;

  function normFacePosition(pos) {
    const IO = 63;
    const vd = OVD;
    return { x: pos.x / IO, y: -pos.y / IO, z: (vd - pos.z) / IO }
  }

  let facePosition = { x: 0, y: 0, z: 600 };
  let oldFacePosition = { x: 0, y: 0, z: 600 };

  const axy = 0.5; // exponential smoothing
  const az = 0.1; // exponential smoothing

  const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
  const detectorConfig = {
    runtime: 'tfjs',
  };
  const detector = await faceLandmarksDetection.createDetector(model, detectorConfig);

  const filePicker = document.getElementById('filePicker');
  //const base64String = localStorage.getItem('lifFileData');

  // try to read LIF file in DB and if not show file picker
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

  async function handleFileSelect(event) {
    const file = event.target.files[0];
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
        const fragmentShaderSource = await loadShaderFile('./rayCastMonoLDI.glsl');
        ({ programInfo, postProcessingShader, buffers, framebuffer1, framebuffer2 } = setupWebGL(gl, fragmentShaderSource));
      } else {
        const fragmentShaderSource = await loadShaderFile('./rayCastStereoLDI.glsl');
        ({ programInfo, postProcessingShader, buffers, framebuffer1, framebuffer2 } = setupWebGLST(gl, fragmentShaderSource));
      }

      renderCam.f = views[0].f * viewportScale({ x: views[0].width, y: views[0].height }, { x: gl.canvas.width, y: gl.canvas.height })
      //console.log(renderCam);

      invd = 0.8 * views[0].layers[0].invZ.min; // set focus point

      document.getElementById("filePicker").remove();

      const video = await setupCamera();
      trackingFocal = Math.max(video.videoWidth, video.videoHeight); // for tracking
      trackingFocal *= isMobileDevice() ? 0.8 : 1.0; // modify focal if mobile, likely wider angle
      console.log("using focal " + trackingFocal);
      OVD = isMobileDevice() ? 0.7 * restPos : restPos; // defined in common.js
      console.log("using OVD " + OVD);

      iOSmsg = document.getElementById("iOSmsg");

      function startVideo() {
        iOSmsg.remove();
        video.play();
        if (canvas.requestFullscreen) {
          canvas.requestFullscreen();
        } else if (canvas.webkitRequestFullscreen) { /* Safari */
          canvas.webkitRequestFullscreen();
        } else if (canvas.msRequestFullscreen) { /* IE11 */
          canvas.msRequestFullscreen();
        }
        render();
      }

      if (isIOS()) {
        console.log("iOS Device Detected");
        iOSmsg.textContent = "iOS Device Detected. Click to start video.";
        document.addEventListener('click', startVideo, { once: true });
      } else {
        startVideo();
      }
      //video.play();
      document.body.appendChild(stats.dom);

    }
  }

  async function render() {
    stats.begin();
    resizeCanvasToContainer(); // Ensure canvas is resized before rendering
    const estimationConfig = { flipHorizontal: false };
    const predictions = await detector.estimateFaces(video, estimationConfig);
    const newFacePosition = extractFacePosition(predictions, trackingFocal);
    if (newFacePosition) {
      facePosition.x = (1 - axy) * oldFacePosition.x + axy * newFacePosition.x;
      facePosition.y = (1 - axy) * oldFacePosition.y + axy * newFacePosition.y;
      facePosition.z = (1 - az) * oldFacePosition.z + az * newFacePosition.z;
      oldFacePosition = facePosition;
    } else {
      facePosition = oldFacePosition;
    }

    // update renderCam
    renderCam.pos = normFacePosition(facePosition); // normalize to camera space
    renderCam.sk.x = -renderCam.pos.x * invd / (1 - renderCam.pos.z * invd); // sk2 = -C2.xy*invd/(1.0-C2.z*invd)
    renderCam.sk.y = -renderCam.pos.y * invd / (1 - renderCam.pos.z * invd); // sk2 = -C2.xy*invd/(1.0-C2.z*invd)
    const vs = viewportScale({ x: views[0].width, y: views[0].height }, { x: gl.canvas.width, y: gl.canvas.height });
    renderCam.f = views[0].f * vs * Math.max(1 - renderCam.pos.z * invd, 1); // f2 = f1/adjustAr(iRes,oRes)*max(1.0-C2.z*invd,1.0);

    if (views.length < 2) {
      drawScene(gl, programInfo, postProcessingShader, framebuffer1, framebuffer2, buffers, views, renderCam);
    } else {
      drawSceneST(gl, programInfo, postProcessingShader, framebuffer1, framebuffer2, buffers, views, renderCam);
    }
    stats.end();
    requestAnimationFrame(render);
    //console.log(renderCam.pos);
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

  const renderCam = {
    pos: { x: 0, y: 0, z: 0 }, // default
    sl: { x: 0, y: 0 },
    sk: { x: 0, y: 0 },
    roll: 0,
    f: 0 // placeholder
  }
  let invd;

  // Setup gl context + Shaders
  const canvas = document.getElementById('glCanvas');
  const gl = canvas.getContext('webgl');
  const container = document.getElementById('canvas-container');

  if (!gl) {
    console.error('Unable to initialize WebGL. Your browser or machine may not support it.');
    return;
  }

  // const fragmentShaderSource = await loadShaderFile('./rayCastMonoLDI.glsl');
  // const { programInfo, buffers } = setupWebGL(gl, fragmentShaderSource);
  //const fragmentShaderSource = await loadShaderFile('./rayCastMonoLDI.glsl');
  let programInfo, buffers; // will be set once we know if mono or stereo

  // Event listener for window resize
  window.addEventListener('resize', resizeCanvasToContainer);
  resizeCanvasToContainer(); // Initial resize to set the correct canvas size
  // Adjust canvas size when entering fullscreen
  document.addEventListener('fullscreenchange', resizeCanvasToContainer);
  document.addEventListener('webkitfullscreenchange', resizeCanvasToContainer);
  document.addEventListener('msfullscreenchange', resizeCanvasToContainer);

}

main();


