AWS_LAMBDA_URL = 'https://sk5ppdkibbohlyjwygbjqoi2ru0dvwje.lambda-url.us-east-1.on.aws';
const endpointUrl = 'https://api.dev.immersity.ai/api/v1';

async function uploadImage() {
    const imageInput = document.getElementById('imageInput');
    if (!imageInput.files.length) {
        alert('Please select an image file first');
        return;
    }

    const file = imageInput.files[0];
    const accessToken = await getAccessToken();

    // Step 1: Get a pre-signed URL to upload and download input image to/from temporary storage
    const [uploadStorageUrl, downloadStorageUrl] = await getPutGetUrl(accessToken, file.name);

    // Step 2: Upload the image to the pre-signed URL
    await uploadToStorage(uploadStorageUrl, file);

    // Step 3: Get a pre-signed URL to upload and download input image to/from temporary storage
    const [dispUploadStorageUrl, dispDownloadStorageUrl] = await getPutGetUrl(accessToken, 'disparity.png');

    // Step 4: Generate the disparity map
    await generateDisparityMap(accessToken, downloadStorageUrl, dispUploadStorageUrl);

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

async function generateDisparityMap(accessToken, downloadStorageUrl, dispUploadStorageUrl) {
    const response = await fetch(endpointUrl + '/process', {
        method: 'POST',
        headers: {
            accept: 'application/json',
            authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            executionPlan: [{
                productId: "b109355d-12a9-41fe-bd36-94bde1634da0", // Gateway
                productParams: {
                    url: "http://3.95.133.35:8080/v1/depth-map-refined", // Apple Depth Pro
                    method: "POST",
                    body: {
                        inputs: {"inputImageUrl": downloadStorageUrl},
                        outputs: {"outputDisparityUrl": dispUploadStorageUrl},
                        params: {
                            outputFormat: "disparity",
                            outputType: "uint16",
                            dilation: 0
                        }
                    }
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
