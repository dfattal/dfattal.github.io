const AWS_LAMBDA_URL = 'https://sk5ppdkibbohlyjwygbjqoi2ru0dvwje.lambda-url.us-east-1.on.aws';
const endpointUrl = 'https://api.dev.immersity.ai/api/v1';

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
        const accessToken = await getAccessToken();

        // Step 1: Get pre-signed URLs for both left and right images
        const [imLUpUrl, imLDownUrl] = await getPutGetUrl(accessToken, 'leftImage.jpg');
        const [imRUpUrl, imRDownUrl] = await getPutGetUrl(accessToken, 'rightImage.jpg');

        // Step 2: Upload left and right images to the respective URLs
        await uploadToStorage(imLUpUrl, leftBlob);
        await uploadToStorage(imRUpUrl, rightBlob);

        // Step 3: Get pre-signed URLs for the LIF file
        const [lifUpUrl, lifDownUrl] = await getPutGetUrl(accessToken, 'stereoLif.lif');

        // Step 4: Make API call to the encoder to create the LIF file
        const execPlan = {
            executionPlan: [{
                productId: "abaec513-8405-45ee-9ad6-c0a99ee972b5", // LIF ENCODER
                productParams: {
                    inputs: {
                        inputImageUrl: imLDownUrl,
                        inputRightImageUrl: imRDownUrl
                    },
                    outputs: { outputLifUrl: lifUpUrl },
                    params: {
                        
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
        document.getElementById('status').textContent = `LIF file created: ${lifDownUrl}`;
        console.log('LIF file URL:', lifDownUrl);

    } catch (error) {
        console.error('Error:', error);
        document.getElementById('status').textContent = 'Error creating LIF file.';
    }
}