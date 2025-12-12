// app-webgpu.js - WebGPU version
(() => {
    const MAX_VIEWERS = 4;
    const MAX_N = 128;
    const IPD_mm = 60.0;

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
          }

          @group(0) @binding(0) var<uniform> uniforms: Uniforms;
          @group(0) @binding(1) var<uniform> viewerStates: ViewerStates;
          @group(0) @binding(2) var sbsTexture: texture_2d<f32>;
          @group(0) @binding(3) var sbsSampler: sampler;

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

            for (var k: i32 = 0; k < ${MAX_N}; k = k + 1) {
              if (k >= N) { break; }
              let v = (f32(k) + 0.5) / f32(N);

              var sumL: f32 = 0.0;
              var sumR: f32 = 0.0;

              for (var vi: i32 = 0; vi < ${MAX_VIEWERS}; vi = vi + 1) {
                if (vi >= uniforms.numViewers) { break; }

                let center = viewerStates.positions[vi].xyz;
                let LE = center + vec3<f32>(-uniforms.IPDmm * 0.5, 0.0, 0.0);
                let RE = center + vec3<f32>(uniforms.IPDmm * 0.5, 0.0, 0.0);

                let phL = phase(xy, LE, v, donopx);
                let phR = phase(xy, RE, v, donopx);

                sumL += exp(-f32(N*N) * phL * phL);
                sumR += exp(-f32(N*N) * phR * phR);
              }

              let denom = sumL + sumR;
              let pixVal = select(0.0, sumR / denom, denom > 0.0);

              let cCenter = viewerStates.positions[uniforms.currentViewer].xyz;
              let eyePos = select(
                cCenter + vec3<f32>(uniforms.IPDmm * 0.5, 0.0, 0.0),
                cCenter + vec3<f32>(-uniforms.IPDmm * 0.5, 0.0, 0.0),
                uniforms.isLeftEye == 1
              );

              let h = phase(xy, eyePos, v, donopx);
              let w = exp(-f32(N*N) * h * h);

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
      const viewerStatesBufferSize = MAX_VIEWERS * 16; // vec4<f32> for each viewer
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
            ],
          });
          bindGroups.push(bindGroup);
        }
      }

      return true;
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

      fovValueLabel.textContent = `${fov.toFixed(1)}°`;
      numViewsValueLabel.textContent = `${N}`;
      slantValueLabel.textContent = slant.toFixed(3);

      // Update viewer states buffer (shared)
      const viewerData = new Float32Array(MAX_VIEWERS * 4);
      for (let i = 0; i < MAX_VIEWERS; i++) {
        viewerData[i * 4 + 0] = viewerStates[i].x;
        viewerData[i * 4 + 1] = viewerStates[i].y;
        viewerData[i * 4 + 2] = viewerStates[i].z;
        viewerData[i * 4 + 3] = 0; // padding
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
        createViewerControls();
        updateViewportGrid();
        resizeCanvas();
        drawScene();
      }
    });
  })();
