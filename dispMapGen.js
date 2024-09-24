AWS_LAMBDA_URL = 'https://sk5ppdkibbohlyjwygbjqoi2ru0dvwje.lambda-url.us-east-1.on.aws';


async function uploadImage() {
    const imageInput = document.getElementById('imageInput');
    if (!imageInput.files.length) {
        alert('Please select an image file first');
        return;
    }

    const file = imageInput.files[0];
    const accessToken = await getAccessToken();

    // Step 1: Get a pre-signed URL for temporary storage
    const uploadStorageUrl = await getUploadStorageUrl(accessToken, file.name);

    // Step 2: Upload the image to the pre-signed URL
    await uploadToStorage(uploadStorageUrl, file);

    // Step 3: Get pre-signed URL for temporary disp map storage
    const downloadStorageUrl = await getDownloadStorageUrl(accessToken, uploadStorageUrl);

    // Step 4: Generate the disparity map
    await generateDisparityMap(accessToken, uploadStorageUrl, downloadStorageUrl);

    // Step 5: Display the generated disparity map
    displayDisparityMap(downloadStorageUrl);
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

async function getUploadStorageUrl(accessToken,filename) {
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

async function getDownloadStorageUrl(accessToken,fileUrl) {
    const response = await fetch('https://mts-525-api.dev.immersity.ai/api/v1/get-download-url?url=' + fileUrl, {
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

async function generateDisparityMap(accessToken, uploadStorageUrl, downloadStorageUrl) {
    const response = await fetch('https://mts-525-api.dev.immersity.ai/api/v1/disparity', {
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
                    imageUrl: uploadStorageUrl,
                    resultPresignedUrl: downloadStorageUrl,
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
