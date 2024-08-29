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
                const layImg = document.createElement('img');
                layImg.className = 'layer_img';
                layImg.src = layer.image.url;
                const layDispImg = document.createElement('img');
                layDispImg.className = 'layer_img';
                layDispImg.src = layer.inv_z_map.url;
                const layMaskImg = document.createElement('img');
                layMaskImg.className = 'layer_img';
                layMaskImg.src = layer.mask.url;
                const layTitle = `Layer ${index} | ${layer.width_px} x ${layer.height_px} | f: ${layer.focal_px.toFixed(0)} | invZ: ${layer.inv_z_map.min.toFixed(4)} - ${layer.inv_z_map.max.toFixed(4)}`;
                viewDOM.appendChild(Object.assign(document.createElement('h3'), { textContent: layTitle }));
                viewDOM.appendChild(layImg);
                viewDOM.appendChild(layDispImg);
                viewDOM.appendChild(layMaskImg);
                viewDiv.appendChild(viewDOM);
            }

        }



    }
}