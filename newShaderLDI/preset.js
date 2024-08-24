
const MAX_LAYERS = 5;

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
      sk2: gl.getUniformLocation(shaderProgram, 'sl2'),
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
    gl.bindTexture(gl.TEXTURE_2D, views[0].layers[i].albedo);
    gl.uniform1i(programInfo.uniformLocations.uImage[i], 2 * i);
    
    gl.activeTexture(gl.TEXTURE0 + (2 * i + 1));
    gl.bindTexture(gl.TEXTURE_2D, views[0].layers[i].disparity);
    gl.uniform1i(programInfo.uniformLocations.uDisparityMap[i], 2 * i + 1);
  }
  // Pass the actual number of layers to the shader
  gl.uniform1i(gl.getUniformLocation(programInfo.program, 'uNumLayers'), numLayers);
  
  // views info
  gl.uniform3f(programInfo.uniformLocations.uViewPosition, views[0].camPos.x, views[0].camPos.y, views[0].camPos.z);
  gl.uniform2f(programInfo.uniformLocations.sk1, views[0].sk.x, views[0].sk.y);
  gl.uniform2f(programInfo.uniformLocations.sl1, views[0].sl.x, views[0].sl.y);
  gl.uniform1f(programInfo.uniformLocations.roll1, views[0].roll);
  gl.uniform1fv(programInfo.uniformLocations.f1, views[0].layers.map(layer => layer.f)); // in px
  gl.uniform1fv(programInfo.uniformLocations.invZmin, views[0].layers.map(layer => layer.invZmin));
  gl.uniform1fv(programInfo.uniformLocations.invZmax, views[0].layers.map(layer => layer.invZmax));
  gl.uniform2fv(programInfo.uniformLocations.iRes, views[0].layers.map(layer => [layer.width, layer.height]).flat());
  gl.uniform2f(programInfo.uniformLocations.iResOriginal, views[0].width, views[0].height); // for window effect only
  
  // rendering info
  gl.uniform3f(programInfo.uniformLocations.uFacePosition, renderCam.pos.x, renderCam.pos.y, renderCam.pos.z); // normalized to camera space
  gl.uniform2f(programInfo.uniformLocations.oRes, gl.canvas.width, gl.canvas.height);
  gl.uniform2f(programInfo.uniformLocations.sk2, renderCam.sk.x, renderCam.sk.y);
  gl.uniform2f(programInfo.uniformLocations.sl2, renderCam.sl.x, renderCam.sl.y);
  gl.uniform1f(programInfo.uniformLocations.roll2, renderCam.roll);
  gl.uniform1f(programInfo.uniformLocations.f2, renderCam.f); // in px
  
  const vertexCount = 6;
  const type = gl.UNSIGNED_SHORT;
  const offset = 0;
  gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
}

function hideAddressBar() {
  window.scrollTo(0, 1);
}

async function main() {
  
  updateSliderValue('animTime', 'animTval');
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
  
  const views = [{ // you get this info from decoding LIF
    //albedo: null, // moved to layers
    //disparity: null, // // moved to layers
    width: 0, // original view width, pre outpainting
    height: 0, //original view height, pre outpainting
    camPos: { x: 0, y: 0, z: 0 },
    sl: { x: 0, y: 0 },
    sk: { x: 0, y: 0 },
    roll: 0,
    f: 0, // in px
    layers: []
  }]
  
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
    visualizeFile(file);
  }
  
  async function visualizeFile(file) {
    //const file = event.target.files[0];
    if (file) {
      const currentImgData = await parseLif5(file);
      console.log(currentImgData);
      const numLayers = currentImgData.layers.length;
      console.log("numLayers: " + numLayers);
      const mainImage = await loadImage2(currentImgData.rgb); // only needed to extract original width+height
      //const dispImage = await loadImage2(currentImgData.disp);
      //views[0].albedo = createTexture(gl,mainImage); // moved to layers
      //views[0].disparity = createTexture(gl,dispImage); // moved to layers
      views[0].width = mainImage.width;
      views[0].height = mainImage.height;
      views[0].f = currentImgData.f * views[0].width; // focal of main image
      if (numLayers == 0) { // no layer data
        const dispImage = await loadImage2(currentImgData.disp);
        views[0].layers.push({
          albedo: createTexture(gl, mainImage),
          disparity: createTexture(gl, dispImage),
          width: views[0].width, // iRes.x for the layer, includes outpainting
          height: views[0].height, // // iRes.y for the layer, includes outpainting
          f: currentImgData.f * views[0].width, // same as main image unless rescaling
          invZmin: -currentImgData.minDisp / views[0].f * views[0].width,
          invZmax: -currentImgData.maxDisp / views[0].f * views[0].width
        })
      }
      for (let i = 0; i < numLayers; i++) { // example showing progressive reduction of resolution with layers
        const layerDs = 1; // change to 2 to get lower resolution per layer
        const albedoImage = await loadImage2(currentImgData.layers[i].rgb);
        //const albedoImage = await downsampleImage(currentImgData.layers[i].rgb,Math.pow(layerDs,i));
        const disparityImage = await loadImage2(currentImgData.layers[i].disp);
        //const disparityImage = await downsampleImage(currentImgData.layers[i].disp,Math.pow(layerDs,i));
        const maskImage = await loadImage2(currentImgData.layers[i].mask);
        //const maskImage = await downsampleImage(currentImgData.layers[i].mask,Math.pow(layerDs,i));
        //console.log('RGB Image Dimensions:', disparityImage.width, disparityImage.height);
        //console.log('Mask Image Dimensions:', maskImage.width, maskImage.height);
        const disparity4Image = create4ChannelImage(disparityImage, maskImage);
        
        views[0].layers.push({
          albedo: createTexture(gl, albedoImage),
          disparity: createTexture(gl, disparity4Image),
          width: albedoImage.width, // iRes.x for the layer, includes outpainting
          height: albedoImage.height, // // iRes.y for the layer, includes outpainting
          f: currentImgData.f * views[0].width / Math.pow(layerDs, i), // same as views[0].f unless rescaling
          invZmin: -currentImgData.minDisp / views[0].f * views[0].width,
          invZmax: -currentImgData.maxDisp / views[0].f * views[0].width
        })
      }
      console.log(views);
      console.log(views[0].layers.map(layer => [layer.width, layer.height]).flat());
      renderCam.f = views[0].f * viewportScale({ x: views[0].width, y: views[0].height }, { x: gl.canvas.width, y: gl.canvas.height })
      console.log(renderCam);
      
      invd = 0.0 * views[0].layers[0].invZmin; // set focus point
      
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
  
  //const fragmentShaderSource = await loadShaderFile('./fragmentShader.glsl');
  const fragmentShaderSource = await loadShaderFile('./rayCastMonoLDI.glsl');
  
  const { programInfo, buffers } = setupWebGL(gl, fragmentShaderSource); 
  let accumulatedPhase = 0;
  let oldTime = Date.now() / 1000;
  
  async function render() {
    stats.begin();
    resizeCanvasToContainer(); // Ensure canvas is resized before rendering
    
    const t = Date.now() / 1000; // current time in seconds
    
    // const st = Math.sin(2 * Math.PI * t / animTime);
    // const ct = Math.cos(2 * Math.PI * t / animTime);
    const animTime = parseFloat(document.getElementById('animTime').value);
    accumulatedPhase += (t-oldTime)/animTime;
    oldTime = t;

    const motionType = document.querySelector('input[name="motionType"]:checked').value;
    
    if (motionType === 'harmonic') {
      const ampX = parseFloat(document.getElementById('ampX').value);
      const phaseX = 0;
      
      const ampY = parseFloat(document.getElementById('ampY').value);
      const phaseY = parseFloat(document.getElementById('phaseY').value);
      
      const ampZ = parseFloat(document.getElementById('ampZ').value);
      const phaseZ = parseFloat(document.getElementById('phaseZ').value);
      
      // Harmonic motion calculations
      renderCam.pos = {
        x: ampX * Math.cos(2 * Math.PI * (accumulatedPhase + phaseX)),
        y: ampY * Math.cos(2 * Math.PI * (accumulatedPhase + phaseY)),
        z: ampZ * Math.cos(2 * Math.PI * (accumulatedPhase + phaseZ))
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
      const u = (accumulatedPhase) % 1;
      const u2 = u * u;
      renderCam.pos = {
        x: (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * x1 + u2 * x2,
        y: (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * y1 + u2 * y2,
        z: (1 - u) * (1 - u) * z0 + 2 * (1 - u) * u * z1 + u2 * z2
      };
    }
    
    
    renderCam.sk.x = -renderCam.pos.x * invd / (1 - renderCam.pos.z * invd);
    renderCam.sk.y = -renderCam.pos.y * invd / (1 - renderCam.pos.z * invd);
    const vs = viewportScale({ x: views[0].width, y: views[0].height }, { x: gl.canvas.width, y: gl.canvas.height });
    renderCam.f = views[0].f * vs;
    
    drawScene(gl, programInfo, buffers, views, renderCam);
    stats.end();
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


