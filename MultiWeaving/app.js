// app.js
(() => {
    const MAX_VIEWERS = 4;
    const MAX_N = 128;
    const IPD_mm = 60.0;

    // Scene visualization constants
    const SCENE_X_MIN = -2000;
    const SCENE_X_MAX = 2000;
    const SCENE_Z_MIN = 0;
    const SCENE_Z_MAX = 3000;
    const CANVAS_WIDTH = 800;   // 4000mm / 5mm per pixel = 800px
    const CANVAS_HEIGHT = 600;  // 3000mm / 5mm per pixel = 600px (uniform scale: 5mm/px)
    const VIEWER_COLORS = ['#ff4444', '#4488ff', '#44ff44', '#ffaa00'];

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
      uniform float u_viewerWeights[MAX_VIEWERS];
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

      // Random offset texture for fractional views
      uniform sampler2D u_ranTexture;  // per-pixel random offset

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

      // float scorefun(float h, int N) {
      //   return exp(-float(N) * abs(h));  // Simple exponential for pixel assignment
      // }

      float scorefun(float h, int N) {
        float Nf = float(N);
        return exp(-2.0 * Nf * Nf * h * h);  // Same as radfun (Gaussian)
      }

      // Alternative radfun using smooth box (could be useful later)
      // float radfun(float h, int N) {
      //   float halfN = 0.5 / float(N);
      //   return smoothbox(-halfN, halfN, halfN, h);
      // }

      float radfun(float h, int N) {
        float Nf = float(N);
        return exp(-2.0 * Nf * Nf * h * h);  // Physical radiance model
      }

      // Helper function to get viewer center by index (workaround for GLSL ES 1.0)
      vec3 getViewerCenter(int idx) {
        if (idx == 0) return u_viewerCenters[0];
        if (idx == 1) return u_viewerCenters[1];
        if (idx == 2) return u_viewerCenters[2];
        if (idx == 3) return u_viewerCenters[3];
        return u_viewerCenters[0]; // fallback
      }

      // Helper function to get viewer weight by index (workaround for GLSL ES 1.0)
      float getViewerWeight(int idx) {
        if (idx == 0) return u_viewerWeights[0];
        if (idx == 1) return u_viewerWeights[1];
        if (idx == 2) return u_viewerWeights[2];
        if (idx == 3) return u_viewerWeights[3];
        return 1.0; // fallback
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

        // Get per-pixel random offset from texture (range -0.5 to 0.5, scaled by 1/N)
        float ranOffset = (texture2D(u_ranTexture, vec2(quantizedU, quantizedV)).r - 0.5) / float(N);

        // loop over sub-elements k
        for (int k = 0; k < MAX_N; ++k) {
          if (k >= N) break;
          float v = (float(k) + 0.5) / float(N) + ranOffset;  // Add random offset

          // global pixel assignment: score-based voting across all viewers
          float scoreL = 0.0;
          float scoreR = 0.0;

          for (int vi = 0; vi < MAX_VIEWERS; ++vi) {
            if (vi >= u_numViewers) break;

            vec3 center = getViewerCenter(vi);
            float weight = getViewerWeight(vi);

            // Calculate eye positions perpendicular to viewing direction
            vec3 viewDir = -center;  // from eye to display center (at origin)
            vec3 up = vec3(0.0, 1.0, 0.0);
            vec3 right = cross(viewDir, up);
            right = normalize(right);

            vec3 LE = center - right * u_IPDmm * 0.5;
            vec3 RE = center + right * u_IPDmm * 0.5;

            float phL = phase(xy, LE, v, donopx);
            float phR = phase(xy, RE, v, donopx);

            scoreL += weight * scorefun(phL, N);
            scoreR += weight * scorefun(phR, N);
          }

          // Binary assignment based on voting
          float pixVal = (scoreR > scoreL) ? 1.0 : 0.0;

          // now phase for this viewer + this eye only
          vec3 cCenter = getViewerCenter(u_currentViewer);

          // Calculate eye position perpendicular to viewing direction
          vec3 cViewDir = -cCenter;
          vec3 cUp = vec3(0.0, 1.0, 0.0);
          vec3 cRight = cross(cViewDir, cUp);
          cRight = normalize(cRight);

          vec3 eyePos = (u_isLeftEye == 1)
            ? cCenter - cRight * u_IPDmm * 0.5
            : cCenter + cRight * u_IPDmm * 0.5;

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
    const u_viewerWeightsLoc  = gl.getUniformLocation(program, 'u_viewerWeights');
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
    const u_ranTextureLoc     = gl.getUniformLocation(program, 'u_ranTexture');

    // Create texture for SBS image
    const sbsTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, sbsTexture);
    // Create a 1x1 placeholder texture
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Create texture for random offsets (ranGrid)
    const ranTexture = gl.createTexture();
    let ranTextureWidth = 1600;  // Will be updated to match resolution
    let ranTextureHeight = 900;

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
    const deltaNSlider = document.getElementById('deltaN');
    const deltaNValueLabel = document.getElementById('deltaNValue');
    const conicKSlider = document.getElementById('conicK');
    const conicKValueLabel = document.getElementById('conicKValue');
    const screenResKInput = document.getElementById('screenResK');
    const screenDiagonalInput = document.getElementById('screenDiagonal');
    const resolutionHInput = document.getElementById('resolutionH');
    const screenDimensionsLabel = document.getElementById('screenDimensions');
    const resolutionDisplayLabel = document.getElementById('resolutionDisplay');
    const screenResDisplayLabel = document.getElementById('screenResDisplay');
    const lensHPitchLabel = document.getElementById('lensHPitch');
    const verticalResLossLabel = document.getElementById('verticalResLoss');
    const screenPixelPitchLabel = document.getElementById('screenPixelPitch');
    const lensPitchLabel = document.getElementById('lensPitch');
    const dOverNLabel = document.getElementById('dOverN');
    const radiusOfCurvatureLabel = document.getElementById('radiusOfCurvature');
    const lensHeightLabel = document.getElementById('lensHeight');
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

      // Update scene canvas to reflect new display width
      const sceneCanvas = document.getElementById('sceneCanvas');
      if (sceneCanvas) {
        drawSceneVisualization(sceneCanvas.getContext('2d'));
      }
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
      const pos = i < defaultNumViewers
        ? calculateViewerPosition(i, defaultNumViewers)
        : calculateViewerPosition(i, MAX_VIEWERS);
      viewerStates.push({ x: pos.x, y: 0, z: pos.z });  // Y always 0
    }

    // Export current positions for state saving
    function updateCurrentPositions() {
      window.currentViewerPositions = viewerStates.map(s => ({ x: s.x, y: s.y, z: s.z }));
    }
    updateCurrentPositions();

    // Viewer weighting state
    let viewerWeights = [1.0, 1.0, 1.0, 1.0];
    const CASCADE_WEIGHTS = [1000, 100, 10, 1];
    let proximityParams = { a: 1.0, b: 1.0, c: 1.0 };  // Full formula; only c exposed in UI

    // Calculate viewer weights based on current policy
    function calculateViewerWeights() {
      const policy = document.getElementById('weightingPolicy').value;
      const num = clamp(parseInt(numViewersInput.value, 10) || 1, 1, MAX_VIEWERS);

      for (let i = 0; i < MAX_VIEWERS; i++) {
        if (i >= num) {
          viewerWeights[i] = 0.0;
          continue;
        }

        switch (policy) {
          case 'equal':
            viewerWeights[i] = 1.0;
            break;
          case 'cascade':
            viewerWeights[i] = CASCADE_WEIGHTS[i];
            break;
          case 'proximity': {
            const state = viewerStates[i];
            const x_m = state.x / 1000.0;
            const y_m = state.y / 1000.0;
            const z_m = state.z / 1000.0;
            const { a, b, c } = proximityParams;
            viewerWeights[i] = Math.exp(-a*x_m*x_m - b*y_m*y_m - c*z_m*z_m);
            break;
          }
          default:
            viewerWeights[i] = 1.0;
        }
      }
    }

    // Initialize weights on startup
    calculateViewerWeights();

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

          // Add colored dot before viewer name
          const colorDot = document.createElement('span');
          colorDot.style.display = 'inline-block';
          colorDot.style.width = '8px';
          colorDot.style.height = '8px';
          colorDot.style.borderRadius = '50%';
          colorDot.style.backgroundColor = VIEWER_COLORS[vi % 4];
          colorDot.style.marginRight = '6px';
          colorDot.style.verticalAlign = 'middle';

          viewerName.appendChild(colorDot);
          viewerName.appendChild(document.createTextNode(`Viewer ${vi + 1} - ${eye === 0 ? 'Left' : 'Right'}`));

          const viewerPos = document.createElement('div');
          viewerPos.className = 'viewer-pos';
          viewerPos.id = `viewport-pos-${vi}-${eye}`;
          const state = viewerStates[vi];
          const center = [state.x, state.y, state.z];

          // Calculate eye position perpendicular to viewing direction
          const viewDir = [-center[0], -center[1], -center[2]];
          const up = [0, 1, 0];
          const right = [
            viewDir[1] * up[2] - viewDir[2] * up[1],
            viewDir[2] * up[0] - viewDir[0] * up[2],
            viewDir[0] * up[1] - viewDir[1] * up[0]
          ];
          const len = Math.sqrt(right[0]*right[0] + right[1]*right[1] + right[2]*right[2]);
          const rightNorm = [right[0]/len, right[1]/len, right[2]/len];
          const eyePos = eye === 0
            ? [center[0] - rightNorm[0] * IPD_mm * 0.5,
               center[1] - rightNorm[1] * IPD_mm * 0.5,
               center[2] - rightNorm[2] * IPD_mm * 0.5]
            : [center[0] + rightNorm[0] * IPD_mm * 0.5,
               center[1] + rightNorm[1] * IPD_mm * 0.5,
               center[2] + rightNorm[2] * IPD_mm * 0.5];

          viewerPos.textContent = `X:${Math.round(eyePos[0])} Y:${Math.round(eyePos[1])} Z:${Math.round(eyePos[2])}`;

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
            const center = [state.x, state.y, state.z];

            // Calculate eye position perpendicular to viewing direction
            const viewDir = [-center[0], -center[1], -center[2]];  // to display center at origin
            const up = [0, 1, 0];

            // Cross product: viewDir × up
            const right = [
              viewDir[1] * up[2] - viewDir[2] * up[1],
              viewDir[2] * up[0] - viewDir[0] * up[2],
              viewDir[0] * up[1] - viewDir[1] * up[0]
            ];

            // Normalize
            const len = Math.sqrt(right[0]*right[0] + right[1]*right[1] + right[2]*right[2]);
            const rightNorm = [right[0]/len, right[1]/len, right[2]/len];

            // Calculate eye position (left eye = 0, right eye = 1)
            const eyePos = eye === 0
              ? [center[0] - rightNorm[0] * IPD_mm * 0.5,
                 center[1] - rightNorm[1] * IPD_mm * 0.5,
                 center[2] - rightNorm[2] * IPD_mm * 0.5]
              : [center[0] + rightNorm[0] * IPD_mm * 0.5,
                 center[1] + rightNorm[1] * IPD_mm * 0.5,
                 center[2] + rightNorm[2] * IPD_mm * 0.5];

            posLabel.textContent = `X:${Math.round(eyePos[0])} Y:${Math.round(eyePos[1])} Z:${Math.round(eyePos[2])}`;
          }
        }
      }
    }

    function clamp(v, min, max) {
      return Math.max(min, Math.min(max, v));
    }

    // Function to generate random texture for ranGrid
    function generateRanTexture(width, height) {
      const data = new Uint8Array(width * height * 4);
      for (let i = 0; i < width * height; i++) {
        const randomValue = Math.floor(Math.random() * 256);
        data[i * 4 + 0] = randomValue;  // R channel contains random value
        data[i * 4 + 1] = randomValue;  // G (unused but same for consistency)
        data[i * 4 + 2] = randomValue;  // B (unused)
        data[i * 4 + 3] = 255;          // A
      }

      gl.bindTexture(gl.TEXTURE_2D, ranTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

      ranTextureWidth = width;
      ranTextureHeight = height;
    }

    // -------------------------------------------------------------------
    // Scene Visualization (2D Canvas for Viewer Positioning)
    // -------------------------------------------------------------------

    // Drag state for scene visualization
    let dragState = {
      isDragging: false,
      draggedViewerIndex: -1,
      hoveredViewerIndex: -1,
      dragOffsetX: 0,  // Offset from mouse to viewer center (canvas pixels)
      dragOffsetY: 0   // Offset from mouse to viewer center (canvas pixels)
    };

    // Coordinate transformation: physical mm → canvas pixels
    function physicalToCanvas(x_mm, z_mm) {
      const canvasX = ((x_mm - SCENE_X_MIN) / (SCENE_X_MAX - SCENE_X_MIN)) * CANVAS_WIDTH;
      const canvasY = ((z_mm - SCENE_Z_MIN) / (SCENE_Z_MAX - SCENE_Z_MIN)) * CANVAS_HEIGHT;
      return { x: canvasX, y: canvasY };
    }

    // Coordinate transformation: canvas pixels → physical mm
    function canvasToPhysical(canvasX, canvasY) {
      const x_mm = (canvasX / CANVAS_WIDTH) * (SCENE_X_MAX - SCENE_X_MIN) + SCENE_X_MIN;
      const z_mm = (canvasY / CANVAS_HEIGHT) * (SCENE_Z_MAX - SCENE_Z_MIN) + SCENE_Z_MIN;
      return { x: x_mm, z: z_mm };
    }

    // Helper: convert hex color to RGB
    function hexToRgb(hex) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 255, g: 255, b: 255 };
    }

    // Constrain position to valid ranges
    function constrainPosition(x_mm, z_mm) {
      const x = clamp(x_mm, SCENE_X_MIN, SCENE_X_MAX);
      const z = clamp(z_mm, SCENE_Z_MIN, SCENE_Z_MAX);
      return { x, z };
    }

    // Hit detection: find viewer at canvas point (checks head or shoulders)
    function getViewerAtPoint(canvasX, canvasY) {
      const num = clamp(parseInt(numViewersInput.value, 10) || 1, 1, MAX_VIEWERS);
      const HEAD_WIDTH_MM = 150;
      const HEAD_DEPTH_MM = 200;
      const SHOULDER_WIDTH_MM = 450;
      const SHOULDER_DEPTH_MM = 180;
      const HEAD_OFFSET_MM = 60;  // Same as in drawViewer

      // Check in reverse order (top viewer first for overlapping)
      for (let i = num - 1; i >= 0; i--) {
        const state = viewerStates[i];
        const center = [state.x, state.y, state.z];

        // Calculate offset position (same as drawing position)
        const viewDirX = -center[0];
        const viewDirZ = -center[2];
        const viewDirLen = Math.sqrt(viewDirX * viewDirX + viewDirZ * viewDirZ);
        const viewDirNormX = viewDirX / viewDirLen;
        const viewDirNormZ = viewDirZ / viewDirLen;
        const offsetX = center[0] - viewDirNormX * HEAD_OFFSET_MM;
        const offsetZ = center[2] - viewDirNormZ * HEAD_OFFSET_MM;
        const canvasPos = physicalToCanvas(offsetX, offsetZ);

        // Calculate viewing angle and rotation
        const viewAngle = Math.atan2(-center[2], -center[0]);
        const rotation = viewAngle - Math.PI / 2;

        // Transform point to local coordinate system
        const dx = canvasX - canvasPos.x;
        const dy = canvasY - canvasPos.y;

        // Rotate point by -rotation to align with ellipse axes
        const cos = Math.cos(-rotation);
        const sin = Math.sin(-rotation);
        const localX = dx * cos - dy * sin;
        const localY = dx * sin + dy * cos;

        // Check head first
        const headMinorPx = (HEAD_WIDTH_MM / 2 / (SCENE_X_MAX - SCENE_X_MIN)) * CANVAS_WIDTH;
        const headMajorPx = (HEAD_DEPTH_MM / 2 / (SCENE_X_MAX - SCENE_X_MIN)) * CANVAS_WIDTH;
        const headHit = (localX * localX) / (headMinorPx * headMinorPx) +
                        (localY * localY) / (headMajorPx * headMajorPx) <= 1;

        if (headHit) return i;

        // Check shoulders
        const shoulderMinorPx = (SHOULDER_WIDTH_MM / 2 / (SCENE_X_MAX - SCENE_X_MIN)) * CANVAS_WIDTH;
        const shoulderMajorPx = (SHOULDER_DEPTH_MM / 2 / (SCENE_X_MAX - SCENE_X_MIN)) * CANVAS_WIDTH;
        const shoulderHit = (localX * localX) / (shoulderMinorPx * shoulderMinorPx) +
                            (localY * localY) / (shoulderMajorPx * shoulderMajorPx) <= 1;

        if (shoulderHit) return i;
      }
      return -1;
    }

    // Render grid lines
    function drawGrid(ctx) {
      // Vertical lines (every 500mm in X)
      for (let x_mm = SCENE_X_MIN; x_mm <= SCENE_X_MAX; x_mm += 500) {
        const pos = physicalToCanvas(x_mm, SCENE_Z_MIN);
        const posEnd = physicalToCanvas(x_mm, SCENE_Z_MAX);

        ctx.strokeStyle = (x_mm === 0) ? 'rgba(60, 62, 70, 0.8)' : 'rgba(42, 44, 52, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(posEnd.x, posEnd.y);
        ctx.stroke();
      }

      // Horizontal lines (every 500mm in Z)
      for (let z_mm = SCENE_Z_MIN; z_mm <= SCENE_Z_MAX; z_mm += 500) {
        const pos = physicalToCanvas(SCENE_X_MIN, z_mm);
        const posEnd = physicalToCanvas(SCENE_X_MAX, z_mm);

        ctx.strokeStyle = 'rgba(42, 44, 52, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(posEnd.x, posEnd.y);
        ctx.stroke();
      }

      // Thin accent lines at X = -1m, 0m, 1m
      [-1000, 0, 1000].forEach(x_mm => {
        const pos = physicalToCanvas(x_mm, SCENE_Z_MIN);
        const posEnd = physicalToCanvas(x_mm, SCENE_Z_MAX);

        ctx.strokeStyle = (x_mm === 0) ? 'rgba(100, 100, 110, 0.6)' : 'rgba(80, 80, 90, 0.4)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(posEnd.x, posEnd.y);
        ctx.stroke();
      });

      // Thin accent lines at Z = 1m, 2m, 3m
      [1000, 2000, 3000].forEach(z_mm => {
        const pos = physicalToCanvas(SCENE_X_MIN, z_mm);
        const posEnd = physicalToCanvas(SCENE_X_MAX, z_mm);

        ctx.strokeStyle = 'rgba(80, 80, 90, 0.4)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(posEnd.x, posEnd.y);
        ctx.stroke();
      });
    }

    // Render display rectangle
    function drawDisplay(ctx) {
      const leftEdge = physicalToCanvas(-screenW_mm / 2, 0);
      const rightEdge = physicalToCanvas(screenW_mm / 2, 20);  // 20mm thick

      const width = rightEdge.x - leftEdge.x;
      const height = rightEdge.y - leftEdge.y;

      // Fill
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.fillRect(leftEdge.x, leftEdge.y, width, height);

      // Stroke
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(leftEdge.x, leftEdge.y, width, height);
    }

    // Render FOV cone from display center
    function drawFOV(ctx) {
      const fov = parseFloat(fovSlider.value);
      const halfFovRad = (fov / 2) * Math.PI / 180;

      // Display center in canvas coordinates
      const displayCenter = physicalToCanvas(0, 0);

      // Calculate end points for FOV lines extending to edge of scene
      const fovLineLength = 3500;  // Extend beyond SCENE_Z_MAX

      // Left FOV line (negative X direction)
      const leftX = -Math.sin(halfFovRad) * fovLineLength;
      const leftZ = Math.cos(halfFovRad) * fovLineLength;
      const leftEnd = physicalToCanvas(leftX, leftZ);

      // Right FOV line (positive X direction)
      const rightX = Math.sin(halfFovRad) * fovLineLength;
      const rightZ = Math.cos(halfFovRad) * fovLineLength;
      const rightEnd = physicalToCanvas(rightX, rightZ);

      // Draw FOV lines
      ctx.strokeStyle = 'rgba(100, 255, 100, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      // Left line
      ctx.beginPath();
      ctx.moveTo(displayCenter.x, displayCenter.y);
      ctx.lineTo(leftEnd.x, leftEnd.y);
      ctx.stroke();

      // Right line
      ctx.beginPath();
      ctx.moveTo(displayCenter.x, displayCenter.y);
      ctx.lineTo(rightEnd.x, rightEnd.y);
      ctx.stroke();

      ctx.setLineDash([]);
    }

    // Draw proximity weight contours (ellipses in XZ plane)
    function drawProximityContours(ctx) {
      const policy = document.getElementById('weightingPolicy').value;
      if (policy !== 'proximity') return;

      const { a, b, c } = proximityParams;
      if (a < 0.01 || c < 0.01) return; // Skip if parameters too small

      // Contour levels passing through (0,0,1m) and (0,0,2m)
      const w1 = Math.exp(-c * 1.0);
      const w2 = Math.exp(-c * 4.0);

      const contourLevels = [w2, w1];
      const contourColors = [
        'rgba(255, 200, 100, 0.4)',
        'rgba(255, 200, 100, 0.7)'
      ];

      ctx.save();

      contourLevels.forEach((w_level, idx) => {
        const k = -Math.log(w_level);
        if (k <= 0) return;

        // Ellipse radii: a*(x/1000)² + c*(z/1000)² = k
        const rx_mm = 1000 * Math.sqrt(k / a);
        const rz_mm = 1000 * Math.sqrt(k / c);

        const center = physicalToCanvas(0, 0);
        const rx_px = (rx_mm / (SCENE_X_MAX - SCENE_X_MIN)) * CANVAS_WIDTH;
        const rz_px = (rz_mm / (SCENE_Z_MAX - SCENE_Z_MIN)) * CANVAS_HEIGHT;

        ctx.beginPath();
        ctx.ellipse(center.x, center.y, rx_px, rz_px, 0, 0, Math.PI * 2);
        ctx.strokeStyle = contourColors[idx];
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      ctx.restore();
    }

    // Render one viewer with head and shoulders
    function drawViewer(ctx, viewerIndex, isHovered, isDragging) {
      const state = viewerStates[viewerIndex];
      const center = [state.x, state.y, state.z];

      // Realistic human dimensions
      const HEAD_WIDTH_MM = 150;      // ear to ear
      const HEAD_DEPTH_MM = 200;      // front to back
      const SHOULDER_WIDTH_MM = 450;  // shoulder to shoulder
      const SHOULDER_DEPTH_MM = 180;  // chest depth

      // Calculate viewing direction angle for rotation
      const viewAngle = Math.atan2(-center[2], -center[0]);
      const rotation = viewAngle - Math.PI / 2;  // Align major axis with viewing direction

      // Offset head/shoulders away from screen so eyes appear in front
      const HEAD_OFFSET_MM = 60;  // Offset to position eyes slightly inside head
      const viewDirX = -center[0];
      const viewDirZ = -center[2];
      const viewDirLen = Math.sqrt(viewDirX * viewDirX + viewDirZ * viewDirZ);
      const viewDirNormX = viewDirX / viewDirLen;
      const viewDirNormZ = viewDirZ / viewDirLen;

      // Calculate offset position (away from screen)
      const offsetX = center[0] - viewDirNormX * HEAD_OFFSET_MM;
      const offsetZ = center[2] - viewDirNormZ * HEAD_OFFSET_MM;
      const pos = physicalToCanvas(offsetX, offsetZ);

      // Color
      const color = VIEWER_COLORS[viewerIndex % 4];
      const rgb = hexToRgb(color);

      // Opacity based on state
      let alpha = 0.5;
      if (isDragging) alpha = 0.85;
      else if (isHovered) alpha = 0.7;

      // Draw shoulders first (behind head)
      const shoulderMinorPx = (SHOULDER_WIDTH_MM / 2 / (SCENE_X_MAX - SCENE_X_MIN)) * CANVAS_WIDTH;
      const shoulderMajorPx = (SHOULDER_DEPTH_MM / 2 / (SCENE_X_MAX - SCENE_X_MIN)) * CANVAS_WIDTH;

      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y, shoulderMinorPx, shoulderMajorPx, rotation, 0, Math.PI * 2);

      // Shoulders with lower opacity
      ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha * 0.3})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Draw head on top
      const headMinorPx = (HEAD_WIDTH_MM / 2 / (SCENE_X_MAX - SCENE_X_MIN)) * CANVAS_WIDTH;
      const headMajorPx = (HEAD_DEPTH_MM / 2 / (SCENE_X_MAX - SCENE_X_MIN)) * CANVAS_WIDTH;

      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y, headMinorPx, headMajorPx, rotation, 0, Math.PI * 2);

      // Fill with alpha
      ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
      ctx.fill();

      // Stroke (brighter)
      ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.9)`;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label positioned along viewing direction line (beside head, away from screen)
      const LABEL_OFFSET_MM = 280;  // Distance from eye center away from screen

      // Calculate label position in physical coordinates (opposite direction - away from screen)
      const labelPhysicalX = center[0] - viewDirNormX * LABEL_OFFSET_MM;
      const labelPhysicalZ = center[2] - viewDirNormZ * LABEL_OFFSET_MM;

      // Convert to canvas coordinates
      const labelPos = physicalToCanvas(labelPhysicalX, labelPhysicalZ);

      // Draw label with background for better visibility
      const labelText = String(viewerIndex + 1);
      ctx.font = 'bold 16px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Measure text for background
      const textMetrics = ctx.measureText(labelText);
      const textWidth = textMetrics.width;
      const textHeight = 16;
      const padding = 4;

      // Draw background circle
      const bgRadius = Math.max(textWidth, textHeight) / 2 + padding;
      ctx.beginPath();
      ctx.arc(labelPos.x, labelPos.y, bgRadius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.9)`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Draw text
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 2;
      ctx.fillText(labelText, labelPos.x, labelPos.y);
      ctx.shadowBlur = 0;
    }

    // Render eye subcircles for one viewer
    function drawEyes(ctx, viewerIndex) {
      const state = viewerStates[viewerIndex];
      const center = [state.x, state.y, state.z];

      // Calculate eye positions (same logic as in shader and updateViewportLabels)
      const viewDir = [-center[0], -center[1], -center[2]];
      const up = [0, 1, 0];
      const right = [
        viewDir[1] * up[2] - viewDir[2] * up[1],
        viewDir[2] * up[0] - viewDir[0] * up[2],
        viewDir[0] * up[1] - viewDir[1] * up[0]
      ];
      const len = Math.sqrt(right[0]*right[0] + right[1]*right[1] + right[2]*right[2]);
      const rightNorm = [right[0]/len, right[1]/len, right[2]/len];

      const leftEye = [
        center[0] - rightNorm[0] * IPD_mm * 0.5,
        center[1] - rightNorm[1] * IPD_mm * 0.5,
        center[2] - rightNorm[2] * IPD_mm * 0.5
      ];
      const rightEye = [
        center[0] + rightNorm[0] * IPD_mm * 0.5,
        center[1] + rightNorm[1] * IPD_mm * 0.5,
        center[2] + rightNorm[2] * IPD_mm * 0.5
      ];

      // DEBUG: Draw lines to verify perpendicularity
      const screenCenter = physicalToCanvas(0, 0);
      const centerPos = physicalToCanvas(center[0], center[2]);
      const leftEyePos = physicalToCanvas(leftEye[0], leftEye[2]);
      const rightEyePos = physicalToCanvas(rightEye[0], rightEye[2]);

      const viewerColor = VIEWER_COLORS[viewerIndex % 4];

      // Draw viewing direction line (from screen to viewer center)
      ctx.strokeStyle = `${viewerColor}40`;  // Very transparent
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(screenCenter.x, screenCenter.y);
      ctx.lineTo(centerPos.x, centerPos.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw eye vector line (between eyes)
      ctx.strokeStyle = `${viewerColor}60`;  // Slightly more visible
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(leftEyePos.x, leftEyePos.y);
      ctx.lineTo(rightEyePos.x, rightEyePos.y);
      ctx.stroke();

      // Draw both eyes (only X and Z matter for 2D canvas)
      const EYE_RADIUS_MM = 17.5;  // 35mm diameter / 2
      const eyeRadiusPixels = (EYE_RADIUS_MM / (SCENE_X_MAX - SCENE_X_MIN)) * CANVAS_WIDTH;

      [leftEye, rightEye].forEach((eye) => {
        const eyePos = physicalToCanvas(eye[0], eye[2]);  // Note: eye[2] is Z

        ctx.beginPath();
        ctx.arc(eyePos.x, eyePos.y, eyeRadiusPixels, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fill();
        ctx.strokeStyle = viewerColor;
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // DEBUG: Print perpendicularity and IPD check for viewer 0
      if (viewerIndex === 0) {
        // View direction (in XZ plane): from origin to center
        const viewDirXZ = [center[0], center[2]];
        // Eye vector (in XZ plane): from left to right eye
        const eyeVecXZ = [rightEye[0] - leftEye[0], rightEye[2] - leftEye[2]];
        // Dot product should be 0 if perpendicular
        const dotProduct = viewDirXZ[0] * eyeVecXZ[0] + viewDirXZ[1] * eyeVecXZ[1];
        // Calculate actual IPD distance (should be 60mm)
        const actualIPD = Math.sqrt(
          Math.pow(rightEye[0] - leftEye[0], 2) +
          Math.pow(rightEye[1] - leftEye[1], 2) +
          Math.pow(rightEye[2] - leftEye[2], 2)
        );
        console.log(`Viewer ${viewerIndex + 1}: IPD=${actualIPD.toFixed(1)}mm (expected: ${IPD_mm}mm), perpendicularity dot=${dotProduct.toFixed(2)}`);
      }
    }

    // Main scene visualization render function
    function drawSceneVisualization(ctx) {
      const canvas = ctx.canvas;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Layer 1: Grid
      drawGrid(ctx);

      // Layer 2: FOV cone
      drawFOV(ctx);

      // Layer 2.5: Proximity contours
      drawProximityContours(ctx);

      // Layer 3: Display rectangle
      drawDisplay(ctx);

      // Layer 4: Viewers and eyes
      const num = clamp(parseInt(numViewersInput.value, 10) || 1, 1, MAX_VIEWERS);
      for (let i = 0; i < num; i++) {
        const isHovered = (dragState.hoveredViewerIndex === i && !dragState.isDragging);
        const isDragging = (dragState.draggedViewerIndex === i && dragState.isDragging);
        drawViewer(ctx, i, isHovered, isDragging);
        drawEyes(ctx, i);
      }
    }

    // Event handlers for drag interaction
    function handleMouseDown(event) {
      const canvas = event.target;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const canvasX = (event.clientX - rect.left) * scaleX;
      const canvasY = (event.clientY - rect.top) * scaleY;

      const viewerIndex = getViewerAtPoint(canvasX, canvasY);
      if (viewerIndex !== -1) {
        // Calculate offset between click position and viewer's eye center
        const state = viewerStates[viewerIndex];
        const viewerCanvasPos = physicalToCanvas(state.x, state.z);

        dragState.isDragging = true;
        dragState.draggedViewerIndex = viewerIndex;
        dragState.dragOffsetX = viewerCanvasPos.x - canvasX;
        dragState.dragOffsetY = viewerCanvasPos.y - canvasY;
        canvas.style.cursor = 'grabbing';
        drawSceneVisualization(canvas.getContext('2d'));
      }
    }

    function handleMouseMove(event) {
      const canvas = event.target;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const canvasX = (event.clientX - rect.left) * scaleX;
      const canvasY = (event.clientY - rect.top) * scaleY;

      if (dragState.isDragging) {
        // Apply the offset to maintain relative position from initial click
        const adjustedCanvasX = canvasX + dragState.dragOffsetX;
        const adjustedCanvasY = canvasY + dragState.dragOffsetY;
        const physical = canvasToPhysical(adjustedCanvasX, adjustedCanvasY);
        const constrained = constrainPosition(physical.x, physical.z);

        viewerStates[dragState.draggedViewerIndex].x = constrained.x;
        viewerStates[dragState.draggedViewerIndex].y = 0;  // Always 0
        viewerStates[dragState.draggedViewerIndex].z = constrained.z;

        // Update displays
        updateCurrentPositions();
        calculateViewerWeights();  // Recalculate weights for proximity policy
        updateViewportLabels();
        drawSceneVisualization(canvas.getContext('2d'));
        drawScene();
      } else {
        // Hover detection
        const viewerIndex = getViewerAtPoint(canvasX, canvasY);
        if (viewerIndex !== dragState.hoveredViewerIndex) {
          dragState.hoveredViewerIndex = viewerIndex;
          canvas.style.cursor = (viewerIndex !== -1) ? 'grab' : 'default';
          drawSceneVisualization(canvas.getContext('2d'));
        }
      }
    }

    function handleMouseUp(event) {
      if (dragState.isDragging) {
        dragState.isDragging = false;
        dragState.draggedViewerIndex = -1;
        event.target.style.cursor = (dragState.hoveredViewerIndex !== -1) ? 'grab' : 'default';
        updateCurrentPositions();
        drawSceneVisualization(event.target.getContext('2d'));
      }
    }

    function handleMouseLeave(event) {
      if (dragState.isDragging) {
        handleMouseUp(event);
      }
      dragState.hoveredViewerIndex = -1;
      event.target.style.cursor = 'default';
      drawSceneVisualization(event.target.getContext('2d'));
    }

    // Set up drag interaction
    function setupDragInteraction(canvas, ctx) {
      canvas.addEventListener('mousedown', handleMouseDown);
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('mouseup', handleMouseUp);
      canvas.addEventListener('mouseleave', handleMouseLeave);
    }

    // Initialize scene visualization
    function initSceneVisualization() {
      const sceneCanvas = document.getElementById('sceneCanvas');
      if (!sceneCanvas) {
        console.error('Scene canvas not found');
        return;
      }

      const ctx = sceneCanvas.getContext('2d');

      // Set up drag state and event listeners
      setupDragInteraction(sceneCanvas, ctx);

      // Initial render
      drawSceneVisualization(ctx);
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

      // Regenerate random texture if resolution changed
      if (ranTextureWidth !== resH || ranTextureHeight !== resV) {
        generateRanTexture(resH, resV);
      }

      fovValueLabel.textContent = `${fov.toFixed(1)}°`;
      numViewsValueLabel.textContent = `${N}`;
      slantValueLabel.textContent = slant.toFixed(3);

      // Validate px * sl range
      const px = N * slant;  // lens horizontal pitch (pixels)
      const pxTimesSlant = Math.abs(px * slant);
      const isOutOfRange = pxTimesSlant > 1.5 || pxTimesSlant < (2/3);

      // Apply red color if out of range
      if (isOutOfRange) {
        numViewsValueLabel.style.color = '#ff4444';
        slantValueLabel.style.color = '#ff4444';
        lensHPitchLabel.style.color = '#ff4444';
        verticalResLossLabel.style.color = '#ff4444';
      } else {
        numViewsValueLabel.style.color = '';
        slantValueLabel.style.color = '';
        lensHPitchLabel.style.color = '';
        verticalResLossLabel.style.color = '';
      }

      // Get lens optics parameters
      const deltaN = parseFloat(deltaNSlider.value);
      const conicK = parseFloat(conicKSlider.value);
      const screenResK = parseInt(screenResKInput.value, 10);

      // Update value displays
      deltaNValueLabel.textContent = deltaN.toFixed(3);
      conicKValueLabel.textContent = conicK.toFixed(2);

      // Compute lens optics parameters
      const screenResHorizontal = screenResK * 960;  // e.g., 8k -> 7680px
      const screenResVertical = Math.round(screenResHorizontal * 9 / 16);
      const donopx = 0.5 / Math.tan((fov / 2) * Math.PI / 180);
      // px already computed above for validation
      const delta_mm = screenW_mm / screenResHorizontal;       // screen pixel pitch (mm)
      const p_mm = px * delta_mm / Math.sqrt(1 + slant * slant);  // lens pitch (mm)
      const don_mm = donopx * px * delta_mm;                   // d_over_n (mm)
      const roc = don_mm * deltaN;                             // radius of curvature (mm)
      const lensHeight_mm = (p_mm/2) * (p_mm/2) / (roc + Math.sqrt(roc*roc - (conicK+1)*(p_mm/2)*(p_mm/2)));

      // Update lens optics display
      const verticalResLoss = 1 / slant;  // Vertical resolution loss in pixels
      screenResDisplayLabel.textContent = `${screenResK}k (${screenResHorizontal} × ${screenResVertical} px)`;
      lensHPitchLabel.textContent = `${px.toFixed(3)} px`;
      verticalResLossLabel.textContent = `${verticalResLoss.toFixed(3)} px`;
      screenPixelPitchLabel.textContent = `${delta_mm.toFixed(6)} mm`;
      lensPitchLabel.textContent = `${p_mm.toFixed(6)} mm`;
      dOverNLabel.textContent = `${don_mm.toFixed(6)} mm`;
      radiusOfCurvatureLabel.textContent = `${roc.toFixed(6)} mm`;
      lensHeightLabel.textContent = `${lensHeight_mm.toFixed(6)} mm`;

      // Update proximity parameter value display
      document.getElementById('proximityCValue').textContent = proximityParams.c.toFixed(2);

      gl.uniform1f(u_screenWidthMmLoc, screenW_mm);
      gl.uniform1f(u_screenHeightMmLoc, screenH_mm);
      gl.uniform1i(u_numViewersLoc, num);
      gl.uniform1f(u_FOVdegLoc, fov);
      gl.uniform1i(u_NLoc, N);
      gl.uniform1f(u_SLLoc, slant);
      gl.uniform1f(u_pixelPitchMmLoc, pixelPitch);
      gl.uniform1i(u_resolutionHLoc, resH);
      gl.uniform1i(u_resolutionVLoc, resV);

      // Bind textures
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sbsTexture);
      gl.uniform1i(u_sbsTextureLoc, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, ranTexture);
      gl.uniform1i(u_ranTextureLoc, 1);

      gl.uniform1i(u_useTextureLoc, useTexture ? 1 : 0);

      // flatten viewer centers into Float32Array
      const centers = new Float32Array(MAX_VIEWERS * 3);
      for (let i = 0; i < MAX_VIEWERS; i++) {
        centers[3 * i + 0] = viewerStates[i].x;
        centers[3 * i + 1] = viewerStates[i].y;
        centers[3 * i + 2] = viewerStates[i].z;
      }
      gl.uniform3fv(u_viewerCentersLoc, centers);

      // Pass viewer weights to shader
      gl.uniform1fv(u_viewerWeightsLoc, new Float32Array(viewerWeights));

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
        viewerStates[i].y = 0;  // Always 0
        viewerStates[i].z = pos.z;
      }
      updateCurrentPositions();
      calculateViewerWeights();  // Recalculate weights when viewer count changes
      const sceneCanvas = document.getElementById('sceneCanvas');
      if (sceneCanvas) {
        drawSceneVisualization(sceneCanvas.getContext('2d'));
      }
      updateViewportGrid();
      drawScene();
    });

    fovSlider.addEventListener('input', () => {
      const sceneCanvas = document.getElementById('sceneCanvas');
      if (sceneCanvas) {
        drawSceneVisualization(sceneCanvas.getContext('2d'));
      }
      drawScene();
    });
    numViewsSlider.addEventListener('input', drawScene);
    slantSlider.addEventListener('input', drawScene);
    deltaNSlider.addEventListener('input', drawScene);
    conicKSlider.addEventListener('input', drawScene);
    screenResKInput.addEventListener('change', drawScene);

    // Weighting policy event handlers
    const weightingPolicySelect = document.getElementById('weightingPolicy');
    const proximityControlsDiv = document.getElementById('proximityControls');

    weightingPolicySelect.addEventListener('change', () => {
      const policy = weightingPolicySelect.value;
      proximityControlsDiv.style.display = (policy === 'proximity') ? 'block' : 'none';
      calculateViewerWeights();
      const sceneCanvas = document.getElementById('sceneCanvas');
      if (sceneCanvas) {
        drawSceneVisualization(sceneCanvas.getContext('2d'));
      }
      drawScene();
    });

    // Proximity parameter slider (only C / z-axis)
    const proximityCSlider = document.getElementById('proximityC');
    const proximityCLabel = document.getElementById('proximityCValue');

    proximityCSlider.addEventListener('input', () => {
      proximityParams.c = parseFloat(proximityCSlider.value);
      proximityCLabel.textContent = proximityCSlider.value;
      calculateViewerWeights();
      const sceneCanvas = document.getElementById('sceneCanvas');
      if (sceneCanvas) {
        drawSceneVisualization(sceneCanvas.getContext('2d'));
      }
      drawScene();
    });

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
    initSceneVisualization();
    updateViewportGrid();
    resizeCanvas();

    // Generate initial random texture
    const resH = parseInt(resolutionHInput.value, 10) || 1600;
    const resV = Math.round(resH * 9 / 16);
    generateRanTexture(resH, resV);

    drawScene();
  })();
