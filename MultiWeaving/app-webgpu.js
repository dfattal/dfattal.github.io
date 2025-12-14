// app-webgpu.js - WebGPU version
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
    // WebGPU setup
    // -------------------------------------------------------------------
    const canvas = document.getElementById('glcanvas');
    let device, context, pipeline;
    let uniformBuffers = [];
    let bindGroups = [];
    let viewerStatesBuffer;
    let sbsTextureView;
    let sbsSampler;
    let ranTextureView;
    let ranSampler;
    let ranTextureWidth = 1600;
    let ranTextureHeight = 900;
    let useTexture = false;

    async function initWebGPU() {
      if (!navigator.gpu) {
        alert('WebGPU not supported in this browser.');
        return false;
      }

      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        alert('No appropriate GPUAdapter found.');
        return false;
      }

      device = await adapter.requestDevice();
      context = canvas.getContext('webgpu');

      const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
      context.configure({
        device,
        format: presentationFormat,
        alphaMode: 'opaque',
      });

      // Create shaders
      const shaderModule = device.createShaderModule({
        code: `
          struct Uniforms {
            screenWidthMm: f32,
            screenHeightMm: f32,
            numViewers: i32,
            IPDmm: f32,
            FOVdeg: f32,
            N: i32,
            currentViewer: i32,
            isLeftEye: i32,
            SL: f32,
            pixelPitchMm: f32,
            resolutionH: i32,
            resolutionV: i32,
            useTexture: i32,
            _padding: i32,  // padding to 64 bytes
          }

          struct ViewerStates {
            positions: array<vec4<f32>, ${MAX_VIEWERS}>,
            weights: array<f32, ${MAX_VIEWERS}>,
          }

          @group(0) @binding(0) var<uniform> uniforms: Uniforms;
          @group(0) @binding(1) var<uniform> viewerStates: ViewerStates;
          @group(0) @binding(2) var sbsTexture: texture_2d<f32>;
          @group(0) @binding(3) var sbsSampler: sampler;
          @group(0) @binding(4) var ranTexture: texture_2d<f32>;
          @group(0) @binding(5) var ranSampler: sampler;

          struct VertexOutput {
            @builtin(position) position: vec4<f32>,
            @location(0) uv: vec2<f32>,
          }

          @vertex
          fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
            var pos = array<vec2<f32>, 6>(
              vec2<f32>(-1.0, -1.0),
              vec2<f32>(1.0, -1.0),
              vec2<f32>(-1.0, 1.0),
              vec2<f32>(-1.0, 1.0),
              vec2<f32>(1.0, -1.0),
              vec2<f32>(1.0, 1.0)
            );

            var output: VertexOutput;
            output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
            output.uv = (pos[vertexIndex] + 1.0) * 0.5;
            return output;
          }

          const NREFR: f32 = 1.6;

          fn phase(xy: vec2<f32>, eyePos: vec3<f32>, v: f32, donopx: f32) -> f32 {
            let xo = xy.x;
            let yo = xy.y;
            let vx = eyePos.x;
            let vy = eyePos.y;
            let vz = eyePos.z;

            let dx = (vx - xo) / vz;
            let dy = (vy - yo) / vz;

            let denom = sqrt(1.0 + (1.0 - 1.0/(NREFR*NREFR)) * (dx*dx + dy*dy));
            let raw = v + donopx * (dx + uniforms.SL * dy) / denom;
            let m = raw - floor(raw);
            return m - 0.5;
          }

          // Helper functions for pixel assignment and radiance
          fn t(x1: f32, x2: f32, x: f32) -> f32 {
            return clamp((x - x1) / (x2 - x1), 0.0, 1.0);
          }

          fn smoothstep_custom(x1: f32, x2: f32, x: f32) -> f32 {
            let t_val = t(x1, x2, x);
            return t_val * t_val * (3.0 - 2.0 * t_val);
          }

          fn smoothbox(x1: f32, x2: f32, sm: f32, x: f32) -> f32 {
            return smoothstep_custom(x1 - sm, x1 + sm, x) * (1.0 - smoothstep_custom(x2 - sm, x2 + sm, x));
          }

          // fn scorefun(h: f32, N: i32) -> f32 {
          //   return exp(-f32(N) * abs(h));  // Simple exponential for pixel assignment
          // }

          fn scorefun(h: f32, N: i32) -> f32 {
            let Nf = f32(N);
            return exp(-2.0 * Nf * Nf * h * h);  // Same as radfun (Gaussian)
          }

          // Alternative radfun using smooth box (could be useful later)
          // fn radfun_smoothbox(h: f32, N: i32) -> f32 {
          //   let halfN = 0.5 / f32(N);
          //   return smoothbox(-halfN, halfN, halfN, h);
          // }

          fn radfun(h: f32, N: i32) -> f32 {
            let Nf = f32(N);
            return exp(-2.0 * Nf * Nf * h * h);  // Physical radiance model
          }

          @fragment
          fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
            // Quantize UV coordinates to pixel grid to simulate actual resolution
            let pixelX = floor(input.uv.x * f32(uniforms.resolutionH)) + 0.5;
            let pixelY = floor(input.uv.y * f32(uniforms.resolutionV)) + 0.5;
            let quantizedU = pixelX / f32(uniforms.resolutionH);
            let quantizedV = pixelY / f32(uniforms.resolutionV);

            // Convert quantized uv to physical mm (origin at center, +y up)
            let xo = (quantizedU - 0.5) * uniforms.screenWidthMm;
            let yo = (0.5 - quantizedV) * uniforms.screenHeightMm;
            let xy = vec2<f32>(xo, yo);

            let donopx = 0.5 / tan(radians(uniforms.FOVdeg * 0.5));

            var redAccum: f32 = 0.0;
            var greenAccum: f32 = 0.0;
            var blueAccum: f32 = 0.0;
            var weightSum: f32 = 0.0;

            let N = min(uniforms.N, ${MAX_N});

            // Get per-pixel random offset from texture (range -0.5 to 0.5, scaled by 1/N)
            let ranOffset = (textureSample(ranTexture, ranSampler, vec2<f32>(quantizedU, quantizedV)).r - 0.5) / f32(N);

            for (var k: i32 = 0; k < ${MAX_N}; k = k + 1) {
              if (k >= N) { break; }
              let v = (f32(k) + 0.5) / f32(N) + ranOffset;  // Add random offset

              var scoreL: f32 = 0.0;
              var scoreR: f32 = 0.0;

              for (var vi: i32 = 0; vi < ${MAX_VIEWERS}; vi = vi + 1) {
                if (vi >= uniforms.numViewers) { break; }

                let center = viewerStates.positions[vi].xyz;
                let weight = viewerStates.weights[vi];

                // Calculate eye positions perpendicular to viewing direction
                let viewDir = -center;  // from eye to display center (at origin)
                let up = vec3<f32>(0.0, 1.0, 0.0);
                let right = cross(viewDir, up);
                let rightNorm = normalize(right);

                let LE = center - rightNorm * uniforms.IPDmm * 0.5;
                let RE = center + rightNorm * uniforms.IPDmm * 0.5;

                let phL = phase(xy, LE, v, donopx);
                let phR = phase(xy, RE, v, donopx);

                scoreL += weight * scorefun(phL, N);
                scoreR += weight * scorefun(phR, N);
              }

              // Binary pixel assignment based on voting
              let pixVal = select(0.0, 1.0, scoreR > scoreL);

              let cCenter = viewerStates.positions[uniforms.currentViewer].xyz;

              // Calculate eye position perpendicular to viewing direction
              let cViewDir = -cCenter;
              let cUp = vec3<f32>(0.0, 1.0, 0.0);
              let cRight = cross(cViewDir, cUp);
              let cRightNorm = normalize(cRight);

              let eyePos = select(
                cCenter + cRightNorm * uniforms.IPDmm * 0.5,
                cCenter - cRightNorm * uniforms.IPDmm * 0.5,
                uniforms.isLeftEye == 1
              );

              let h = phase(xy, eyePos, v, donopx);
              let w = radfun(h, N);  // Use physical radiance model

              if (uniforms.useTexture == 1) {
                // Sample from SBS texture (flip V coordinate to fix y-flip)
                // Left image: left half of texture (u: 0 to 0.5)
                // Right image: right half of texture (u: 0.5 to 1.0)
                let leftUV = vec2<f32>(quantizedU * 0.5, 1.0 - quantizedV);
                let rightUV = vec2<f32>(quantizedU * 0.5 + 0.5, 1.0 - quantizedV);

                var leftColor = textureSample(sbsTexture, sbsSampler, leftUV).rgb;
                var rightColor = textureSample(sbsTexture, sbsSampler, rightUV).rgb;

                // Convert from gamma to linear space (approximate: square the values)
                leftColor = leftColor * leftColor;
                rightColor = rightColor * rightColor;

                // Use full RGB: blend left and right colors based on pixVal
                redAccum = redAccum + w * (pixVal * rightColor.r + (1.0 - pixVal) * leftColor.r);
                greenAccum = greenAccum + w * (pixVal * rightColor.g + (1.0 - pixVal) * leftColor.g);
                blueAccum = blueAccum + w * (pixVal * rightColor.b + (1.0 - pixVal) * leftColor.b);
                weightSum = weightSum + w;
              } else {
                // Test pattern: red for right, blue for left
                redAccum = redAccum + w * pixVal;
                blueAccum = blueAccum + w * (1.0 - pixVal);
                weightSum = weightSum + w;
              }
            }

            // Normalize by sum of weights (better for texture mode)
            if (uniforms.useTexture == 1 && weightSum > 0.0) {
              redAccum = redAccum / weightSum;
              greenAccum = greenAccum / weightSum;
              blueAccum = blueAccum / weightSum;
            } else {
              // Test pattern: normalize by max value
              let maxVal = max(max(redAccum, greenAccum), blueAccum);
              if (maxVal > 0.0) {
                redAccum = redAccum / maxVal;
                greenAccum = greenAccum / maxVal;
                blueAccum = blueAccum / maxVal;
              }
            }

            let r = sqrt(clamp(redAccum, 0.0, 1.0));
            let g = sqrt(clamp(greenAccum, 0.0, 1.0));
            let b = sqrt(clamp(blueAccum, 0.0, 1.0));

            return vec4<f32>(r, g, b, 1.0);
          }
        `
      });

      // Create pipeline
      pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
          module: shaderModule,
          entryPoint: 'vertexMain',
        },
        fragment: {
          module: shaderModule,
          entryPoint: 'fragmentMain',
          targets: [{
            format: presentationFormat,
          }],
        },
        primitive: {
          topology: 'triangle-list',
        },
      });

      // Create viewer states buffer (shared across all viewports)
      const viewerStatesBufferSize = MAX_VIEWERS * 16 + MAX_VIEWERS * 4; // positions + weights (80 bytes)
      viewerStatesBuffer = device.createBuffer({
        size: viewerStatesBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      // Create SBS texture (1x1 placeholder initially)
      const sbsTexture = device.createTexture({
        size: { width: 1, height: 1 },
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });

      sbsSampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
      });

      sbsTextureView = sbsTexture.createView();

      // Create random offset texture (ranGrid)
      const ranTexture = device.createTexture({
        size: { width: 1, height: 1 },
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });

      ranSampler = device.createSampler({
        magFilter: 'nearest',
        minFilter: 'nearest',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
      });

      ranTextureView = ranTexture.createView();

      // Create uniform buffers and bind groups for each viewport (MAX_VIEWERS × 2 eyes)
      const uniformBufferSize = 68; // Aligned size for the uniform struct (added useTexture + padding)
      for (let vi = 0; vi < MAX_VIEWERS; vi++) {
        for (let eye = 0; eye < 2; eye++) {
          const uniformBuffer = device.createBuffer({
            size: uniformBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          });
          uniformBuffers.push(uniformBuffer);

          const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
              {
                binding: 0,
                resource: {
                  buffer: uniformBuffer,
                },
              },
              {
                binding: 1,
                resource: {
                  buffer: viewerStatesBuffer,
                },
              },
              {
                binding: 2,
                resource: sbsTextureView,
              },
              {
                binding: 3,
                resource: sbsSampler,
              },
              {
                binding: 4,
                resource: ranTextureView,
              },
              {
                binding: 5,
                resource: ranSampler,
              },
            ],
          });
          bindGroups.push(bindGroup);
        }
      }

      return true;
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

      const newRanTexture = device.createTexture({
        size: { width, height },
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });

      device.queue.writeTexture(
        { texture: newRanTexture },
        data,
        {
          offset: 0,
          bytesPerRow: width * 4,
          rowsPerImage: height
        },
        { width, height, depthOrArrayLayers: 1 }
      );

      ranTextureView = newRanTexture.createView();
      ranTextureWidth = width;
      ranTextureHeight = height;

      // Recreate bind groups with new ranTexture
      bindGroups = [];
      for (let vi = 0; vi < MAX_VIEWERS; vi++) {
        for (let eye = 0; eye < 2; eye++) {
          const bufferIndex = vi * 2 + eye;
          const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: { buffer: uniformBuffers[bufferIndex] } },
              { binding: 1, resource: { buffer: viewerStatesBuffer } },
              { binding: 2, resource: sbsTextureView },
              { binding: 3, resource: sbsSampler },
              { binding: 4, resource: ranTextureView },
              { binding: 5, resource: ranSampler },
            ],
          });
          bindGroups.push(bindGroup);
        }
      }
    }

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

    // -------------------------------------------------------------------
    // Scene visualization functions
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
      if (!device || !pipeline) return;

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

      // Update proximity parameter value display
      document.getElementById('proximityCValue').textContent = proximityParams.c.toFixed(2);

      // Update viewer states buffer (shared)
      const viewerData = new Float32Array(MAX_VIEWERS * 4 + MAX_VIEWERS);
      for (let i = 0; i < MAX_VIEWERS; i++) {
        viewerData[i * 4 + 0] = viewerStates[i].x;
        viewerData[i * 4 + 1] = viewerStates[i].y;
        viewerData[i * 4 + 2] = viewerStates[i].z;
        viewerData[i * 4 + 3] = 0; // padding
      }
      // Append weights after positions
      for (let i = 0; i < MAX_VIEWERS; i++) {
        viewerData[MAX_VIEWERS * 4 + i] = viewerWeights[i];
      }
      device.queue.writeBuffer(viewerStatesBuffer, 0, viewerData);

      // Update all uniform buffers BEFORE encoding commands
      for (let vi = 0; vi < MAX_VIEWERS; vi++) {
        for (let eye = 0; eye < 2; eye++) {
          // Create buffer with proper types (mix of f32 and i32)
          const buffer = new ArrayBuffer(68);
          const floatView = new Float32Array(buffer);
          const intView = new Int32Array(buffer);

          floatView[0] = screenW_mm;        // f32
          floatView[1] = screenH_mm;        // f32
          intView[2] = num;                 // i32
          floatView[3] = IPD_mm;            // f32
          floatView[4] = fov;               // f32
          intView[5] = N;                   // i32
          intView[6] = vi;                  // i32 currentViewer
          intView[7] = eye === 0 ? 1 : 0;   // i32 isLeftEye
          floatView[8] = slant;             // f32
          floatView[9] = pixelPitch;        // f32 pixelPitchMm
          intView[10] = resH;               // i32 resolutionH
          intView[11] = resV;               // i32 resolutionV
          intView[12] = useTexture ? 1 : 0; // i32 useTexture
          intView[13] = 0;                  // i32 padding
          // [14-16] remain 0 (padding to 68 bytes)

          const bufferIndex = vi * 2 + eye;
          device.queue.writeBuffer(uniformBuffers[bufferIndex], 0, buffer);
        }
      }

      const rows = num;
      const cols = 2;
      const fullW = canvas.width;
      const fullH = canvas.height;
      const cellW = Math.floor(fullW / cols);
      const cellH = Math.floor(fullH / rows);

      // Now encode all render passes
      const commandEncoder = device.createCommandEncoder();
      const textureView = context.getCurrentTexture().createView();

      for (let vi = 0; vi < num; vi++) {
        for (let eye = 0; eye < 2; eye++) {
          const x = eye * cellW;
          const y = vi * cellH; // WebGPU uses top-left origin (unlike WebGL's bottom-left)

          const renderPassDescriptor = {
            colorAttachments: [{
              view: textureView,
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
              loadOp: vi === 0 && eye === 0 ? 'clear' : 'load',
              storeOp: 'store',
            }],
          };

          const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
          passEncoder.setPipeline(pipeline);

          // Use the correct bind group for this viewport
          const bufferIndex = vi * 2 + eye;
          passEncoder.setBindGroup(0, bindGroups[bufferIndex]);

          passEncoder.setViewport(x, y, cellW, cellH, 0, 1);
          passEncoder.setScissorRect(x, y, cellW, cellH);
          passEncoder.draw(6, 1, 0, 0);
          passEncoder.end();
        }
      }

      device.queue.submit([commandEncoder.finish()]);
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
        // Downsample to render resolution to avoid texture size limits
        const resH = parseInt(resolutionHInput.value, 10) || 1600;
        const resV = Math.round(resH * 9 / 16);

        // Use SBS aspect ratio (2:1 width to height for side-by-side)
        const targetWidth = resH * 2;  // SBS is double-wide
        const targetHeight = resV;

        // Create a canvas to downsample the image
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = targetWidth;
        tempCanvas.height = targetHeight;
        const ctx = tempCanvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);

        // Create new texture with downsampled dimensions
        const newTexture = device.createTexture({
          size: { width: targetWidth, height: targetHeight },
          format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });

        // Write image data to texture
        device.queue.writeTexture(
          { texture: newTexture },
          imageData.data,
          {
            offset: 0,
            bytesPerRow: targetWidth * 4,
            rowsPerImage: targetHeight
          },
          { width: targetWidth, height: targetHeight, depthOrArrayLayers: 1 }
        );

        // Update texture view
        sbsTextureView = newTexture.createView();

        // Recreate bind groups with new texture
        bindGroups = [];
        for (let vi = 0; vi < MAX_VIEWERS; vi++) {
          for (let eye = 0; eye < 2; eye++) {
            const bufferIndex = vi * 2 + eye;
            const bindGroup = device.createBindGroup({
              layout: pipeline.getBindGroupLayout(0),
              entries: [
                {
                  binding: 0,
                  resource: { buffer: uniformBuffers[bufferIndex] },
                },
                {
                  binding: 1,
                  resource: { buffer: viewerStatesBuffer },
                },
                {
                  binding: 2,
                  resource: sbsTextureView,
                },
                {
                  binding: 3,
                  resource: sbsSampler,
                },
                {
                  binding: 4,
                  resource: ranTextureView,
                },
                {
                  binding: 5,
                  resource: ranSampler,
                },
              ],
            });
            bindGroups.push(bindGroup);
          }
        }

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
      img.onload = async () => {
        const resH = parseInt(resolutionHInput.value, 10) || 1600;
        const resV = Math.round(resH * 9 / 16);
        const targetWidth = resH * 2;
        const targetHeight = resV;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = targetWidth;
        tempCanvas.height = targetHeight;
        const ctx = tempCanvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);

        const newTexture = device.createTexture({
          size: { width: targetWidth, height: targetHeight },
          format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });

        device.queue.writeTexture(
          { texture: newTexture },
          imageData.data,
          {
            offset: 0,
            bytesPerRow: targetWidth * 4,
            rowsPerImage: targetHeight
          },
          { width: targetWidth, height: targetHeight, depthOrArrayLayers: 1 }
        );

        sbsTextureView = newTexture.createView();

        // Recreate bind groups with new texture
        bindGroups = [];
        for (let vi = 0; vi < MAX_VIEWERS; vi++) {
          for (let eye = 0; eye < 2; eye++) {
            const bufferIndex = vi * 2 + eye;
            const bindGroup = device.createBindGroup({
              layout: pipeline.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: { buffer: uniformBuffers[bufferIndex] } },
                { binding: 1, resource: { buffer: viewerStatesBuffer } },
                { binding: 2, resource: sbsTextureView },
                { binding: 3, resource: sbsSampler },
                { binding: 4, resource: ranTextureView },
                { binding: 5, resource: ranSampler },
              ],
            });
            bindGroups.push(bindGroup);
          }
        }

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

    // Initialize
    updateScreenDimensions();
    initWebGPU().then(success => {
      if (success) {
        initSceneVisualization();
        updateViewportGrid();
        resizeCanvas();

        // Generate initial random texture
        const resH = parseInt(resolutionHInput.value, 10) || 1600;
        const resV = Math.round(resH * 9 / 16);
        generateRanTexture(resH, resV);

        drawScene();
      }
    });
  })();
