
const MAX_LAYERS = 5;

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
  //logAllUniforms(gl, programInfo.program);
  gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
}

function hideAddressBar() {
  window.scrollTo(0, 1);
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

  async function parseObjectAndCreateTextures(obj) {
    for (let key in obj) {
      if (obj.hasOwnProperty(key)) {
        if (key === 'image') {
          try {
            const img = await loadImage2(obj[key].url);
            obj[key]['texture'] = createTexture(gl, img);
          } catch (error) {
            console.error('Error loading image:', error);
          }
        } else if (key === 'invZ' && obj.hasOwnProperty('mask')) {
          try {
            const maskImg = await loadImage2(obj['mask'].url);
            const invzImg = await loadImage2(obj['invZ'].url);
            const maskedInvz = create4ChannelImage(invzImg, maskImg);
            obj['invZ']['texture'] = createTexture(gl, maskedInvz);
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
        setTimeout(hideAddressBar, 0);
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

    drawScene(gl, programInfo, buffers, views, renderCam);
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

  let views;
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

  const fragmentShaderSource = await loadShaderFile('./rayCastMonoLDI.glsl');
  const { programInfo, buffers } = setupWebGL(gl, fragmentShaderSource);

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

  // Event listener for window resize
  window.addEventListener('resize', resizeCanvasToContainer);
  resizeCanvasToContainer(); // Initial resize to set the correct canvas size
  // Adjust canvas size when entering fullscreen
  document.addEventListener('fullscreenchange', resizeCanvasToContainer);
  document.addEventListener('webkitfullscreenchange', resizeCanvasToContainer);
  document.addEventListener('msfullscreenchange', resizeCanvasToContainer);

}

main();


