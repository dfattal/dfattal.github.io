AWS_LAMBDA_URL = 'https://sk5ppdkibbohlyjwygbjqoi2ru0dvwje.lambda-url.us-east-1.on.aws';
const endpointUrl = 'https://mts-525-api.dev.immersity.ai/api/v1';

async function uploadImage() {
    const imageInputL = document.getElementById('imageInputL');
    if (!imageInputL.files.length) {
        alert('Please select a Left image file');
        return;
    }
    const imageInputR = document.getElementById('imageInputR');
    if (!imageInputL.files.length) {
        alert('Please select a Right image file');
        return;
    }
    const fileL = imageInputL.files[0];
    const fileR = imageInputR.files[0];
    const accessToken = await getAccessToken();

    // Step 1: Get a pre-signed URL to upload and download input image to/from temporary storage
    const [imLUpUrl, imLDownUrl] = await getPutGetUrl(accessToken, fileL.name);
    const [imRUpUrl, imRDownUrl] = await getPutGetUrl(accessToken, fileR.name);

    // Step 2: Upload the image to the pre-signed URL
    await uploadToStorage(imLUpUrl, fileL);
    await uploadToStorage(imRUpUrl, fileR);

     // Step 3: Get a pre-signed URL to upload and download input image to/from temporary storage
     const [lifUpUrl, lifDownUrl] = await getPutGetUrl(accessToken, 'stereoLif.jpg');

    // Step 4: Generate the disparity map
    await generateDisparityMap(accessToken, imLDownUrl, imRDownUrl, lifUpUrl);

    // Step 5: Display the generated disparity map
    displayLifFile(lifDownUrl);
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

async function getPutGetUrl(accessToken,filename) {
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

async function generateDisparityMap(accessToken, imLDownUrl, imRDownUrl, lifUpUrl) {
    const response = await fetch('https://mts-525-api.dev.immersity.ai/api/v1/process', {
        method: 'POST',
        headers: {
            accept: 'application/json',
            authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            executionPlan: [{
                productId: "f60f2155-3383-4456-88dc-9d5160aa81b5", // generate stereo disparity
                productParams: {
                    limageUrl: imLDownUrl,
                    rimageUrl: imRDownUrl,
                    outputLifImageUrl: lifUpUrl
                }
            }]

        })
    });

    const data = await response.json();
    console.log(data);
}

function displayLifFile(url) {
    const img = document.getElementById('stereoLif');
    img.src = url;
}
