// Jul 25, 2024, 19:39, supports 5.1 and 5.2 LIF LDL (LDI) files
AWS_LAMBDA_URL = 'https://sk5ppdkibbohlyjwygbjqoi2ru0dvwje.lambda-url.us-east-1.on.aws';

class BinaryStream {
    constructor(arrayBuffer) {
        this.dataView = new DataView(arrayBuffer);
        this.offset = 0;
    }
    readBytes(length) {
        const bytes = new Uint8Array(this.dataView.buffer, this.offset, length);
        this.offset += length;
        return bytes;
    }
    readUInt16() {
        const value = this.dataView.getUint16(this.offset, false); // Big-endian
        this.offset += 2;
        return value;
    }
    readUInt32() {
        const value = this.dataView.getUint32(this.offset, false); // Big-endian
        this.offset += 4;
        return value;
    }
}

class Field {
    constructor(fieldType = -1, data = new Uint8Array()) {
        this.fieldType = fieldType;
        this.fieldDataSize = data.byteLength;
        this.fieldData = data;
    }
    toBlob() {
        return new Blob([this.fieldData]);
    }
    toObjectUrl() {
        return URL.createObjectURL(this.toBlob());
    }
    toString() {
      return new TextDecoder().decode(this.fieldData);
    }
}

class Metadata {
    constructor() {
        this.fields = [];
        this.fullSize = 0;
        this.regionOffset = 0;
    }
    addField(field) {
        this.fields.push(field);
    }
    getFieldByType(fieldType) {
        return this.fields.find(field => field.fieldType === fieldType);
    }
    getJsonMeta() {
        const JSON_META = 7;
        const JSON_META_NEW = 8;
        const metaField = this.getFieldByType(JSON_META_NEW) || this.getFieldByType(JSON_META);
        if (!metaField) {
            throw new Error('Failed to extract LIF meta');
        }
        return JSON.parse(metaField.toString());
    }
}

class LifFileParser {
    constructor() {
        this.fileInput = document.getElementById('filePicker');
        this.fileInput.addEventListener('change', this.handleFileSelect.bind(this));
    }

    async handleFileSelect(event) {
        document.getElementById('lifContent').innerHTML = '';
        document.getElementById('visualize').style.display='none';
        document.getElementById('downloadBut').style.display='none';
        const file = event.target.files[0];
        if (file) {
            console.log("Picker: " + file.name);

            try {
                const arrayBuffer = await file.arrayBuffer();
                await this.parseLif5(arrayBuffer);
            } catch (e) {
                console.log("Not a LIF file:", e.message);

                // Create a confirmation dialog
                const userWantsToCreateLif = confirm("Not a LIF file, would you like to create one?");

                if (userWantsToCreateLif) {
                    console.log("Generating LIF file...");
                    document.getElementById("log-container").style.display='block';
                    const logContainer = document.getElementById('log');

                    try {
                        // Authenticate to IAI
                        const accessToken = await this.getAccessToken();
                        logContainer.textContent += 'Authenticated to IAI Cloud 🤗';
                        // Get a pre-signed URL for temporary storage
                        const storageUrl = await this.getStorageUrl(accessToken, file.name);
                        logContainer.textContent += '\nGot temporary storage URL on IAI Cloud 💪';
                        // Upload the image to the pre-signed URL
                        await this.uploadToStorage(storageUrl, file);
                        logContainer.textContent += '\nuploaded Image to IAI Cloud 🚀';
                        // Get the LIF
                        logContainer.textContent += '\nGenerating LDI File... ⏳';
                        await this.generateLif(accessToken, storageUrl);
                        document.getElementById("log-container").style.display='none';
                    } catch (error) {
                        console.error("Error during LIF generation process:", error.message);
                        logContainer.textContent += "Error during LIF generation process:" + error.message;
                    }
                } else {
                    console.log("User chose not to create a LIF file.");
                }
            }
        }
    }

    async parseBinary(arrayBuffer) {
        const fullSize = arrayBuffer.byteLength;
        const bf = new BinaryStream(arrayBuffer);
        bf.offset = fullSize - 2;
        const endMarker = bf.readUInt16();
        if (endMarker !== 0x1e1a) {
          throw new Error('Not a LIF file');
        }
        bf.offset = fullSize - 6;
        const regionOffset = bf.readUInt32();
        bf.offset = fullSize - regionOffset;

        const metadata = new Metadata();
        metadata.fieldCount = bf.readUInt32();
        //console.log(metadata.fieldCount);
        for (let i = 0; i < metadata.fieldCount; i++) {
          const fieldType = bf.readUInt32();
          const fieldDataSize = bf.readUInt32();
          const fieldData = bf.readBytes(fieldDataSize);
          const field = new Field(fieldType, fieldData);
          metadata.addField(field);
        }
        metadata.regionOffset = regionOffset;
        metadata.fullSize = fullSize;
        //console.log(metadata);
        return metadata;
    }

    async debugAddBlobAsImageToPage(blob) {
        const blobUrl = URL.createObjectURL(blob);
        const img = document.createElement('img');
        img.src = blobUrl;
        img.style.width = '300px';
        img.style.height = 'auto';
        document.getElementById("lifContent").appendChild(img);
        img.onload = () => {
            URL.revokeObjectURL(blobUrl);
        };
    }

    async parseLif5(arrayBuffer) {
        const lifMeta = await this.parseBinary(arrayBuffer);
        const lifJson = lifMeta.getJsonMeta();
        console.log(lifJson);
        const layers = [];
        for (const view of lifJson.views) {
            if (view.albedo) {
                if (view.albedo.blob_id == -1 /*source image*/) {
                    const albedo = new Blob([arrayBuffer], { type: 'image/jpeg' });
                    this.debugAddBlobAsImageToPage(albedo);
                } else {
                  const albedo = lifMeta.getFieldByType(view.albedo.blob_id).toBlob();
                  this.debugAddBlobAsImageToPage(albedo);
                }
            }
            if (view.disparity) {
              const disparity = lifMeta.getFieldByType(view.disparity.blob_id).toBlob();
              this.debugAddBlobAsImageToPage(disparity);
              document.getElementById("lifContent").append(document.createElement('br'));
              document.getElementById("lifContent").append('minDisp: ', view.disparity.min_disparity.toFixed(3), ' | maxDisp: ', view.disparity.max_disparity.toFixed(3), ' | focal: ', view.camera_data.focal_ratio_to_width.toFixed(3));
              document.getElementById("lifContent").append(document.createElement('br'));
            }
            let layers = view.layers_top_to_bottom;
            if (!layers) layers = view.layered_depth_image_data.layers_top_to_bottom;
            for (const layer of layers) {
              const rgb = lifMeta.getFieldByType(layer.albedo.blob_id).toBlob();
              const disp = lifMeta.getFieldByType(layer.disparity.blob_id).toBlob();
              const mask = lifMeta.getFieldByType(layer.mask.blob_id).toBlob();
              this.debugAddBlobAsImageToPage(rgb);
              this.debugAddBlobAsImageToPage(disp);
              this.debugAddBlobAsImageToPage(mask);
              console.log(layer);
              document.getElementById("lifContent").append(document.createElement('br'));
              document.getElementById("lifContent").append('minDisp: ', layer.disparity.min_disparity.toFixed(3), ' | maxDisp: ', layer.disparity.max_disparity.toFixed(3), ' | focal: ',layer.camera_data.focal_ratio_to_width.toFixed(3));
              document.getElementById("lifContent").append(document.createElement('br'));
              // access other layer properties here if needed
            }
        }
        const vizBut = document.getElementById('visualize');
        vizBut.style.display = 'inline';
        vizBut.addEventListener('click', function() {
            //document.getElementById("filePicker").value = "";
            console.log("Attempting to open visualization at newShaderLDI");
            const binaryString = arrayBufferToBinaryString(arrayBuffer);
            const base64String = btoa(binaryString);

             // Store the base64 string in localStorage
            //localStorage.setItem('lifFileData', base64String);
            const request = indexedDB.open("lifFileDB", 1);

            request.onupgradeneeded = function(event) {
                const db = event.target.result;
                db.createObjectStore("lifFiles", { keyPath: "id" });
            };

            request.onsuccess = function(event) {
                const db = event.target.result;
                const transaction = db.transaction(["lifFiles"], "readwrite");
                const objectStore = transaction.objectStore("lifFiles");
                const fileData = { id: "lifFileData", data: base64String };

                const requestUpdate = objectStore.put(fileData);

                requestUpdate.onsuccess = function() {
                    console.log("File saved to IndexedDB successfully!");
                };

                requestUpdate.onerror = function() {
                    console.error("Error saving file to IndexedDB");
                };
            };

    request.onerror = function() {
        console.error("Error opening IndexedDB");
    };

            //window.location.href = `./newShaderLDI/index.html`;
            window.open(`./newShaderLDI/index.html`, '_blank');
        });

        function arrayBufferToBinaryString(buffer) {
            let binaryString = '';
            const bytes = new Uint8Array(buffer);
            const len = bytes.byteLength;
            for (let i = 0; i < len; i++) {
                binaryString += String.fromCharCode(bytes[i]);
            }
            return binaryString;
        }
    }

    async getAccessToken() {
        console.log('Acquiring access token from LeiaLogin...');

        const tokenResponse = await axios.post(AWS_LAMBDA_URL, {
            headers: {
                'Content-Type' : 'application/x-www-form-urlencoded',
                'Access-Control-Allow-Origin': '*'
            },
        });

        console.log('Access token acquired:', tokenResponse.data);
        return tokenResponse.data.access_token;
    }

    async getStorageUrl(accessToken,fileName) {
        const response = await fetch('https://api.dev.immersity.ai/api/v1/get-upload-url?fileName=' + fileName + '&mediaType=image%2Fjpeg', {
            method: 'GET',
            headers: {
                authorization: `Bearer ${accessToken}`,
                accept: 'application/json'
            },
        });

        const data = await response.json();
        console.log('upload URL : ', data.url);
        return data.url;
    }

    async uploadToStorage(url, file) {
        try {
            const response = await fetch(url, {
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

    async generateLif(accessToken, storageUrl) {
    // Start timing the fetch
    console.time('fetchDuration');
    // Show the progress bar
    const progressBar = document.getElementById('progress-bar');
    const progressContainer = document.getElementById('progress-container');
    progressContainer.style.display = 'block';

    // Simulate the progress bar
    let progress = 0;
    const interval = 500; // Update progress every 500ms
    const totalDuration = 60000; // Total duration of 60 seconds
    const increment = 100 / (totalDuration / interval); // Calculate how much to increment each interval

    const progressInterval = setInterval(() => {
        progress += increment;
        progressBar.style.width = `${progress}%`;

        // Ensure progress doesn't exceed 100%
        if (progress >= 100) {
            clearInterval(progressInterval);
        }
    }, interval);

    const response = await fetch('https://api.dev.immersity.ai/api/v1/ldl', {
        method: 'POST',
        headers: {
            accept: 'application/json',
            authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            inputImageUrl: storageUrl
        })
    });

    // Clear the progress bar when the fetch completes
    clearInterval(progressInterval);
    progressBar.style.width = '100%'; // Set to 100% when done
    progressContainer.style.display = 'none'; // Hide the progress bar

    const data = await response.json();
    const lifUrl = data.resultPresignedUrl; // Assuming the API returns the LIF file URL in 'lifUrl' field

    const lifResponse = await fetch(lifUrl);
    const lifArrayBuffer = await lifResponse.arrayBuffer();

    // Stop timing the fetch
    console.timeEnd('fetchDuration');

    await this.parseLif5(lifArrayBuffer);

    // Create the download button
    const downloadButton = document.getElementById('downloadBut');
    downloadButton.style.display='inline';

    // On button click, prompt user with a file save dialog
    downloadButton.onclick = async () => {
    try {
        const fileName = storageUrl.split('/').pop().split('.').slice(0, -1).join('.') + '_LIF5.jpg';

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
            await writableStream.write(new Blob([lifArrayBuffer], { type: 'image/jpeg' }));
            await writableStream.close();

            console.log('File saved successfully');
        } else {
            // Fallback for iOS or other browsers that do not support showSaveFilePicker
            const blob = new Blob([lifArrayBuffer], { type: 'image/jpeg' });
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
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded " + new Date());
    new LifFileParser();
});