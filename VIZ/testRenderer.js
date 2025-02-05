// testRenderer.js is a simple script that demonstrates how to use the MN2MNRenderer class to render LIF files.

import { LifLoader } from '../LIF/LifLoader.js';
import { MN2MNRenderer, ST2MNRenderer } from './Renderers.js'; // Assumes MN2MNRenderer (or BaseRenderer) is exported from here.

// Focal calculations
function viewportScale(iRes, oRes) {
    return Math.min(oRes.x, oRes.y) / Math.min(iRes.x, iRes.y);
}

function resizeCanvasToContainer(canvas, container, gl) {
    const displayWidth = container.clientWidth;
    const displayHeight = container.clientHeight;

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;

        // Update the WebGL viewport
        gl.viewport(0, 0, canvas.width, canvas.height);
        console.log('Resized canvas to:', canvas.width, canvas.height);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const filePicker = document.getElementById('filePicker');
    const canvas = document.getElementById('glCanvas');
    const gl = canvas.getContext('webgl');
    const container = document.getElementById('canvas-container');

    if (!gl) {
        console.error("WebGL not supported!");
        return;
    }

    window.addEventListener('resize', () => resizeCanvasToContainer(canvas, container, gl));
    resizeCanvasToContainer(canvas, container, gl);;

    let renderer = null;
    let views = null;
    let stereo_render_data = null;

    // Initialize renderer with views
    async function initRenderer(views,stereo_render_data) {
        if (views.length > 1) {
            renderer = await ST2MNRenderer.createInstance(gl, '../Shaders/rayCastStereoLDI.glsl', views, true);
        } else {
            renderer = await MN2MNRenderer.createInstance(gl, '../Shaders/rayCastMonoLDI.glsl', views, false);
        }
        
        renderer.invd = stereo_render_data ? stereo_render_data.inv_convergence_distance : 0;
        
        console.log('Renderer initialized with views:', renderer.views);
        console.log('Focus: ', renderer.invd ? renderer.invd / renderer.views[0].invZ.min : null);
    }

    let startTime = null;
    function renderLoop(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsed = (timestamp - startTime) / 1000; // seconds

        if (renderer) {
            // Oscillate renderCam.pos.x between -1 and 1 with a period of 1 sec.
            renderer.renderCam.pos.x = Math.sin(2 * Math.PI * elapsed);
            renderer.renderCam.sk.x = - renderer.renderCam.pos.x * renderer.invd / (1 - renderer.renderCam.pos.z * renderer.invd);

            // Update focal length in renderer's internal renderCam
            const vs = viewportScale(
                { x: renderer.views[0].width, y: renderer.views[0].height },
                { x: gl.canvas.width, y: gl.canvas.height }
            )
            renderer.renderCam.f = renderer.views[0].f * vs * Math.max(1 - renderer.renderCam.pos.z * renderer.invd, 0);


            renderer.drawScene();
        }
        requestAnimationFrame(renderLoop);
    }

    filePicker.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (file) {
            try {
                const loader = new LifLoader();
                await loader.load(file);

                // Retrieve processed views from LifLoader.
                views = loader.views;
                stereo_render_data = loader.stereo_render_data;

                console.log('Views:', views);
                console.log('Stereo Render Data:', stereo_render_data);

                // Initialize renderer with views.
                if (!renderer) {
                    await initRenderer(views,stereo_render_data);
                }
                // Hide the file picker after file selection
                filePicker.style.display = 'none';
            } catch (error) {
                console.error('Error loading LIF:', error);
            }
        }
    });

    requestAnimationFrame(renderLoop);
});
