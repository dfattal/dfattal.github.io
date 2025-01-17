class PointCloudRenderer {
    constructor(canvas, view, viewR) {
      this.gl = canvas.getContext('webgl2');
      if (!this.gl) {
        console.error('Cannot get webgl2 context. Was webgl1 context requested previously?');
        return;
      }
      this.canvas = canvas;
      this.view = view;
      const gl = this.gl;
      console.log(view['layers']);
      const colorImages = view['layers'].map(v => v['image']['texture']);
      const depthImages = view['layers'].map(v => v['invZ']['texture']);
      if (viewR) {
        viewR['layers'].map(v => colorImages.push(v['image']['texture']));
        viewR['layers'].map(v => depthImages.push(v['invZ']['texture']));
      }
      console.log(colorImages);
      console.log(depthImages);
      const topLayer = colorImages[0]; // to use as reference size of the layer to create points and textures
    
      canvas.style.background = '#000'; // essential otherwise rendering won't work properly

      // preserving aspect ratio of the image
      const topLevelImage = view['image']['texture'];
      let aspectRatio = topLevelImage.width / topLevelImage.height;
      let containerWidth = canvas.parentElement.clientWidth;

      // Now hardcoding canvas size and point cloud width, because rendering gets displaced and/or disintegrated 
      // with other aspect ratios (other than 1.6) and with some small canvas sizes. Something was broken, possibly around texture scaling factors.
      const hardcodedCanvasWidth = 1280; // this is changeable, values between 1200 and 1600 seem to work fine
      canvas.style.width = hardcodedCanvasWidth + 'px';
      canvas.style.height = (hardcodedCanvasWidth/1.6) + 'px';

      const layerAspectRatio = topLayer.width / topLayer.height;
      const pointCloudWidth = hardcodedCanvasWidth; // note: this doesn't determine point count, see pointStep below
      const pointCloudHeight = hardcodedCanvasWidth / layerAspectRatio;
      const layerToPointsScale = topLayer.width / pointCloudWidth;
      
      const pointStep = 8;
      // The larger the point step, the less points produced (but less accuracy and more artifacts with strong parallax).
      // Usually something between 5 and 15 works well. Larger number can possibly make this run faster on weak devices.
      // Smaller number is less blurrier and handles larger parallax better, too small number reveals holes in the point-cloud.

      // for rendering textured points
      const program = this.compileShaderProgram(this.getVertexShader(), this.getFragmentShader());
    
      const attributes = {
          position: gl.getAttribLocation(program, 'a_position'),
          uv: gl.getAttribLocation(program, 'a_uv')
      };
      const uniforms = {
          mvp: gl.getUniformLocation(program, 'u_mvp'),
          colorTexture: gl.getUniformLocation(program, 'u_colorTexture'), // Color textures
          depthTexture: gl.getUniformLocation(program, 'u_depthTexture'), // Depth textures
          anim: gl.getUniformLocation(program, 'anim'),
          layerCount: gl.getUniformLocation(program, 'layerCount'),
          aspectRatio: gl.getUniformLocation(program, 'aspectRatio'),
          density: gl.getUniformLocation(program, 'density'), // from point step
          density2: gl.getUniformLocation(program, 'density2') // from canvas size
      };

      // for blending L & R views:
      const blendProgram = this.compileShaderProgram(this.getBlendVertexShader(), this.getBlendFragmentShader());
    
      const blendAttributes = {
          position: gl.getAttribLocation(blendProgram, 'a_position'),
          uv: gl.getAttribLocation(blendProgram, 'a_uv')
      };
      const blendUniforms = {
          textureL: gl.getUniformLocation(blendProgram, 'u_textureL'),
          textureR: gl.getUniformLocation(blendProgram, 'u_textureR'),
          mixFactor: gl.getUniformLocation(blendProgram, 'u_mixFactor'),
      };

      // for full-screen quad to show blended views:
      const quadVertices = new Float32Array([ -1, 1, 1, 1, -1, -1, 1, -1 ]);
      const quadUVs = new Float32Array([ 0, 1, 1, 1, 0, 0, 1, 0 ]);
      const quadVertexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadVertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
      const quadUVBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadUVBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, quadUVs, gl.STATIC_DRAW);

      // to store point data extracted from layers
      const points = [];
      const pointsR = [];
  
      // read depth data to layersDepth array
      const layersDepth = [];
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = depthImages[0].width;
      tempCanvas.height = depthImages[0].height;
      console.log(depthImages[0].width);
      const ctx = tempCanvas.getContext('2d');
      for (let i = 0; i < depthImages.length; i++) {
          const depthImage = depthImages[i];
          ctx.clearRect(0, 0, depthImage.width, depthImage.height);
          ctx.putImageData(depthImage, 0, 0);
          const depthImageData = ctx.getImageData(0, 0, depthImage.width, depthImage.height);
          layersDepth.push(depthImageData);
      }
  
      const layerCount = view['layers'].length;
    
      const f_px = view['f'];
      const max = view.layers[0]['invZ']['min']; // swapping min and max, because further code requires mathematically minimal and maximal values
      const min = view.layers[0]['invZ']['max'] + 0.00001; // avoid division by zero
    
      const f_scaling = (view.width / view.layers[0].width); // estimating outpainting
    
      // Populate points array
      let views = [ view ];
      if (viewR) views.push(viewR);

      let pointsArr = [ points ];
      if (viewR) pointsArr.push(pointsR);

      for (let vi = 0; vi < views.length; vi++) {
        const v = views[vi];
        console.log(v);
        for (let i = 0; i < layerCount; i++) {
          const max = v.layers[i]['invZ']['min']; // swapping min and max, because further code requires mathematically minimal and maximal values
          const min = v.layers[i]['invZ']['max'];
          
          //const f_px = view['f'];
          console.log(v.layers[i]);
          const f_px = v.layers[i]['f'] * (f_scaling);
          console.log({i,min,max,f_px});
        
          for (let y = pointStep; y < pointCloudHeight-pointStep; y+=pointStep) {
            for (let x = pointStep; x < pointCloudWidth-pointStep; x+=pointStep) {
                    const lx = Math.floor(x * layerToPointsScale + 0.5);
                    const ly = Math.floor(y * layerToPointsScale + 0.5);
                    const ti = vi * layerCount + i;
                    const index = (ly * layersDepth[ti].width + lx) * 4; // RGBA
                    const alpha = layersDepth[ti].data[index + 3];
                    if (alpha == 0) continue; // skip empty points
                    const depth = layersDepth[ti].data[index] / 255.0; // Normalize to 0..1
                    const invDepth = depth * (max - min) + min;
      
                    // placing points at their actual position in 3D scene
                    const z = 1 / invDepth;
                    const x_c = ((x - pointCloudWidth / 2) / (f_px/layerToPointsScale)) * z;
                    const y_c = ((pointCloudHeight - y - 1 - pointCloudHeight / 2) / (f_px/layerToPointsScale)) * z;

                    pointsArr[vi].push({
                            pos: [ x_c + v.position.x, y_c + v.position.y, -z ],
                            uv:  [ x / pointCloudWidth, y / pointCloudHeight, ti ],
                            depth: -z });
                }
            }
        }
      }

      console.log(points.length);
      console.log(pointsR.length);
    
      pointsArr.map(p => p.sort((a, b) => a.depth - b.depth)); // Sort descending by depth. 
      // This works for back-to-front sorting when camera is in front of the scene
      // there are 5 other ways to sort. To make camera orbiting possible, 
      // all 6 arrays must be prepared and swapped during orbiting
      // best is to use 6 quads not points but it's only makes sense for travel in scene.
    
      const sortedPoints = points.map(p => p.pos).flat();
      const sortedPointsR = pointsR.map(p => p.pos).flat();
    
      const positionBuffer = gl.createBuffer(); // buffer for points
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sortedPoints), gl.STATIC_DRAW);

      const uvBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points.map(p => p.uv).flat()), gl.STATIC_DRAW);

      const positionBufferR = gl.createBuffer(); // buffer for points
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBufferR);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sortedPointsR), gl.STATIC_DRAW);

      const uvBufferR = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, uvBufferR);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pointsR.map(p => p.uv).flat()), gl.STATIC_DRAW);
    
      const colorTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, colorTexture);
      const colorImageWidth = colorImages[0].width; // assuming all sizes are same
      const colorImageHeight = colorImages[0].height;
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, colorImageWidth, colorImageHeight, colorImages.length);
      for (let i = 0; i < colorImages.length; i++) {
          gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, colorImageWidth, colorImageHeight, 1, gl.RGBA, gl.UNSIGNED_BYTE, colorImages[i]);
      }
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    
      const depthTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, depthTexture);
      const depthImageWidth = depthImages[0].width; // assuming all sizes are same
      const depthImageHeight = depthImages[0].height;
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, depthImageWidth, depthImageHeight, depthImages.length);
      for (let i = 0; i < depthImages.length; i++) {
          gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, depthImageWidth, depthImageHeight, 1, gl.RGBA, gl.UNSIGNED_BYTE, depthImages[i]);
      }
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    
      gl.clearColor(0.0, 0.0, 0.0, 1.0);
      gl.useProgram(program);
    
      // essential setup for this kind of rendering (disable depth test, enable blending):
      gl.enable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      // Create the framebuffer for the left view
      const framebufferL = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebufferL);

      const textureL = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, textureL);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, pointCloudWidth, pointCloudHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      // Attach the texture to the framebuffer
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textureL, 0);

      // Repeat the same for the right view
      const framebufferR = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebufferR);
      const textureR = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, textureR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, pointCloudWidth, pointCloudHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      // Attach the texture to the framebuffer
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textureR, 0);
   
      const pMatrix = mat4.create(); // projection
      const vMatrix = mat4.create(); // view
      const mvpMatrix = mat4.create(); // model view projection
      gl.uniform1i(uniforms.layerCount, layerCount);
      const instance = this;

      const isStereo = viewR;

      function drawPointCloud(renderCam) {
          const gl = instance.gl;
          const canvas = instance.canvas;
          const cameraPosition = { x: renderCam.pos.x, y: renderCam.pos.y, z: renderCam.pos.z };
          const skewX = renderCam.sk.x;
          const skewY = renderCam.sk.y;

          const focal_scaling = renderCam.f / (f_px / layerToPointsScale); // point size depends on focal too

          mat4.lookAt(vMatrix, 
            [cameraPosition.x, -cameraPosition.y, -cameraPosition.z], // camera pos. inverting y to match direction in preset.html
            [cameraPosition.x, -cameraPosition.y, -cameraPosition.z - 1], // look target. here same as pos but shifted in z direction, that means looking straight
            [0.0, 1.0, 0.0]); // up-vector
    
          if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
          }
          mat4.perspective(pMatrix, 2.0 * Math.atan(pointCloudHeight / (2 * renderCam.f)), canvas.width / canvas.height, 0.001, 1/min+1000);
    
          vMatrix[8] = skewX;
          vMatrix[9] = -skewY;
          
          mat4.identity(mvpMatrix);
          mat4.multiply(mvpMatrix, pMatrix, vMatrix);
          gl.useProgram(program);
          gl.uniformMatrix4fv(uniforms.mvp, false, mvpMatrix);
    
          const densityCalibrationWidth = 1280;
          const densityCalibrationPointStep = 8;
          const density = focal_scaling * (canvas.width / densityCalibrationWidth) * (pointStep / densityCalibrationPointStep) / f_scaling;
          const density2 = (pointStep / densityCalibrationPointStep);
          gl.uniform1f(uniforms.density, density); // density affects point size
          gl.uniform1f(uniforms.density2, density2); // density2 affects texture coordinate scale within each point
          gl.uniform1f(uniforms.aspectRatio, aspectRatio);

          // textures - common for both views
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D_ARRAY, colorTexture);
          gl.uniform1i(uniforms.colorTexture, 0);
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D_ARRAY, depthTexture);
          gl.uniform1i(uniforms.depthTexture, 1);

          if (isStereo) {
            // left view to left framebuffer
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebufferL);
            gl.viewport(0, 0, canvas.width, canvas.height); // ?
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
            gl.vertexAttribPointer(attributes.position, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(attributes.position);
            gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
            gl.vertexAttribPointer(attributes.uv, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(attributes.uv);
            gl.drawArrays(gl.POINTS, 0, points.length);
            // same but using framebufferR, positionBufferR, uvBufferR, and pointsR.length
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebufferR);
            gl.viewport(0, 0, canvas.width, canvas.height); // ?
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBufferR);
            gl.vertexAttribPointer(attributes.position, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(attributes.position);
            gl.bindBuffer(gl.ARRAY_BUFFER, uvBufferR);
            gl.vertexAttribPointer(attributes.uv, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(attributes.uv);
            gl.drawArrays(gl.POINTS, 0, pointsR.length);
            // final blending pass
            // Use a shader program that blends the two textures
            gl.useProgram(blendProgram);
            // Switch to the default framebuffer (the screen)
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            // Set up the uniform for each texture
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, textureL);  // Left view texture
            gl.uniform1i(blendUniforms.textureL, 0);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, textureR);  // Right view texture
            gl.uniform1i(blendUniforms.textureR, 1);

            // L-R blending
            const mixFactor = 0.5 * Math.min(1, Math.max(-1, 4.0 * cameraPosition.x)) + 0.5;

            gl.uniform1f(blendUniforms.mixFactor, mixFactor);
            // Draw a quad that covers the screen (use full-screen quad vertices)
            // Set up the attribute pointers for position and UV
            gl.bindBuffer(gl.ARRAY_BUFFER, quadVertexBuffer);
            gl.vertexAttribPointer(blendAttributes.position, 2, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(blendAttributes.position);
            gl.bindBuffer(gl.ARRAY_BUFFER, quadUVBuffer);
            gl.vertexAttribPointer(blendAttributes.uv, 2, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(blendAttributes.uv);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          } else {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
            gl.vertexAttribPointer(attributes.position, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(attributes.position);
            gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
            gl.vertexAttribPointer(attributes.uv, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(attributes.uv);
            gl.drawArrays(gl.POINTS, 0, points.length);
          }
      }
      this.drawPointCloud = drawPointCloud;
    }
    render(renderCam) {
      if (this.drawPointCloud) {
        this.drawPointCloud(renderCam);
      } else {
        console.log('renderer not ready');
      }
    }
    getVertexShader() {
      return `#version 300 es
      precision highp float;
      precision highp sampler2DArray;
      uniform mat4 u_mvp;
      uniform sampler2DArray u_colorTexture;
      uniform sampler2DArray u_depthTexture;
      uniform float anim;
      uniform float density;
      uniform highp int layerCount;
      in vec3 a_position;
      in vec3 a_uv;
      out vec3 v_uv;
      out float v_grad;
      void main(void) {
          float textureIndex = a_uv.z;
          int viewIndex = int(textureIndex) / layerCount; // 0 - left, 1 - right
          float grad = texture(u_depthTexture, vec3(a_uv.xy - vec2(.00125,0), textureIndex)).r;
          grad -= texture(u_depthTexture, vec3(a_uv.xy + vec2(.00125,0), textureIndex)).r;
          grad = abs(grad);
          float vgrad = texture(u_depthTexture, vec3(a_uv.xy - vec2(0,.00125), textureIndex)).r;
          vgrad -= texture(u_depthTexture, vec3(a_uv.xy + vec2(0,.00125), textureIndex)).r;
          vgrad = abs(vgrad);
          grad = max(grad, vgrad);
          grad = sqrt(grad); // grad affects detected "walls" appearance: point size and opacity
          v_grad = (1.0 - min(1.0, grad)); // for passing to fragment shader to control opacity
          vec3 position = a_position;
          gl_Position = u_mvp * vec4(position, 1.0);
          v_uv = vec3(a_uv.xy, textureIndex);
          float d = abs(position.z / gl_Position.w);
          gl_PointSize = density * max(0.0, min(128.0, 32.0 * d + grad * 40.0));
      }`
    }
    
    getFragmentShader() {
      return `#version 300 es
      precision highp float;
      precision highp sampler2DArray;
      in vec3 v_uv;
      uniform sampler2DArray u_colorTexture;
      uniform sampler2DArray u_depthTexture;
      uniform float density;
      uniform float density2;
      uniform float aspectRatio;
      uniform highp int layerCount;
      in float v_grad;
      out vec4 fragColor;

      float taper(vec2 uv) {
        return smoothstep(0.0, 0.1, uv.x) * (1.0 - smoothstep(0.9, 1.0, uv.x)) * smoothstep(0.0, 0.1, uv.y) * (1.0 - smoothstep(0.9, 1.0, uv.y));
      }

      float corner(vec2 uv) {
        return taper(uv) + 0.1 * (1.0 - taper(uv));
      }

      void main(void) {
          vec2 pc = (gl_PointCoord - 0.5) * 2.0; // coord within point +/- 1
          float v_tex_scale = density2 * 0.021; // TODO: find reason for this magic number
          float h_tex_scale = density2 * 0.021 / aspectRatio;
          vec3 coord = vec3(v_uv.xy + vec2(h_tex_scale, v_tex_scale) * pc, v_uv.z);
          vec4 color = texture(u_colorTexture, coord); // texture for point
          float dist = 1.0 - sqrt(pc.x * pc.x + pc.y * pc.y);
          fragColor = vec4(color.rgb, color.a * dist * v_grad);
          fragColor.a *= corner(coord.xy); // attempt to smooth the corners but it doesn't work like with raycasting because points overlap
          //fragColor.a = 1.0; // debug
      }`
    }
    getBlendVertexShader() {
      return `#version 300 es
      precision highp float;
      in vec2 a_position;
      in vec2 a_uv;
      out vec2 v_uv;
      void main() {
          gl_Position = vec4(a_position, 0.0, 1.0);
          v_uv = a_uv;
      }
      `;
    }
    getBlendFragmentShader() {
      return `#version 300 es
      precision highp float;
      uniform sampler2D u_textureL;
      uniform sampler2D u_textureR;
      uniform float u_mixFactor;
      in vec2 v_uv;
      out vec4 fragColor;
      void main() {
          vec4 leftColor = texture(u_textureL, v_uv);
          vec4 rightColor = texture(u_textureR, v_uv);
          fragColor = mix(leftColor, rightColor, u_mixFactor);
          fragColor.a = 1.0;
      }
      `;
    }
    compileShaderProgram(vertexSource, fragmentSource) {
      const gl = this.gl;
      const vertexShader = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vertexShader, vertexSource);
      gl.compileShader(vertexShader);
      if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
          console.error(gl.getShaderInfoLog(vertexShader));
      }
    
      const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fragmentShader, fragmentSource);
      gl.compileShader(fragmentShader);
      if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
          console.error(gl.getShaderInfoLog(fragmentShader));
      }
    
      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);

      return program;
    }
  }

// same function but no createTexture call and image gets same alpha masking as depthmap
  async function parseObjectAndCreateTexturesForPointCloud(obj, debugTexture) {
    for (let key in obj) {
      if (obj.hasOwnProperty(key)) {
        if (key === 'image') {
          try {
            const img = await loadImage2(obj[key].url);
            if (obj.hasOwnProperty('mask')) {
              const maskImg = await loadImage2(obj['mask'].url);
              const maskedImg = create4ChannelImage(img, maskImg);
              obj[key]['texture'] = maskedImg;
              debugTexture(maskedImg);
            } else {
              obj[key]['texture'] = img; // note, color must have smooth mask
              debugTexture(img);
            }
          } catch (error) {
            console.error('Error loading image:', error);
          }
        } else if (key === 'invZ' && obj.hasOwnProperty('mask')) {
          try {
            const maskImg = await loadImage2(obj['mask'].url);
            const invzImg = await loadImage2(obj['invZ'].url);
            const maskedInvz = create4ChannelImage(invzImg, maskImg);
            obj['invZ']['texture'] = maskedInvz;
            debugTexture(maskedInvz);
          } catch (error) {
            console.error('Error loading mask or invz image:', error);
          }
        } else if (key === 'invZ') { // no mask
          try {
            const invzImg = await loadImage2(obj['invZ'].url);
            obj['invZ']['texture'] = invzImg;
          } catch (error) {
            console.error('Error loading invz image:', error);
          }

        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          // Recursively parse nested objects
          await parseObjectAndCreateTexturesForPointCloud(obj[key], debugTexture);
        }
      }
    }
  }