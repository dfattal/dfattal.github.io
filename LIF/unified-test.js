class lifGenerator {
    constructor(file = null) {
        this.AWS_LAMBDA_URL = 'https://sk5ppdkibbohlyjwygbjqoi2ru0dvwje.lambda-url.us-east-1.on.aws';
        this.file = file ? file : null;
        this.width = 0;
        this.height = 0;
        this.formData;
        this.ldlForm = document.getElementById("image-generation-form");
        this.inpaintMethod = '';
        this.endpointUrl = 'http://3.95.133.35:5000/v1/unified';
        this.storageUrl;
        this.accessToken;
        this.lifFile;
        this.lifArrayBuffer;
        this.lifInfo;
        this.maxDimension = 1600;
        this.progressBar = document.getElementById('progress-bar');
        this.progressContainer = document.getElementById('progress-container');
        this.interval = 500; // Update progress every 500ms
        this.ready = 0;
    }

    getLdlFormData() {
        const formData = new FormData(this.ldlForm);
        const params = {};

        formData.forEach((value, key) => {
            params[key] = value;
        });
        params.outpaint = parseFloat(params.outpaint) + .000001 // avoid issue with 0
        params.imageUrl = this.storageUrl;

        console.log(params);
        return params;
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

    async getStorageUrl() {
        const response = await fetch('https://api.dev.immersity.ai/api/v1/get-upload-url?fileName=' + this.file.name + '&mediaType=image%2Fjpeg', {
            method: 'GET',
            headers: {
                authorization: `Bearer ${this.accessToken}`,
                accept: 'application/json'
            },
        });

        const data = await response.json();
        console.log('upload URL : ', data.url);
        this.storageUrl = data.url;
    }

    async uploadToStorage() {
        try {
            const response = await fetch(this.storageUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': this.file.type
                },
                body: this.file
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

        const totalDuration = this.inpaintingTech == 'lama' ? 30000 : 50000; // Total duration of 60 seconds
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
            const response = await fetch(this.endpointUrl, {
                method: 'POST',
                headers: {
                    accept: 'application/json',
                    authorization: `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(this.getLdlFormData())
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

        const data = await response.json();
        console.log(data);
        const lifUrl = data.resultPresignedUrl; // Assuming the API returns the LIF file URL in 'lifUrl' field

        this.lifFile = await fetch(lifUrl);
        this.lifArrayBuffer = await this.lifFile.arrayBuffer();
        console.log(this.lifArrayBuffer);
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
                const fileName = this.storageUrl.split('/').pop().split('.').slice(0, -1).join('.') + '_LIF5.jpg';

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
                        if (img.width > this.maxDimension || img.height > this.maxDimension) {
                            const resizedObj = await this.resizeImage(img);
                            const resizedBlob = resizedObj.blob;
                            this.width = resizedObj.width;
                            this.height = resizedObj.height;
                            this.file = new File([resizedBlob], this.file.name, { type: this.file.type });
                            mylog(`Image resized to ${this.width} x ${this.height} before upload...`);
                        }

                        await this.getAccessToken();
                        mylog('Authenticated to IAI Cloud 🤗');
                        await this.getStorageUrl();
                        mylog('Got temporary storage URL on IAI Cloud 💪');
                        await this.uploadToStorage();
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

const lifGen = new lifGenerator();
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
        console.log("Attempting to open visualization at newShaderLDI");
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

        //window.location.href = `./newShaderLDI/index.html`;
        window.open(`../newShaderLDI/index.html`, '_blank');
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

async function handleFileSelect(event) {

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
            showLifInfo(lifInfo);
            addViz(arrayBuffer);
        } catch (e) {
            const userWantsToCreateLif = confirm("Not a LIF file, would you like to create one?");
            if (userWantsToCreateLif) {
                // const lifGen = new lifGenerator(file);
                lifGen.file = file;
                await lifGen.go();

                // lifInfo = await parseLif53(lifGen.lifFile);
                // addViz(lifGen.lifArrayBuffer);


            } else {
                return;
            }
        }
    }
}