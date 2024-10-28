const AWS_LAMBDA_URL = 'https://sk5ppdkibbohlyjwygbjqoi2ru0dvwje.lambda-url.us-east-1.on.aws';
const endpointUrl = 'https://api.dev.immersity.ai/api/v1';
let outputFilename;

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
        method: 'GET',
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

document.getElementById('uploadBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('fileInput');

    if (!fileInput.files || fileInput.files.length === 0) {
        alert("Please upload an SBS JPG file.");
        return;
    }

    const sbsImage = fileInput.files[0];
    let filename = sbsImage.name;
    filename = filename.substring(0, filename.lastIndexOf('.')); // remove extension
    filename = filename.replace(/(_2x1|sbs)$/i, ''); // remove _2x1 or sbs suffix, case insensitive
    outputFilename = filename + '_STLIF.jpg';

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
});

function createAnaglyph(contextLeft, contextRight, width, height) {
    const anaglyphCanvas = document.getElementById('anaglyphCanvas');
    anaglyphCanvas.width = width;
    anaglyphCanvas.height = height;
    const anaglyphContext = anaglyphCanvas.getContext('2d');

    // Get image data from both halves
    const leftImageData = contextLeft.getImageData(0, 0, width, height);
    const rightImageData = contextRight.getImageData(0, 0, width, height);
    const anaglyphData = anaglyphContext.createImageData(width, height);

    // Blend channels to create an anaglyph effect
    for (let i = 0; i < leftImageData.data.length; i += 4) {
        anaglyphData.data[i] = leftImageData.data[i];         // Red from left image
        anaglyphData.data[i + 1] = rightImageData.data[i + 1]; // Green from right image
        anaglyphData.data[i + 2] = rightImageData.data[i + 2]; // Blue from right image
        anaglyphData.data[i + 3] = 255;                       // Full opacity
    }

    // Draw anaglyph and show the container
    anaglyphContext.putImageData(anaglyphData, 0, 0);
    document.getElementById('anaglyph-container').style.display = 'block';
    document.getElementById('spinner').style.display = 'block';
}

async function uploadToServer(leftBlob, rightBlob) {
    try {
        document.getElementById('status').textContent = '';

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
        document.getElementById('spinner').style.display = 'none';
        document.getElementById('anaglyph-container').style.display = 'none';

        handleDownload(lifOutDownUrl);

    } catch (error) {
        console.error('Error:', error);
        document.getElementById('status').textContent = 'Error creating LIF file.';
        document.getElementById('spinner').style.display = 'none';
        document.getElementById('anaglyph-container').style.display = 'none';
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

    document.getElementById('status').textContent = `LIF file created and ready for download.`;
}