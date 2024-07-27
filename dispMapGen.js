async function uploadImage() {
    const imageInput = document.getElementById('imageInput');
    if (!imageInput.files.length) {
        alert('Please select an image file first');
        return;
    }

    const file = imageInput.files[0];
    const accessToken = await getAccessToken();

    // Step 1: Get a pre-signed URL for temporary storage
    const storageUrl = await getStorageUrl(accessToken);

    // Step 2: Upload the image to the pre-signed URL
    await uploadToStorage(storageUrl, file);

    // Step 3: Generate the disparity map
    const disparityMapUrl = await generateDisparityMap(accessToken, storageUrl);

    // Step 4: Display the generated disparity map
    displayDisparityMap(disparityMapUrl);
}

async function getAccessToken() {
    const response = await fetch('https://auth.immersity.ai/auth/realms/immersity/protocol/openid-connect/token', {
        method: 'POST',
        headers: {
            accept: 'application/json',
            'content-type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: 'f6371d27-20d6-4551-9775-b903ca7c1c14',
            client_secret: 'f6371d27-20d6-4551-9775-b903ca7c1c14'
        })
    });
    const data = await response.json();
    return data.access_token;
}

async function getStorageUrl(accessToken,file) {
    const response = await fetch('https://api.immersity.ai/api/v1/get-upload-url?fileName' + file + '&mediaType=image%2Fjpeg', {
        method: 'GET',
        headers: {
            authorization: `Bearer ${accessToken}`,
            accept: 'application/json'
        },
    });

    const data = await response.json();
    return data.url;
}

async function uploadToStorage(url, file) {
    await fetch(url, {
        method: 'PUT',
        headers: {
            'Content-Type': file.type
        },
        body: file
    });
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
            imageUrl: storageUrl
        })
    });

    const data = await response.json();
    return data.disparityMapUrl;
}

function displayDisparityMap(url) {
    const img = document.getElementById('disparityMap');
    img.src = url;
}
