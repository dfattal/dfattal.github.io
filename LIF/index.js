// Get the full URL
const urlParams = new URLSearchParams(window.location.search);
const dispModel = urlParams.get('dispModel') ? urlParams.get('dispModel') : "Leia"; // Set to true to enable decency checks
const mode = urlParams.get('mode') ? urlParams.get('mode') : "prod"; // choice to use dev or prod version of the API
console.log(mode);

class lifGenerator {
    constructor(file = null, form = null) {
        this.AWS_LAMBDA_URL = 'https://dqrluvhhkamlne6cpc6g6waaay0whxpb.lambda-url.us-east-1.on.aws/?mode=' + mode;
        this.file = file ? file : null;
        this.stLifInput = false;
        this.width = 0;
        this.height = 0;
        this.formData;
        this.ldlForm = document.getElementById("image-generation-form");
        this.inpaintMethod = '';
        this.endpointUrl = 'https://' + (mode=='dev'?'api.dev.immersity.ai':'api.immersity.ai') + '/api/v1';
        this.imUploadUrl;
        this.imDownloadUrl;
        this.outpaintImUploadUrl;
        this.outpaintImDownloadUrl;
        this.dispUploadUrl;
        this.dispDownloadUrl;
        this.lifUploadUrl;
        this.lifDownloadUrl;
        this.accessToken;
        this.lifFile;
        this.lifArrayBuffer;
        this.lifInfo;
        this.maxDimension = 2560;
        this.progressBar = document.getElementById('progress-bar');
        this.progressContainer = document.getElementById('progress-container');
        this.interval = 500; // Update progress every 500ms
        this.ready = 0;
    }

    getExecJson() {
        let result;
        if (this.stLifInput) {
            console.log('Stereo input !');
            result = {
                executionPlan: [{
                    productId: "f60f2155-3383-4456-88dc-9d5160aa81b5", // generate stereo disparity
                    productParams: {
                        inputs: { inputLifImageUrl: this.imDownloadUrl },
                        outputs: { outputLifImageUrl: this.dispUploadUrl }
                    }
                },
                {
                    productId: "1862b5a9-36d0-4624-ad6e-2c4b8f694d89", // LDL STEREO
                    productParams: {
                        inputs: {},
                        outputs: {},
                        params: {}
                    }
                }
                ]
            }
            const formData = new FormData(this.ldlForm);
            const params = {};

            formData.forEach((value, key) => {
                params[key] = value;
            });
            params.outpaint = `${parseFloat(params.outpaint) + .000001}`; // avoid issue with 0
            delete params.outpaintNegativePrompt;
            delete params.outpaintPrompt;
            delete params.outpaint;
            result.executionPlan[1].productParams.inputs.inputStereoLifUrl = this.dispDownloadUrl;
            result.executionPlan[1].productParams.outputs.outputLifUrl = this.lifUploadUrl;
            result.executionPlan[1].productParams.params = params;
            // result.executionPlan[0].paramsRaw = params;
        } else {
            result = {
                executionPlan: [{
                    productId: "1b2e3ca8-1f71-40b6-a43d-567b35d5e05d", // OUTPAINT
                    productParams: {
                        inputs: { inputImageUrl: this.imDownloadUrl },
                        outputs: { outputLifUrl: this.outpaintImUploadUrl },
                        params: {
                            inpaintMethod: "lama",
                            outpaint: "0.1"
                        }
                    }
                },
                // {
                //     productId: "b109355d-12a9-41fe-bd36-94bde1634da0", // Gateway
                //     productParams: {
                //         url: "http://3.95.133.35:8080/v1/depth-map-refined", // Apple Depth Pro
                //         method: "POST",
                //         body: {
                //             inputs: {"inputImageUrl": this.outpaintImDownloadUrl},
                //             outputs: {"outputDisparityUrl": this.dispUploadUrl},
                //             params: {
                //                 outputFormat: "disparity",
                //                 outputType: "uint16",
                //                 dilation: 0
                //             }
                //         }
                //     }
                // },
                {
                    productId: "4d50354b-466d-49e1-a95d-0c7f320849c6", // generate disparity
                    productParams: {
                        inputs: { inputImageUrl: this.outpaintImDownloadUrl },
                        outputs: { outputDisparityUrl: this.dispUploadUrl },
                        params: {
                            outputType: 'uint16',
                            dilation: 0
                        }
                    }
                },
                {
                    productId: "c95bb2e9-95d2-4d2a-ac7c-dd1b0e1c7e7f", // LDL MONO
                    productParams: {
                        inputs: {},
                        outputs: {},
                        params: {}
                    }
                }
                ]
            }
            const formData = new FormData(this.ldlForm);
            const params = {};

            formData.forEach((value, key) => {
                params[key] = value;
            });
            result.executionPlan[0].productParams.params.outpaint = params.outpaint;
            result.executionPlan[0].productParams.params.inpaintMethod = params.inpaintMethod;
            params.outpaint = `${-parseFloat(params.outpaint)}`; // crop main image back to original size
            result.executionPlan[2].productParams.inputs.inputImageUrl = this.outpaintImDownloadUrl;
            result.executionPlan[2].productParams.inputs.inputDisparityUrl = this.dispDownloadUrl;
            result.executionPlan[2].productParams.outputs.outputLifUrl = this.lifUploadUrl;
            result.executionPlan[2].productParams.params = params;

            if (dispModel == "DP") {
                result.executionPlan[1] = {
                    productId: "b109355d-12a9-41fe-bd36-94bde1634da0", // Gateway
                    productParams: {
                        url: "http://3.95.133.35:8080/v1/depth-map-refined", // Apple Depth Pro
                        method: "POST",
                        body: {
                            inputs: { "inputImageUrl": this.outpaintImDownloadUrl },
                            outputs: { "outputDisparityUrl": this.dispUploadUrl },
                            params: {
                                outputFormat: "disparity",
                                outputType: "uint16",
                                dilation: 0
                            }
                        }
                    }
                };
            }

        }
        console.log(result);
        return result;
    }

    async resizeImage(image) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        let width = image.width;
        let height = image.height;

        if (width > height) {
            if (width > this.maxDimension) {
                height = Math.round((height * this.maxDimension) / width);
                width = this.maxDimension;
            }
        } else {
            if (height > this.maxDimension) {
                width = Math.round((width * this.maxDimension) / height);
                height = this.maxDimension;
            }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(image, 0, 0, width, height);

        // Convert canvas to blob and return it along with dimensions
        const blob = await new Promise((resolve) => {
            canvas.toBlob(resolve, this.file.type, 1);
        });

        return {
            blob: blob,
            width: width,
            height: height
        };
    }

    async convertHeicToJpeg() {
        const convertedBlob = await heic2any({
            blob: this.file,
            toType: "image/jpeg",
            quality: 1
        });
        this.file = new File([convertedBlob], this.file.name.replace(/\.[^/.]+$/, ".jpg"), { type: "image/jpeg" });
    }

    async getAccessToken() {
        console.log('Acquiring access token from LeiaLogin...');

        const tokenResponse = await axios.post(this.AWS_LAMBDA_URL, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Access-Control-Allow-Origin': '*'
            },
        });

        console.log('Access token acquired:', tokenResponse.data);
        this.accessToken = tokenResponse.data.access_token;
    }

    async getPutGetUrl(filename) {
        const responsePair = await fetch(this.endpointUrl + '/get-presigned-url-pair?fileName=' + filename + '&mediaType=image%2Fjpeg', {
            method: 'POST',
            headers: {
                authorization: `Bearer ${this.accessToken}`,
                accept: 'application/json'
            },
        });

        const data = await responsePair.json();
        console.log('Put URL for', filename, ':', data.uploadUrl);
        console.log('Get URL for', filename, ':', data.downloadUrl);

        return [data.uploadUrl, data.downloadUrl];
    }

    async uploadToStorage(file, putUrl) {
        try {
            const response = await fetch(putUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': file.type
                },
                body: file
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            console.log('File uploaded successfully');
        } catch (error) {
            console.error('Error uploading file:', error);
        }
    }

    async generateLif() {
        // Start timing the fetch
        console.time('fetchDuration');
        // Show the progress bar
        console.log(this.width, ' - ', this.height, ' - ', this.inpaintMethod);

        this.progressContainer.style.display = 'block';

        // Simulate the progress bar
        let progress = 0;

        const totalDuration = this.inpaintMethod == 'lama' ? 30000 : 50000; // Total duration of 60 seconds
        const increment = 100 / (totalDuration / this.interval); // Calculate how much to increment each interval

        const progressInterval = setInterval(() => {
            progress += increment;
            this.progressBar.style.width = `${progress}%`;

            // Ensure progress doesn't exceed 100%
            if (progress >= 100) {
                clearInterval(progressInterval);
            }
        }, this.interval);

        try {
            const response = await fetch(this.endpointUrl + '/process', {
                method: 'POST',
                headers: {
                    accept: 'application/json',
                    authorization: `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(this.getExecJson())
            });
            // Check if the response status is OK (status 200-299)
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            // Attempt to parse response as JSON
            const data = await response.json();
            console.log('Response data:', data);
        } catch (error) {
            console.error('Error during fetch:', error);
        }


        // Clear the progress bar when the fetch completes
        clearInterval(progressInterval);
        this.progressContainer.style.display = 'none'; // Hide the progress bar
        this.progressBar.style.width = '0%'; // Set to 100% when done

        this.lifFile = await fetch(this.lifDownloadUrl);
        this.lifArrayBuffer = await this.lifFile.arrayBuffer();
        // console.log(this.lifArrayBuffer);
        this.lifInfo = await parseLif53(this.lifArrayBuffer);
        showLifInfo(this.lifInfo);
        addViz(this.lifArrayBuffer);
        // Stop timing the fetch
        console.timeEnd('fetchDuration');

    }

    async addDownload() {
        const downloadButton = document.getElementById('downloadBut');
        downloadButton.style.display = 'inline';

        // On button click, prompt user with a file save dialog
        downloadButton.onclick = async () => {
            try {
                const fileName = this.imUploadUrl.split('/').pop().split('.').slice(0, -1).join('.') + '_LIF5.jpg';

                // Check if showSaveFilePicker is supported
                if (window.showSaveFilePicker) {
                    const options = {
                        suggestedName: fileName,
                        types: [{
                            description: 'JPEG Image',
                            accept: { 'image/jpeg': ['.jpg', '.jpeg'] }
                        }]
                    };

                    const handle = await window.showSaveFilePicker(options);

                    const writableStream = await handle.createWritable();
                    await writableStream.write(new Blob([this.lifArrayBuffer], { type: 'image/jpeg' }));
                    await writableStream.close();

                    console.log('File saved successfully');
                } else {
                    // Fallback for iOS or other browsers that do not support showSaveFilePicker
                    const blob = new Blob([this.lifArrayBuffer], { type: 'image/jpeg' });
                    const url = URL.createObjectURL(blob);

                    const link = document.createElement('a');
                    link.href = url;
                    link.download = fileName;
                    document.body.appendChild(link);
                    link.click();

                    // Clean up and remove the link
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);

                    console.log('File downloaded successfully using fallback');
                }
            } catch (err) {
                console.error('Error saving the file:', err);
            }
        };
    }

    async go() {
        this.ldlForm.style.display = 'block';

        document.getElementById("ldlSubmit").onclick = async function () {
            try {
                this.inpaintMethod = document.getElementById('inpaintMethod').value;
                console.log('inpainting: ', this.inpaintMethod);
                document.getElementById("log-container").style.display = 'block';
                mylog(`Starting Conversion of ${this.file.name}, ${this.file.type}`);
                //let processedFile = this.file;
                this.ldlForm.style.display = 'none';

                // Convert HEIC to a more usable format
                if (this.file.type === 'image/heic' || this.file.type === 'image/heif') {
                    mylog('Converting HEIC file...');
                    await this.convertHeicToJpeg();
                }

                const img = new Image();
                const reader = new FileReader();

                reader.onload = async (readerEvent) => {
                    img.src = readerEvent.target.result;

                    img.onload = async () => {

                        this.width = img.width;
                        this.height = img.height;
                        if ((img.width > this.maxDimension || img.height > this.maxDimension) && !this.stLifInput) {
                            const resizedObj = await this.resizeImage(img);
                            const resizedBlob = resizedObj.blob;
                            this.width = resizedObj.width;
                            this.height = resizedObj.height;
                            this.file = new File([resizedBlob], this.file.name, { type: this.file.type });
                            mylog(`Image resized to ${this.width} x ${this.height} before upload...`);
                        }

                        await this.getAccessToken();
                        mylog('Authenticated to IAI Cloud 🤗');

                        [this.imUploadUrl, this.imDownloadUrl] = await this.getPutGetUrl(this.file.name);
                        [this.outpaintImUploadUrl, this.outpaintImDownloadUrl] = await this.getPutGetUrl('outpaintedImage.jpg');
                        [this.dispUploadUrl, this.dispDownloadUrl] = await this.getPutGetUrl('disparity.png');
                        [this.lifUploadUrl, this.lifDownloadUrl] = await this.getPutGetUrl('lifResult.jpg');
                        mylog('Got temporary storage URLs on IAI Cloud 💪');
                        await this.uploadToStorage(this.file, this.imUploadUrl);
                        mylog('Uploaded Image to IAI Cloud 🚀');
                        mylog('Generating LDI File... ⏳');
                        await this.generateLif();
                        document.getElementById("log-container").style.display = 'none';
                        this.addDownload();
                        this.ready = 1;
                    };
                };
                reader.readAsDataURL(this.file);
            } catch (error) {
                mylog("Error during LIF generation process:" + error.message);
            }
        }.bind(this);
    }
}

// Add file picker event listener
const filePicker = document.getElementById('filePicker');
filePicker.addEventListener('change', handleFileSelect, false);

const logContainer = document.getElementById('log');
logContainer.textContent = "";

function mylog(msg) {
    logContainer.textContent += msg + "\n";
    console.log(msg);
}


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

async function addViz(arrayBuffer) {
    const vizBut = document.getElementById('visualize');
    vizBut.style.display = 'inline';

    function arrayBufferToBinaryString(buffer) {
        let binaryString = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binaryString += String.fromCharCode(bytes[i]);
        }
        return binaryString;
    }

    vizBut.addEventListener('click', function () {
        //document.getElementById("filePicker").value = "";
        console.log("Attempting to open visualization at /VIZ");
        const binaryString = arrayBufferToBinaryString(arrayBuffer);
        const base64String = btoa(binaryString);

        // Store the base64 string in localStorage
        //localStorage.setItem('lifFileData', base64String);

        // Optional: Delete the existing database before opening it (for debugging or resetting purposes)
        //indexedDB.deleteDatabase("lifFileDB");

        const request = indexedDB.open("lifFileDB", 1);

        request.onupgradeneeded = function (event) {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("lifFiles")) {
                db.createObjectStore("lifFiles", { keyPath: "id" });
            }
        };

        request.onsuccess = function (event) {
            const db = event.target.result;
            const transaction = db.transaction(["lifFiles"], "readwrite");
            const objectStore = transaction.objectStore("lifFiles");
            const fileData = { id: "lifFileData", data: base64String };

            const requestUpdate = objectStore.put(fileData);

            requestUpdate.onsuccess = function () {
                console.log("File saved to IndexedDB successfully!");
            };

            requestUpdate.onerror = function () {
                console.error("Error saving file to IndexedDB");
            };
        };

        request.onerror = function () {
            console.error("Error opening IndexedDB");
        };

        window.open(`../VIZ/index.html`, '_blank');
    });
}

async function showLifInfo(lifInfo) {

    console.log(lifInfo);
    const views = lifInfo.views;
    mylog(`LIF Encoder: ${lifInfo.encoder} -- ${views.length} view${views.length > 1 ? 's' : ''}`);

    for (const [index, view] of views.entries()) {
        const viewDOM = document.createElement('div');
        viewDOM.className = 'view';
        const mainImg = document.createElement('img');
        mainImg.className = 'main_img';
        mainImg.src = view.image.url;
        if (!view.inv_z_map) {
            const title = `View ${index} | ${view.width_px} x ${view.height_px} | f: ${view.focal_px.toFixed(0)} | x: ${view.position.x} | sk.x: ${view.frustum_skew.x.toFixed(4)} | No invZ`;
            viewDOM.appendChild(Object.assign(document.createElement('h2'), { textContent: title }));
            viewDOM.appendChild(mainImg);
            viewDiv.appendChild(viewDOM);
            continue;
        }
        const dispImg = document.createElement('img');
        dispImg.className = 'main_img';
        dispImg.src = view.inv_z_map.url;
        const layers = view.layers_top_to_bottom;
        const title = `View ${index} | ${view.width_px} x ${view.height_px} | f: ${view.focal_px.toFixed(0)} | x: ${view.position.x} | sk.x: ${view.frustum_skew.x.toFixed(4)} | invZ: ${view.inv_z_map.min.toFixed(4)} - ${view.inv_z_map.max.toFixed(4)} | ${layers.length} layer${layers.length > 1 ? 's' : ''}`;
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
            mainImg.style.marginLeft = `${300 * (widthScale - 1) / 2}px`;
            mainImg.style.marginRight = `${300 * (widthScale - 1)}px`

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

async function askToGenLDI(file) {

}

async function handleFileSelect(event) {

    const lifGen = new lifGenerator();
    const file = event.target.files[0];
    let lifInfo;
    if (file) {
        logContainer.textContent = '';
        viewDiv.innerHTML = '';
        document.getElementById('visualize').style.display = 'none';
        document.getElementById('downloadBut').style.display = 'none';

        try {
            const arrayBuffer = await file.arrayBuffer();
            lifInfo = await parseLif53(arrayBuffer);
            if ((!lifInfo.views[0].layers_top_to_bottom) || (lifInfo.views[0].layers_top_to_bottom.length < 2)) { // valid LIF but no LDI
                const userWantsToCreateLdi = confirm("This is a single layer LIF, would you like to create layers ?");
                if (userWantsToCreateLdi) {

                    if (lifInfo.views.length > 1) lifGen.stLifInput = true; // stereo LIF
                    lifGen.file = file;
                    await lifGen.go();

                } else {
                    showLifInfo(lifInfo);
                    addViz(arrayBuffer);
                }
            } else {
                showLifInfo(lifInfo);
                addViz(arrayBuffer);
            }
        } catch (e) {
            console.log(e);
            const userWantsToCreateLif = confirm("Not a LIF file, would you like to create one?");
            if (userWantsToCreateLif) {

                try {
                    const arrayBuffer = await file.arrayBuffer();
                    const lifMeta = await parseBinary(arrayBuffer);
                    const lifJson = lifMeta.getJsonMeta();
                    if (lifJson.views && (lifJson.views.length > 1)) lifGen.stLifInput = true;
                } catch (e) {
                    console.log("simple image");
                }
                lifGen.file = file;
                await lifGen.go();

            } else {
                return;
            }
        }
    }
}
