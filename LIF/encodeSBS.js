const urlParams = new URLSearchParams(window.location.search);
const mode = urlParams.get('mode') ? urlParams.get('mode') : "prod"; // choice to use dev or prod version of the API
console.log(mode);

const AWS_LAMBDA_URL = 'https://dqrluvhhkamlne6cpc6g6waaay0whxpb.lambda-url.us-east-1.on.aws/?mode=' + mode;
const endpointUrl = 'https://' + (mode == 'dev' ? 'api.dev.immersity.ai' : 'api.immersity.ai') + '/api/v1';
let outputFilename;

// DOM elements
const dropArea = document.getElementById('dropArea');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const statusElement = document.getElementById('status');
const anaglyphContainer = document.getElementById('anaglyph-container');
const spinner = document.getElementById('spinner');

// Drag and drop events
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    dropArea.addEventListener(eventName, highlight, false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, unhighlight, false);
});

function highlight() {
    dropArea.classList.add('highlight');
}

function unhighlight() {
    dropArea.classList.remove('highlight');
}

// Handle file drop and selection
dropArea.addEventListener('drop', handleDrop, false);
fileInput.addEventListener('change', handleFileSelect, false);
dropArea.addEventListener('click', () => fileInput.click());

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;

    if (files.length > 0 && (files[0].type === 'image/jpeg' || files[0].type === 'image/png')) {
        handleFiles(files);
    } else {
        statusElement.textContent = 'Please drop a valid JPG or PNG file.';
    }
}

function handleFileSelect(e) {
    if (fileInput.files.length > 0) {
        handleFiles(fileInput.files);
    }
}

function handleFiles(files) {
    const file = files[0];
    if (file.type !== 'image/jpeg' && file.type !== 'image/png') {
        statusElement.textContent = 'Please select a valid JPG or PNG file.';
        return;
    }

    // Show file info
    fileInfo.style.display = 'block';
    fileInfo.textContent = `File: ${file.name} (${formatFileSize(file.size)})`;

    // Hide drop area
    dropArea.style.display = 'none';

    // Start processing
    processFile(file);
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
}

async function getAccessToken() {
    console.log('Acquiring access token from LeiaLogin...');

    const tokenResponse = await axios.post(AWS_LAMBDA_URL, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Access-Control-Allow-Origin': '*'
        },
    });

    console.log('Access token acquired:', tokenResponse.data);
    return tokenResponse.data.access_token;
}

async function getPutGetUrl(accessToken, filename) {
    const responsePair = await fetch(endpointUrl + '/get-presigned-url-pair?fileName=' + filename + '&mediaType=image%2Fjpeg', {
        method: 'POST',
        headers: {
            authorization: `Bearer ${accessToken}`,
            accept: 'application/json'
        },
    });

    const data = await responsePair.json();
    console.log('Put URL for', filename, ':', data.uploadUrl);
    console.log('Get URL for', filename, ':', data.downloadUrl);

    return [data.uploadUrl, data.downloadUrl];
}

async function uploadToStorage(url, file) {
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

function processFile(sbsImage) {
    let filename = sbsImage.name;
    filename = filename.substring(0, filename.lastIndexOf('.')); // remove extension
    filename = filename.replace(/(_2x1|sbs)$/i, ''); // remove _2x1 or sbs suffix, case insensitive
    outputFilename = filename + '_STLIF.jpg';

    statusElement.textContent = 'Processing your image...';

    const reader = new FileReader();

    reader.onload = function (e) {
        const img = new Image();
        img.src = e.target.result;

        img.onload = async function () {
            const halfWidth = img.width / 2;
            const height = img.height;

            // Create canvases for left and right halves
            const canvasLeft = document.createElement('canvas');
            const canvasRight = document.createElement('canvas');
            canvasLeft.width = canvasRight.width = halfWidth;
            canvasLeft.height = canvasRight.height = height;

            const contextLeft = canvasLeft.getContext('2d');
            const contextRight = canvasRight.getContext('2d');
            contextLeft.drawImage(img, 0, 0, halfWidth, height, 0, 0, halfWidth, height);
            contextRight.drawImage(img, halfWidth, 0, halfWidth, height, 0, 0, halfWidth, height);

            // Display the anaglyph while processing
            createAnaglyph(contextLeft, contextRight, halfWidth, height);

            // Convert each half to blobs and upload
            canvasLeft.toBlob(async (leftBlob) => {
                canvasRight.toBlob(async (rightBlob) => {
                    await uploadToServer(leftBlob, rightBlob);
                }, 'image/jpeg');
            }, 'image/jpeg');
        };
    };

    reader.readAsDataURL(sbsImage);
}

function createAnaglyph(contextLeft, contextRight, width, height) {
    const anaglyphCanvas = document.getElementById('anaglyphCanvas');
    anaglyphCanvas.width = width;
    anaglyphCanvas.height = height;
    const anaglyphContext = anaglyphCanvas.getContext('2d');

    // Get image data from both halves
    const leftImageData = contextLeft.getImageData(0, 0, width, height);
    const rightImageData = contextRight.getImageData(0, 0, width, height);
    const anaglyphData = anaglyphContext.createImageData(width, height);

    // Apply Dubois method for better anaglyph with reduced crosstalk
    // Dubois transformation matrices for red-cyan anaglyphs
    const leftMatrix = [
        [0.437, 0.449, 0.164],  // Red output coefficients for left eye
        [-0.062, -0.062, -0.024], // Green output coefficients for left eye
        [-0.048, -0.050, -0.017]  // Blue output coefficients for left eye
    ];

    const rightMatrix = [
        [-0.011, -0.032, -0.007], // Red output coefficients for right eye
        [0.377, 0.761, 0.009],    // Green output coefficients for right eye
        [-0.026, -0.093, 1.234]   // Blue output coefficients for right eye
    ];

    for (let i = 0; i < leftImageData.data.length; i += 4) {
        // Get RGB values for left and right images
        const leftR = leftImageData.data[i] / 255.0;
        const leftG = leftImageData.data[i + 1] / 255.0;
        const leftB = leftImageData.data[i + 2] / 255.0;

        const rightR = rightImageData.data[i] / 255.0;
        const rightG = rightImageData.data[i + 1] / 255.0;
        const rightB = rightImageData.data[i + 2] / 255.0;

        // Apply Dubois transformation for left eye contribution
        const leftContribR = leftMatrix[0][0] * leftR + leftMatrix[0][1] * leftG + leftMatrix[0][2] * leftB;
        const leftContribG = leftMatrix[1][0] * leftR + leftMatrix[1][1] * leftG + leftMatrix[1][2] * leftB;
        const leftContribB = leftMatrix[2][0] * leftR + leftMatrix[2][1] * leftG + leftMatrix[2][2] * leftB;

        // Apply Dubois transformation for right eye contribution
        const rightContribR = rightMatrix[0][0] * rightR + rightMatrix[0][1] * rightG + rightMatrix[0][2] * rightB;
        const rightContribG = rightMatrix[1][0] * rightR + rightMatrix[1][1] * rightG + rightMatrix[1][2] * rightB;
        const rightContribB = rightMatrix[2][0] * rightR + rightMatrix[2][1] * rightG + rightMatrix[2][2] * rightB;

        // Combine contributions and clamp to valid range
        const finalR = Math.max(0, Math.min(255, (leftContribR + rightContribR) * 255));
        const finalG = Math.max(0, Math.min(255, (leftContribG + rightContribG) * 255));
        const finalB = Math.max(0, Math.min(255, (leftContribB + rightContribB) * 255));

        anaglyphData.data[i] = finalR;
        anaglyphData.data[i + 1] = finalG;
        anaglyphData.data[i + 2] = finalB;
        anaglyphData.data[i + 3] = 255; // Full opacity
    }

    // Draw anaglyph and show the container
    anaglyphContext.putImageData(anaglyphData, 0, 0);
    anaglyphContainer.style.display = 'block';
    spinner.style.display = 'block';
}

async function uploadToServer(leftBlob, rightBlob) {
    try {
        statusElement.textContent = 'Uploading and converting...';

        const accessToken = await getAccessToken();

        const [imLUpUrl, imLDownUrl] = await getPutGetUrl(accessToken, 'leftImage.jpg');
        const [imRUpUrl, imRDownUrl] = await getPutGetUrl(accessToken, 'rightImage.jpg');

        await Promise.all([
            uploadToStorage(imLUpUrl, leftBlob),
            uploadToStorage(imRUpUrl, rightBlob)
        ]);

        const [lifUpUrl, lifDownUrl] = await getPutGetUrl(accessToken, 'inputStereoLif.jpg');
        const [lifOutUpUrl, lifOutDownUrl] = await getPutGetUrl(accessToken, outputFilename);

        const execPlan = {
            executionPlan: [{
                productId: "f60f2155-3383-4456-88dc-9d5160aa81b5", // generate stereo disparity
                productParams: {
                    inputs: { inputLeftImageUrl: imLDownUrl, inputRightImageUrl: imRDownUrl },
                    outputs: { outputLifImageUrl: lifUpUrl }
                }
            },
            {
                productId: "1862b5a9-36d0-4624-ad6e-2c4b8f694d89", // LDL STEREO
                productParams: {
                    inputs: { inputStereoLifUrl: lifDownUrl },
                    outputs: { outputLifUrl: lifOutUpUrl },
                    params: {
                        "depthDilationPercent": 0,
                        "dilation": 0.005,
                        "inpaintMethod": "lama"
                    }
                }
            }]
        };

        const response = await fetch(endpointUrl + '/process', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(execPlan)
        });

        const data = await response.json();

        // Hide the spinner and anaglyph after processing
        spinner.style.display = 'none';

        handleDownload(lifOutDownUrl);

    } catch (error) {
        console.error('Error:', error);
        statusElement.textContent = 'Error creating LIF file.';
        spinner.style.display = 'none';
    }
}

// Function to handle download based on device type
function handleDownload(lifOutDownUrl) {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (isMobile) {
        const newWindow = window.open(lifOutDownUrl, '_blank');
        if (!newWindow) {
            alert('Please enable pop-ups to download the file.');
        }
    } else {
        const link = document.createElement('a');
        link.href = lifOutDownUrl;
        link.download = outputFilename;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    statusElement.textContent = `LIF file created and ready for download. Keep the anaglyph preview open to see a 3D preview.`;

    // Add reset link
    const resetLink = document.createElement('a');
    resetLink.href = '#';
    resetLink.textContent = ' Reset';
    resetLink.style.marginLeft = '10px';
    resetLink.style.color = '#3498db';
    resetLink.onclick = function (e) {
        e.preventDefault();
        dropArea.style.display = 'flex';
        anaglyphContainer.style.display = 'none';
        fileInfo.style.display = 'none';
        statusElement.textContent = '';
        fileInput.value = '';
        statusElement.removeChild(resetLink);
    };

    statusElement.appendChild(resetLink);
}