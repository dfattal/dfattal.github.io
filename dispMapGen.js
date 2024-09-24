AWS_LAMBDA_URL = 'https://sk5ppdkibbohlyjwygbjqoi2ru0dvwje.lambda-url.us-east-1.on.aws';


async function uploadImage() {
    const imageInput = document.getElementById('imageInput');
    if (!imageInput.files.length) {
        alert('Please select an image file first');
        return;
    }

    const file = imageInput.files[0];
    const accessToken = await getAccessToken();

    // Step 1: Get a pre-signed URL to upload input image temporary storage
    const uploadStorageUrl = await getPutUrl(accessToken, file.name);

    // Step 2: Upload the image to the pre-signed URL
    await uploadToStorage(uploadStorageUrl, file);

    // Step 3: Get pre-signed URL for downloading input image from temporary storage
    const downloadStorageUrl = await getGetUrl(accessToken, uploadStorageUrl);

    // Step 4: Get a pre-signed URL to upload disparity map result to temporary storage
    const dispUploadStorageUrl = await getPutUrl(accessToken, 'disparity.png');

    // Step 5: Generate the disparity map
    await generateDisparityMap(accessToken, downloadStorageUrl, dispUploadStorageUrl);

    // Step 6: Get pre-signed URL for downloading disparity map result from temporary storage
    const dispDownloadStorageUrl = await getGetUrl(accessToken, dispUploadStorageUrl);

    // Step 5: Display the generated disparity map
    displayDisparityMap(dispDownloadStorageUrl);
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

async function getPutUrl(accessToken,filename) {
    const response = await fetch('https://mts-525-api.dev.immersity.ai/api/v1/get-upload-url?fileName=' + filename + '&mediaType=image%2Fjpeg', {
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

async function getGetUrl(accessToken,putUrl) {
    const response = await fetch('https://mts-525-api.dev.immersity.ai/api/v1/get-download-url?url=' + putUrl, {
        method: 'GET',
        headers: {
            authorization: `Bearer ${accessToken}`,
            accept: 'application/json'
        },
    });

    const data = await response.json();
    console.log('download URL : ', data.url);
    return data.url;
}

async function generateDisparityMap(accessToken, downloadStorageUrl, dispUploadStorageUrl) {
    const response = await fetch('https://mts-525-api.dev.immersity.ai/api/v1/process', {
        method: 'POST',
        headers: {
            accept: 'application/json',
            authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            executionPlan: [{
                productId: "4d50354b-466d-49e1-a95d-0c7f320849c6", // generate disparity
                paramsRaw: {
                    imageUrl: downloadStorageUrl,
                    resultPresignedUrl: dispUploadStorageUrl,
                    outputBitDepth: 'uint16',
                    dilation: 0
                }
            }]

        })
    });

    const data = await response.json();
    console.log(data);
}

function displayDisparityMap(url) {
    const img = document.getElementById('disparityMap');
    img.src = url;
}
