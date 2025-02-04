// testRenderer.js is a simple script that demonstrates how to use the MN2MNRenderer class to render LIF files.

import { LifLoader } from '../LIF/LifLoader.js';
import { MN2MNRenderer } from './Renderers.js'; // Assumes MN2MNRenderer (or BaseRenderer) is exported from here.

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
    resizeCanvasToContainer(canvas, container, gl);

    const fragmentShaderUrl = '../Shaders/rayCastMonoLDI.glsl';

    let renderer = null;
    let views = null;
    let stereo_render_data = null;

    // Initialize renderer with views
    async function initRenderer(views) {
        renderer = await MN2MNRenderer.createInstance(gl, fragmentShaderUrl, views);
        console.log('Renderer initialized with views:', renderer.views);
    }

    let startTime = null;
    function renderLoop(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsed = (timestamp - startTime) / 1000; // seconds

        if (renderer) {
            // Oscillate renderCam.pos.x between -1 and 1 with a period of 1 sec.
            renderer.renderCam.pos.x = Math.sin(2 * Math.PI * elapsed);


            // Update focal length in renderer's internal renderCam
            renderer.renderCam.f = renderer.views[0].f * viewportScale(
                { x: renderer.views[0].width, y: renderer.views[0].height },
                { x: gl.canvas.width, y: gl.canvas.height }
            );


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
                views = loader.getViews();
                stereo_render_data = loader.getStereoRenderData();

                console.log('Views:', views);
                console.log('Stereo Render Data:', stereo_render_data);

                // Calculate focus (for logging/demo purposes).
                const focus = stereo_render_data.inv_convergence_distance / views[0].layers_top_to_bottom[0].inv_z_map.min;
                console.log('Focus:', focus);

                // Initialize renderer with views.
                if (!renderer) {
                    await initRenderer(views);
                }
            } catch (error) {
                console.error('Error loading LIF:', error);
            }
        }
    });

    requestAnimationFrame(renderLoop);
});
