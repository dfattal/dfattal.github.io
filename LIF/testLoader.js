// main.js

import { LifLoader } from './LifLoader.js';

document.addEventListener('DOMContentLoaded', () => {
  const filePicker = document.getElementById('filePicker');
  
  filePicker.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (file) {
      try {
        const loader = new LifLoader();
        const { views, stereo_render_data } = await loader.load(file);
        console.log('Views:', views);
        console.log('Stereo Render Data:', stereo_render_data);
        const focus = stereo_render_data.inv_convergence_distance / views[0].layers[0].invZ.min;
        console.log('Focus:', focus);
        // Now pass views and stereo_render_data to your rendering pipeline.
      } catch (error) {
        console.error('Error loading LIF:', error);
      }
    }
  });
});