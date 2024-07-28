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
    const storageUrl = await getStorageUrl(accessToken,file.name);

    // Step 2: Upload the image to the pre-signed URL
    await uploadToStorage(storageUrl, file);

    // Step 3: Generate the disparity map
    const disparityMapUrl = await generateDisparityMap(accessToken, storageUrl);

    // Step 4: Display the generated disparity map
    displayDisparityMap(disparityMapUrl);
}

async function getAccessToken() {
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

async function getStorageUrl(accessToken,fileName) {
    const response = await fetch('https://api.immersity.ai/api/v1/get-upload-url?fileName=' + fileName + '&mediaType=image%2Fjpeg', {
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

async function generateDisparityMap(accessToken, storageUrl) {
    const response = await fetch('https://api.immersity.ai/api/v1/disparity', {
        method: 'POST',
        headers: {
            accept: 'application/json',
            authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            inputImageUrl: storageUrl,
            outputBitDepth: 'uint16'
        })
    });

    const data = await response.json();
    console.log('Disp Map available at: ', data.resultPresignedUrl);
    return data.resultPresignedUrl;
}

function displayDisparityMap(url) {
    const img = document.getElementById('disparityMap');
    img.src = url;
}
