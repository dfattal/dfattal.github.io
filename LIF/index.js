// Add file picker event listener
const filePicker = document.getElementById('filePicker');
filePicker.addEventListener('change', handleFileSelect, false);

const logContainer = document.getElementById('log');
logContainer.textContent = "";

function mylog(msg) {
    logContainer.textContent += msg + "\n";
    console.log(msg);
}

let lifInfo;
const viewDiv = document.getElementById('views_div');

function create4ChannelImage(rgbImage, maskImage) {

    const width = rgbImage.width;
    const height = rgbImage.height;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    // Pass { willReadFrequently: true } to optimize for frequent read operations
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Draw the RGB image
    ctx.drawImage(rgbImage, 0, 0, width, height);
    const rgbData = ctx.getImageData(0, 0, width, height).data;

    // Draw the mask image
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(maskImage, 0, 0, width, height);
    const maskData = ctx.getImageData(0, 0, width, height).data;

    // Create a new image data object for the 4-channel image
    const combinedData = ctx.createImageData(width, height);
    for (let i = 0; i < rgbData.length / 4; i++) {
        combinedData.data[i * 4] = rgbData[i * 4];
        combinedData.data[i * 4 + 1] = rgbData[i * 4 + 1];
        combinedData.data[i * 4 + 2] = rgbData[i * 4 + 2];
        combinedData.data[i * 4 + 3] = maskData[i * 4]; // Use the red channel of the mask image for the alpha channel
    }

    // Put the 4-channel image data back onto the canvas
    ctx.putImageData(combinedData, 0, 0);

    // Return the canvas as an image source (data URL)
    return canvas.toDataURL();
}

async function loadImage2(url) { // without cache busting
    const img = new Image();
    img.crossOrigin = "anonymous"; // Set cross-origin attribute
    img.src = url;
    return new Promise((resolve) => {
        img.onload = () => resolve(img);
    });
}

async function handleFileSelect(event) {

    const file = event.target.files[0];
    if (file) {
        logContainer.textContent = '';
        viewDiv.innerHTML = '';
        lifInfo = await parseLif53(file);
        console.log(lifInfo);
        const views = lifInfo.views;
        mylog(`LIF Encoder: ${lifInfo.encoder} -- ${views.length} view${views.length > 1 ? 's' : ''}`);

        for (const [index, view] of views.entries()) {
            const viewDOM = document.createElement('div');
            viewDOM.className = 'view';
            const mainImg = document.createElement('img');
            mainImg.className = 'main_img';
            mainImg.src = view.image.url;
            const dispImg = document.createElement('img');
            dispImg.className = 'main_img';
            dispImg.src = view.inv_z_map.url;
            const layers = view.layers_top_to_bottom;
            const title = `View ${index} | ${view.width_px} x ${view.height_px} | f: ${view.focal_px.toFixed(0)} | x: ${view.position.x} | sk.x: ${view.frustum_skew.x} | invZ: ${view.inv_z_map.min.toFixed(4)} - ${view.inv_z_map.max.toFixed(4)} | ${layers.length} layers`;
            viewDOM.appendChild(Object.assign(document.createElement('h2'), { textContent: title }));
            viewDOM.appendChild(mainImg);
            viewDOM.appendChild(dispImg);
            viewDiv.appendChild(viewDOM);

            for (const [index, layer] of layers.entries()) {
                let layImg = document.createElement('img');
                layImg.className = 'layer_img';
                layImg.src = layer.image.url;
                let layDispImg = document.createElement('img');
                layDispImg.className = 'layer_img';
                layDispImg.src = layer.inv_z_map.url;
                const layMaskImg = document.createElement('img');
                layMaskImg.className = 'layer_img';
                if (layer.mask) {
                    const mainImg = await loadImage2(layer.image.url);
                    const maskImg = await loadImage2(layer.mask.url);
                    const invzImg = await loadImage2(layer.inv_z_map.url);
                    layImg.src = create4ChannelImage(mainImg, maskImg);
                    layDispImg.src = create4ChannelImage(invzImg, maskImg);
                }
                
                // Calculate and apply the scaling
                const widthScale = layer.width_px / view.width_px;
                mainImg.style.marginLeft = `${300*(widthScale-1)/2}px`;
                mainImg.style.marginRight = `${300*(widthScale-1)}px`

                layImg.style.width = `${300 * widthScale}px`;
                layDispImg.style.width = `${300 * widthScale}px`;
   
                const layTitle = `Layer ${index} | ${layer.width_px} x ${layer.height_px} | f: ${layer.focal_px.toFixed(0)} | invZ: ${layer.inv_z_map.min.toFixed(4)} - ${layer.inv_z_map.max.toFixed(4)}`;
                viewDOM.appendChild(Object.assign(document.createElement('h3'), { textContent: layTitle }));
                viewDOM.appendChild(layImg);
                viewDOM.appendChild(layDispImg);
                //viewDOM.appendChild(layMaskImg);
                viewDiv.appendChild(viewDOM);
            }
        }
    }
}
