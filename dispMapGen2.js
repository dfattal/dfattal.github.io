
//const LEIA_LOGIN_OPENID_TOKEN_URL = 'https://auth.immersity.ai/auth/realms/immersity/protocol/openid-connect/token';

// URL of your Glitch project
//const GLITCH_PROJECT_URL = 'https://loving-right-chameleon.glitch.me';
// URL of AWS Lambda
AWS_LAMBDA_URL = 'https://sk5ppdkibbohlyjwygbjqoi2ru0dvwje.lambda-url.us-east-1.on.aws'
//const TWENTY_FOUR_HRS_IN_S = 24 * 60 * 60;
//const THREE_MIN_IN_MS = 3 * 60 * 1000;

//const CLIENT_ID = 'f6371d27-20d6-4551-9775-b903ca7c1c14';
//const CLIENT_SECRET = '1hLBJXOcOwh1wcADT39B4Y21sb6be4rn';

async function main() {
    console.log('Acquiring access token from LeiaLogin...');

    const tokenResponse = await axios.post(AWS_LAMBDA_URL, {
        headers: {
            'Content-Type' : 'application/x-www-form-urlencoded',
            'Access-Control-Allow-Origin': '*'
        },
    });

    console.log('Access token acquired:', tokenResponse.data);

    const accessToken = tokenResponse.data.access_token;

    console.log(`\nLeiaLogin AccessToken acquired: ${accessToken}`);

    const response = await fetch('https://api.dev.immersity.ai/api/v1/get-upload-url?fileName=myFile.jpg&mediaType=image%2Fjpeg', {
        method: 'GET',
        headers: {
            authorization: `Bearer ${accessToken}`,
            accept: 'application/json'
        },
    });
    const data = await response.json();
    console.log(data.url);

}

main();


