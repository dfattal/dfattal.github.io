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
    // define output file name
    let filename = sbsImage.name;
    filename = filename.substring(0, filename.lastIndexOf('.')); // remove extension
    filename = filename.replace(/(_2x1|sbs)$/i, ''); // remove _2x1 or sbs suffix, case insensitive
    outputFilename = filename + '_STLIF.jpg';
    console.log('Output filename:', outputFilename);

    const reader = new FileReader();

    reader.onload = function (e) {
        const img = new Image();
        img.src = e.target.result;

        img.onload = async function () {
            // Split the SBS image into left and right
            const canvasLeft = document.createElement('canvas');
            const canvasRight = document.createElement('canvas');
            const contextLeft = canvasLeft.getContext('2d');
            const contextRight = canvasRight.getContext('2d');

            const halfWidth = img.width / 2;

            // Set canvas dimensions
            canvasLeft.width = halfWidth;
            canvasLeft.height = img.height;
            canvasRight.width = halfWidth;
            canvasRight.height = img.height;

            // Draw left and right parts
            contextLeft.drawImage(img, 0, 0, halfWidth, img.height, 0, 0, halfWidth, img.height);
            contextRight.drawImage(img, halfWidth, 0, halfWidth, img.height, 0, 0, halfWidth, img.height);

            // Convert canvas to blobs
            canvasLeft.toBlob(async function (leftBlob) {
                canvasRight.toBlob(async function (rightBlob) {
                    // Upload to storage using pre-signed URLs
                    await uploadToServer(leftBlob, rightBlob);
                }, 'image/jpeg');
            }, 'image/jpeg');
        }
    };

    reader.readAsDataURL(sbsImage);
});

async function uploadToServer(leftBlob, rightBlob) {
    try {
        // Show the spinner
        document.getElementById('spinner').style.display = 'block';
        document.getElementById('status').textContent = '';

        const accessToken = await getAccessToken();

        // Step 1: Get pre-signed URLs for both left and right images
        const [imLUpUrl, imLDownUrl] = await getPutGetUrl(accessToken, 'leftImage.jpg');
        const [imRUpUrl, imRDownUrl] = await getPutGetUrl(accessToken, 'rightImage.jpg');

        // Step 2: Upload left and right images to the respective URLs
        await uploadToStorage(imLUpUrl, leftBlob);
        await uploadToStorage(imRUpUrl, rightBlob);

        // Step 3: Get pre-signed URLs for the LIF file
        const [lifDispUpUrl, lifDispDownUrl] = await getPutGetUrl(accessToken, 'dispStereoLif.jpg');
        const [lifOutUpUrl, lifOutDownUrl] = await getPutGetUrl(accessToken, outputFilename);

        // Step 4: Make API call to the encoder to create the LIF file
        const execPlan = {
            executionPlan: [{
                productId: "f60f2155-3383-4456-88dc-9d5160aa81b5", // generate stereo disparity
                productParams: {
                    inputs: { inputLeftImageUrl: imLDownUrl, inputRightImageUrl: imRDownUrl },
                    outputs: { outputLifImageUrl: lifDispUpUrl }
                }
            },
            {
                productId: "1862b5a9-36d0-4624-ad6e-2c4b8f694d89", // LDL STEREO
                productParams: {
                    inputs: { inputStereoLifUrl: lifDispDownUrl },
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

        // Step 5: LIF file should now be created and available at lifDownUrl
        document.getElementById('status').textContent = `LIF file created: ${lifOutDownUrl}`;

        // Detect if the user is on a mobile device (basic detection)
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

        if (isMobile) {
            // On mobile devices (iOS & Android), open the link in a new tab
            const newWindow = window.open(lifOutDownUrl, '_blank');
            if (!newWindow) {
                alert('Please enable pop-ups to download the file.');
            }
        } else {
            // On desktop, use the anchor element to download the file
            const link = document.createElement('a');
            link.href = lifOutDownUrl;  // Use the download URL of the created LIF file
            link.download = outputFilename;  // Suggest the filename for the user to save

            // Programmatically click the link to trigger the download prompt
            document.body.appendChild(link);
            link.click();

            // Remove the link from the DOM
            document.body.removeChild(link);
        }

        document.getElementById('spinner').style.display = 'none'; // Hide the spinner
        document.getElementById('status').textContent = `LIF file created being downloaded as ${outputFilename}`;

    } catch (error) {
        console.error('Error:', error);
        document.getElementById('status').textContent = 'Error creating LIF file.';
        document.getElementById('spinner').style.display = 'none'; // Hide the spinner on error
    }
}