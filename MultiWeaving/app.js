// app.js
(() => {
    const MAX_VIEWERS = 4;
    const MAX_N = 128;
    const IPD_mm = 60.0;

    // Screen dimensions (will be calculated from diagonal)
    let screenW_mm = 1439.0;
    let screenH_mm = 809.0;

    // -------------------------------------------------------------------
    // WebGL setup
    // -------------------------------------------------------------------
    const canvas = document.getElementById('glcanvas');
    const gl = canvas.getContext('webgl');

    if (!gl) {
      alert('WebGL not supported in this browser.');
      return;
    }

    // Resize canvas to display size * devicePixelRatio
    function resizeCanvas() {
      const dpr = window.devicePixelRatio || 1;
      const displayWidth = canvas.clientWidth * dpr;
      const displayHeight = canvas.clientHeight * dpr;
      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
      }
    }
    window.addEventListener('resize', () => {
      resizeCanvas();
      drawScene();
    });

    // -------------------------------------------------------------------
    // Shaders
    // -------------------------------------------------------------------
    const vsSource = `
      attribute vec2 a_position;
      varying vec2 vUv;
      void main() {
        vUv = (a_position + 1.0) * 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fsSource = `
      precision mediump float;

      varying vec2 vUv;

      const int MAX_VIEWERS = ${MAX_VIEWERS};
      const int MAX_N = ${MAX_N};

      uniform float u_screenWidthMm;
      uniform float u_screenHeightMm;
      uniform int   u_numViewers;
      uniform vec3  u_viewerCenters[MAX_VIEWERS];
      uniform float u_IPDmm;
      uniform float u_FOVdeg;
      uniform int   u_N;
      uniform int   u_currentViewer;   // 0..u_numViewers-1
      uniform int   u_isLeftEye;       // 1 = left, 0 = right
      uniform float u_pixelPitchMm;    // pixel pitch in mm
      uniform int   u_resolutionH;     // horizontal resolution
      uniform int   u_resolutionV;     // vertical resolution

      // SBS texture support
      uniform sampler2D u_sbsTexture;  // side-by-side stereo texture
      uniform int u_useTexture;        // 1 = use texture, 0 = use test pattern

      // constants from your MATLAB code
      uniform float u_SL;  // slant parameter
      const float NREFR = 1.6;

      // Helper functions for pixel assignment and radiance
      float t(float x1, float x2, float x) {
        return clamp((x - x1) / (x2 - x1), 0.0, 1.0);
      }

      float smoothstep_custom(float x1, float x2, float x) {
        float t_val = t(x1, x2, x);
        return t_val * t_val * (3.0 - 2.0 * t_val);
      }

      float smoothbox(float x1, float x2, float sm, float x) {
        return smoothstep_custom(x1 - sm, x1 + sm, x) * (1.0 - smoothstep_custom(x2 - sm, x2 + sm, x));
      }

      float scorefun(float h, int N) {
        return exp(-float(N) * abs(h));  // For pixel assignment
      }

      float radfun(float h, int N) {
        float halfN = 0.5 / float(N);
        return smoothbox(-halfN, halfN, halfN, h);  // Physical radiance model
      }

      // Helper function to get viewer center by index (workaround for GLSL ES 1.0)
      vec3 getViewerCenter(int idx) {
        if (idx == 0) return u_viewerCenters[0];
        if (idx == 1) return u_viewerCenters[1];
        if (idx == 2) return u_viewerCenters[2];
        if (idx == 3) return u_viewerCenters[3];
        return u_viewerCenters[0]; // fallback
      }

      float phase(vec2 xy, vec3 eyePos, float v, float donopx) {
        float xo = xy.x;
        float yo = xy.y;
        float vx = eyePos.x;
        float vy = eyePos.y;
        float vz = eyePos.z;

        float dx = (vx - xo) / vz;
        float dy = (vy - yo) / vz;

        float denom = sqrt(1.0 + (1.0 - 1.0/(NREFR*NREFR)) * (dx*dx + dy*dy));
        float raw = v + donopx * (dx + u_SL * dy) / denom;
        float m = mod(raw, 1.0);
        return m - 0.5;
      }

      void main() {
        // Quantize UV coordinates to pixel grid to simulate actual resolution
        float pixelX = floor(vUv.x * float(u_resolutionH)) + 0.5;
        float pixelY = floor(vUv.y * float(u_resolutionV)) + 0.5;
        float quantizedU = pixelX / float(u_resolutionH);
        float quantizedV = pixelY / float(u_resolutionV);

        // convert quantized uv to physical mm (origin at center, +y up)
        float xo = (quantizedU - 0.5) * u_screenWidthMm;
        float yo = (0.5 - quantizedV) * u_screenHeightMm;
        vec2 xy = vec2(xo, yo);

        float donopx = 0.5 / tan(radians(u_FOVdeg * 0.5));

        // accumulators for current viewer+eye
        float redAccum = 0.0;
        float greenAccum = 0.0;
        float blueAccum = 0.0;
        float weightSum = 0.0;

        // clamp N just in case
        int N = u_N;
        if (N > MAX_N) {
          N = MAX_N;
        }

        // loop over sub-elements k
        for (int k = 0; k < MAX_N; ++k) {
          if (k >= N) break;
          float v = (float(k) + 0.5) / float(N);

          // global pixel assignment: score-based voting across all viewers
          float scoreL = 0.0;
          float scoreR = 0.0;

          for (int vi = 0; vi < MAX_VIEWERS; ++vi) {
            if (vi >= u_numViewers) break;

            vec3 center = getViewerCenter(vi);
            vec3 LE = center + vec3(-u_IPDmm * 0.5, 0.0, 0.0);
            vec3 RE = center + vec3( u_IPDmm * 0.5, 0.0, 0.0);

            float phL = phase(xy, LE, v, donopx);
            float phR = phase(xy, RE, v, donopx);

            scoreL += scorefun(phL, N);
            scoreR += scorefun(phR, N);
          }

          // Binary assignment based on voting
          float pixVal = (scoreR > scoreL) ? 1.0 : 0.0;

          // now phase for this viewer + this eye only
          vec3 cCenter = getViewerCenter(u_currentViewer);
          vec3 eyePos = (u_isLeftEye == 1)
            ? cCenter + vec3(-u_IPDmm * 0.5, 0.0, 0.0)
            : cCenter + vec3( u_IPDmm * 0.5, 0.0, 0.0);

          float h = phase(xy, eyePos, v, donopx);
          float w = radfun(h, N);  // Use physical radiance model

          if (u_useTexture == 1) {
            // Sample from SBS texture (flip V coordinate to fix y-flip)
            // Left image: left half of texture (u: 0 to 0.5)
            // Right image: right half of texture (u: 0.5 to 1.0)
            vec2 leftUV = vec2(quantizedU * 0.5, 1.0 - quantizedV);
            vec2 rightUV = vec2(quantizedU * 0.5 + 0.5, 1.0 - quantizedV);

            vec3 leftColor = texture2D(u_sbsTexture, leftUV).rgb;
            vec3 rightColor = texture2D(u_sbsTexture, rightUV).rgb;

            // Convert from gamma to linear space (approximate: square the values)
            leftColor = leftColor * leftColor;
            rightColor = rightColor * rightColor;

            // Use full RGB: blend left and right colors based on pixVal
            redAccum   += w * (pixVal * rightColor.r + (1.0 - pixVal) * leftColor.r);
            greenAccum += w * (pixVal * rightColor.g + (1.0 - pixVal) * leftColor.g);
            blueAccum  += w * (pixVal * rightColor.b + (1.0 - pixVal) * leftColor.b);
            weightSum  += w;
          } else {
            // Test pattern: red for right, blue for left
            redAccum  += w * pixVal;
            blueAccum += w * (1.0 - pixVal);
            weightSum += w;
          }
        }

        // Normalize by sum of weights (better for texture mode)
        if (u_useTexture == 1 && weightSum > 0.0) {
          redAccum   /= weightSum;
          greenAccum /= weightSum;
          blueAccum  /= weightSum;
        } else {
          // Test pattern: normalize by max value
          float maxVal = max(max(redAccum, greenAccum), blueAccum);
          if (maxVal > 0.0) {
            redAccum   /= maxVal;
            greenAccum /= maxVal;
            blueAccum  /= maxVal;
          }
        }

        // gamma 1/2 like sqrt()
        float r = sqrt(clamp(redAccum, 0.0, 1.0));
        float g = sqrt(clamp(greenAccum, 0.0, 1.0));
        float b = sqrt(clamp(blueAccum, 0.0, 1.0));

        gl_FragColor = vec4(r, g, b, 1.0);
      }
    `;

    function createShader(gl, type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    function createProgram(gl, vsSource, fsSource) {
      const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
      const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
      const program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        return null;
      }
      return program;
    }

    const program = createProgram(gl, vsSource, fsSource);
    gl.useProgram(program);

    // Fullscreen quad
    const positionLoc = gl.getAttribLocation(program, 'a_position');
    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    const quadVerts = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    // Uniform locations
    const u_screenWidthMmLoc  = gl.getUniformLocation(program, 'u_screenWidthMm');
    const u_screenHeightMmLoc = gl.getUniformLocation(program, 'u_screenHeightMm');
    const u_numViewersLoc     = gl.getUniformLocation(program, 'u_numViewers');
    const u_viewerCentersLoc  = gl.getUniformLocation(program, 'u_viewerCenters');
    const u_IPDmmLoc          = gl.getUniformLocation(program, 'u_IPDmm');
    const u_FOVdegLoc         = gl.getUniformLocation(program, 'u_FOVdeg');
    const u_NLoc              = gl.getUniformLocation(program, 'u_N');
    const u_currentViewerLoc  = gl.getUniformLocation(program, 'u_currentViewer');
    const u_isLeftEyeLoc      = gl.getUniformLocation(program, 'u_isLeftEye');
    const u_SLLoc             = gl.getUniformLocation(program, 'u_SL');
    const u_pixelPitchMmLoc   = gl.getUniformLocation(program, 'u_pixelPitchMm');
    const u_resolutionHLoc    = gl.getUniformLocation(program, 'u_resolutionH');
    const u_resolutionVLoc    = gl.getUniformLocation(program, 'u_resolutionV');
    const u_sbsTextureLoc     = gl.getUniformLocation(program, 'u_sbsTexture');
    const u_useTextureLoc     = gl.getUniformLocation(program, 'u_useTexture');

    // Create texture for SBS image
    const sbsTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, sbsTexture);
    // Create a 1x1 placeholder texture
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    let useTexture = false;

    // Screen dimensions and IPD set once (IPD is constant, screen dims updated in drawScene)
    gl.uniform1f(u_IPDmmLoc, IPD_mm);

    // -------------------------------------------------------------------
    // UI state
    // -------------------------------------------------------------------
    const numViewersInput = document.getElementById('numViewers');
    const fovSlider = document.getElementById('fov');
    const fovValueLabel = document.getElementById('fovValue');
    const numViewsSlider = document.getElementById('numViews');
    const numViewsValueLabel = document.getElementById('numViewsValue');
    const slantSlider = document.getElementById('slant');
    const slantValueLabel = document.getElementById('slantValue');
    const screenDiagonalInput = document.getElementById('screenDiagonal');
    const resolutionHInput = document.getElementById('resolutionH');
    const screenDimensionsLabel = document.getElementById('screenDimensions');
    const resolutionDisplayLabel = document.getElementById('resolutionDisplay');
    const viewerControlsDiv = document.getElementById('viewerControls');
    const viewportGrid = document.getElementById('viewportGrid');
    const fpsDisplay = document.getElementById('fpsDisplay');
    const sbsImageInput = document.getElementById('sbsImage');
    const clearImageButton = document.getElementById('clearImage');
    const imageStatusLabel = document.getElementById('imageStatus');

    // FPS tracking
    let lastFrameTime = performance.now();
    let frameCount = 0;
    let fpsSum = 0;

    // Calculate screen dimensions from diagonal (16:9 aspect ratio)
    function updateScreenDimensions() {
      const diagonalInches = parseFloat(screenDiagonalInput.value);
      const diagonalMm = diagonalInches * 25.4;

      // For 16:9 aspect ratio: width = diagonal * sqrt(256/337), height = diagonal * sqrt(81/337)
      screenW_mm = diagonalMm * Math.sqrt(256 / 337);
      screenH_mm = diagonalMm * Math.sqrt(81 / 337);

      // Update display labels
      screenDimensionsLabel.textContent = `${Math.round(screenW_mm)} × ${Math.round(screenH_mm)} mm`;

      const resH = parseInt(resolutionHInput.value, 10);
      const resV = Math.round(resH * 9 / 16);
      resolutionDisplayLabel.textContent = `${resH} × ${resV} px`;
    }

    // Calculate viewer position using distribution formula: xk = ((k+0.5)/numViewers-0.5)*2000mm
    function calculateViewerPosition(k, numViewers) {
      const xk = ((k + 0.5) / numViewers - 0.5) * 2000;
      return { x: xk, y: 0, z: 1500 };
    }

    const viewerStates = [];
    // Always start with default positions: 2 viewers distributed according to formula
    const defaultNumViewers = 2;
    for (let i = 0; i < MAX_VIEWERS; i++) {
      if (i < defaultNumViewers) {
        viewerStates.push(calculateViewerPosition(i, defaultNumViewers));
      } else {
        viewerStates.push(calculateViewerPosition(i, MAX_VIEWERS));
      }
    }

    // Export current positions for state saving
    function updateCurrentPositions() {
      window.currentViewerPositions = viewerStates.map(s => ({ x: s.x, y: s.y, z: s.z }));
    }
    updateCurrentPositions();

    function createViewerControls() {
      viewerControlsDiv.innerHTML = '';
      const num = clamp(parseInt(numViewersInput.value, 10) || 1, 1, MAX_VIEWERS);
      numViewersInput.value = num;

      for (let i = 0; i < num; i++) {
        const block = document.createElement('div');
        block.className = 'viewer-block';

        const title = document.createElement('div');
        title.className = 'viewer-title';
        title.textContent = `Viewer ${i + 1}`;
        block.appendChild(title);

        const makeSliderRow = (axis, labelText, min, max, initial) => {
          const row = document.createElement('div');
          row.className = 'row';
          const label = document.createElement('label');
          label.textContent = `${axis.toUpperCase()} (${labelText})`;
          row.appendChild(label);

          const slider = document.createElement('input');
          slider.type = 'range';
          slider.min = min;
          slider.max = max;
          slider.step = '1';
          slider.value = String(initial);
          row.appendChild(slider);

          // Add labels for min, 0, max
          const labelsDiv = document.createElement('div');
          labelsDiv.className = 'slider-labels';
          const minLabel = document.createElement('span');
          minLabel.textContent = min;
          const zeroLabel = document.createElement('span');
          zeroLabel.textContent = '0';
          const maxLabel = document.createElement('span');
          maxLabel.textContent = max;
          labelsDiv.appendChild(minLabel);
          if (min < 0 && max > 0) {
            labelsDiv.appendChild(zeroLabel);
          }
          labelsDiv.appendChild(maxLabel);
          row.appendChild(labelsDiv);

          slider.addEventListener('input', () => {
            viewerStates[i][axis] = parseFloat(slider.value);
            updateCurrentPositions();
            updateViewportLabels();
            drawScene();
          });

          return row;
        };

        block.appendChild(makeSliderRow('x', 'mm', -2000, 2000, viewerStates[i].x));
        block.appendChild(makeSliderRow('y', 'mm', -500, 500, viewerStates[i].y));
        block.appendChild(makeSliderRow('z', 'mm', 500, 3000, viewerStates[i].z));

        viewerControlsDiv.appendChild(block);
      }
    }

    function updateViewportGrid() {
      const num = clamp(parseInt(numViewersInput.value, 10) || 1, 1, MAX_VIEWERS);
      viewportGrid.innerHTML = '';
      viewportGrid.style.gridTemplateRows = `repeat(${num}, 1fr)`;

      // Create cells for the grid (2 columns x num rows)
      for (let vi = 0; vi < num; vi++) {
        for (let eye = 0; eye < 2; eye++) {
          const cell = document.createElement('div');
          cell.className = 'viewport-cell';

          const label = document.createElement('div');
          label.className = 'viewport-label';
          label.id = `viewport-label-${vi}-${eye}`;

          const viewerName = document.createElement('div');
          viewerName.className = 'viewer-name';
          viewerName.textContent = `Viewer ${vi + 1} - ${eye === 0 ? 'Left' : 'Right'}`;

          const viewerPos = document.createElement('div');
          viewerPos.className = 'viewer-pos';
          viewerPos.id = `viewport-pos-${vi}-${eye}`;
          const state = viewerStates[vi];
          const eyeOffset = eye === 0 ? -IPD_mm * 0.5 : IPD_mm * 0.5;
          const eyeX = Math.round(state.x + eyeOffset);
          viewerPos.textContent = `X:${eyeX} Y:${Math.round(state.y)} Z:${Math.round(state.z)}`;

          label.appendChild(viewerName);
          label.appendChild(viewerPos);
          cell.appendChild(label);
          viewportGrid.appendChild(cell);
        }
      }
    }

    function updateViewportLabels() {
      const num = clamp(parseInt(numViewersInput.value, 10) || 1, 1, MAX_VIEWERS);
      for (let vi = 0; vi < num; vi++) {
        for (let eye = 0; eye < 2; eye++) {
          const posLabel = document.getElementById(`viewport-pos-${vi}-${eye}`);
          if (posLabel) {
            const state = viewerStates[vi];
            const eyeOffset = eye === 0 ? -IPD_mm * 0.5 : IPD_mm * 0.5;
            const eyeX = Math.round(state.x + eyeOffset);
            posLabel.textContent = `X:${eyeX} Y:${Math.round(state.y)} Z:${Math.round(state.z)}`;
          }
        }
      }
    }

    function clamp(v, min, max) {
      return Math.max(min, Math.min(max, v));
    }

    // -------------------------------------------------------------------
    // Draw scene
    // -------------------------------------------------------------------
    function drawScene() {
      // FPS calculation
      const now = performance.now();
      const deltaTime = now - lastFrameTime;
      lastFrameTime = now;

      if (deltaTime > 0) {
        const fps = 1000 / deltaTime;
        fpsSum += fps;
        frameCount++;

        // Update FPS display every 10 frames
        if (frameCount >= 10) {
          const avgFps = fpsSum / frameCount;
          fpsDisplay.textContent = `FPS: ${Math.round(avgFps)}`;
          frameCount = 0;
          fpsSum = 0;
        }
      }

      resizeCanvas();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const num = clamp(parseInt(numViewersInput.value, 10) || 1, 1, MAX_VIEWERS);
      const fov = parseFloat(fovSlider.value);
      const N = clamp(parseInt(numViewsSlider.value, 10) || 8, 8, MAX_N);
      const slant = parseFloat(slantSlider.value);
      const resH = parseInt(resolutionHInput.value, 10) || 3840;
      const resV = Math.round(resH * 9 / 16);
      const pixelPitch = screenW_mm / resH;

      fovValueLabel.textContent = `${fov.toFixed(1)}°`;
      numViewsValueLabel.textContent = `${N}`;
      slantValueLabel.textContent = slant.toFixed(3);

      gl.uniform1f(u_screenWidthMmLoc, screenW_mm);
      gl.uniform1f(u_screenHeightMmLoc, screenH_mm);
      gl.uniform1i(u_numViewersLoc, num);
      gl.uniform1f(u_FOVdegLoc, fov);
      gl.uniform1i(u_NLoc, N);
      gl.uniform1f(u_SLLoc, slant);
      gl.uniform1f(u_pixelPitchMmLoc, pixelPitch);
      gl.uniform1i(u_resolutionHLoc, resH);
      gl.uniform1i(u_resolutionVLoc, resV);

      // Bind texture and set texture uniform
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sbsTexture);
      gl.uniform1i(u_sbsTextureLoc, 0);
      gl.uniform1i(u_useTextureLoc, useTexture ? 1 : 0);

      // flatten viewer centers into Float32Array
      const centers = new Float32Array(MAX_VIEWERS * 3);
      for (let i = 0; i < MAX_VIEWERS; i++) {
        centers[3 * i + 0] = viewerStates[i].x;
        centers[3 * i + 1] = viewerStates[i].y;
        centers[3 * i + 2] = viewerStates[i].z;
      }
      gl.uniform3fv(u_viewerCentersLoc, centers);

      const rows = num; // each viewer = one row
      const cols = 2;   // left/right eyes

      const fullW = canvas.width;
      const fullH = canvas.height;

      const cellW = fullW / cols;
      const cellH = fullH / rows;

      for (let vi = 0; vi < num; vi++) {
        for (let eye = 0; eye < 2; eye++) {
          const x = eye * cellW;
          const y = (rows - 1 - vi) * cellH; // top viewer = index 0
          gl.viewport(x, y, cellW, cellH);

          gl.uniform1i(u_currentViewerLoc, vi);
          gl.uniform1i(u_isLeftEyeLoc, eye === 0 ? 1 : 0);

          gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
      }
    }

    // -------------------------------------------------------------------
    // UI event handlers
    // -------------------------------------------------------------------
    numViewersInput.addEventListener('change', () => {
      // Reset viewer positions according to distribution formula
      const num = clamp(parseInt(numViewersInput.value, 10) || 1, 1, MAX_VIEWERS);
      for (let i = 0; i < num; i++) {
        const pos = calculateViewerPosition(i, num);
        viewerStates[i].x = pos.x;
        viewerStates[i].y = pos.y;
        viewerStates[i].z = pos.z;
      }
      updateCurrentPositions();
      createViewerControls();
      updateViewportGrid();
      drawScene();
    });

    fovSlider.addEventListener('input', drawScene);
    numViewsSlider.addEventListener('input', drawScene);
    slantSlider.addEventListener('input', drawScene);

    screenDiagonalInput.addEventListener('change', () => {
      updateScreenDimensions();
      drawScene();
    });

    resolutionHInput.addEventListener('change', () => {
      updateScreenDimensions();
      drawScene();
    });

    // SBS image loading
    sbsImageInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const img = new Image();
      img.onload = () => {
        // Downsample to render resolution for efficiency
        const resH = parseInt(resolutionHInput.value, 10) || 1600;
        const resV = Math.round(resH * 9 / 16);

        // Use SBS aspect ratio (2:1 width to height for side-by-side)
        const targetWidth = resH * 2;  // SBS is double-wide
        const targetHeight = resV;

        // Create a canvas to downsample the image
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = targetWidth;
        tempCanvas.height = targetHeight;
        const ctx = tempCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        gl.bindTexture(gl.TEXTURE_2D, sbsTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tempCanvas);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        useTexture = true;
        const imageName = file ? file.name : 'restored image';
        imageStatusLabel.textContent = `Using SBS image: ${imageName}`;

        // Save downsampled image data for version switching
        try {
          window.currentSBSImage = tempCanvas.toDataURL('image/jpeg', 0.9);
          window.currentSBSImageName = imageName;
        } catch (e) {
          console.warn('Could not save image data:', e);
        }

        drawScene();
      };
      img.src = URL.createObjectURL(file);
    });

    // Restore saved image if available
    if (window.savedSBSImage) {
      const img = new Image();
      img.onload = () => {
        const event = { target: { files: [null] } };
        // Trigger the same loading logic
        const resH = parseInt(resolutionHInput.value, 10) || 1600;
        const resV = Math.round(resH * 9 / 16);
        const targetWidth = resH * 2;
        const targetHeight = resV;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = targetWidth;
        tempCanvas.height = targetHeight;
        const ctx = tempCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        gl.bindTexture(gl.TEXTURE_2D, sbsTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tempCanvas);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        useTexture = true;
        imageStatusLabel.textContent = `Using SBS image: ${window.savedSBSImageName || 'restored'}`;

        // Save the downsampled canvas as data URL for next switch
        try {
          window.currentSBSImage = tempCanvas.toDataURL('image/jpeg', 0.9);
          window.currentSBSImageName = window.savedSBSImageName;
        } catch (e) {
          console.warn('Could not save restored image data:', e);
        }

        drawScene();
      };
      img.src = window.savedSBSImage;
    }

    clearImageButton.addEventListener('click', () => {
      useTexture = false;
      imageStatusLabel.textContent = 'Using test pattern (red/blue)';
      sbsImageInput.value = '';
      window.currentSBSImage = null;
      window.currentSBSImageName = null;
      drawScene();
    });

    // initial UI + render
    updateScreenDimensions();
    createViewerControls();
    updateViewportGrid();
    resizeCanvas();
    drawScene();
  })();
