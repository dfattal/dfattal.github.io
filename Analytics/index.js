let tokenClient;
let accessToken = null;
let isAuthenticated = false; // Track whether the user is authenticated
const CLIENT_ID = '410658156818-j3om3g8t3vjopli6289lbi4ccjdm5dkc.apps.googleusercontent.com'; // Replace with your client ID
const API_KEY = 'AIzaSyC46hi6wzshjF7XtaoDruOm4zFXfrIb0nM'; // Replace with your API key
const PROPERTY_ID = '406177208';  // Replace with your GA4 Property ID
const SCOPES = "https://www.googleapis.com/auth/analytics.readonly";
const GA4_DISCOVERY_DOC = "https://analyticsdata.googleapis.com/$discovery/rest?version=v1beta";

// Get the full URL
const urlParams = new URLSearchParams(window.location.search);

const decency = urlParams.get('decency')? urlParams.get('decency') : true; // Set to true to enable decency checks
const API_URL = 'https://dashboard-endpoint.immersity.ai'; // Use the provided API URL
// const API_URL = 'http://localhost:3000';

let animationList = []; // To store the list of animation URLs
let timeList = []; // To store the list of animation times
let nameList = []; // To store the list of animation names
let decencyList = []; // To store the list of decency values
let currentIndex = 0; // To track the current animation being played
let videoTimeout;

function timeAgo(epochTime) {
    const currentTime = Math.floor(Date.now() / 1000); // Get current time in seconds (Epoch)
    const timeDifference = currentTime - (epochTime / 1000); // Convert epochTime from milliseconds to seconds

    const minutes = Math.floor(timeDifference / 60);
    const hours = Math.floor(timeDifference / (60 * 60));
    const days = Math.floor(timeDifference / (60 * 60 * 24));

    if (minutes < 1) {
        return 'Just now';
    } else if (minutes < 60) {
        return `${minutes} mins ago`;
    } else if (hours < 24) {
        return `${hours}h ago`;
    } else {
        return `${days} days ago`;
    }
}

function initClient() {
    gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: [GA4_DISCOVERY_DOC],
    }).then(function () {
        const eventSource = new EventSource(API_URL + '/filtering-progress');

        eventSource.onmessage = function (event) {
            document.getElementById('progress-container').style.display = 'inline-block';
            const progressData = JSON.parse(event.data);
            const progress = progressData.progress;

            // Update the width of the progress bar
            const progressBar = document.getElementById('progress-bar');
            progressBar.style.width = progress + '%';

            // Optional: Show percentage text inside the bar
            progressBar.textContent = Math.round(progress) + '%';
        };

        // Listen for the 'close' event indicating progress is complete
        eventSource.addEventListener('close', function (event) {
            console.log('Decency Progress complete! Closing connection.');

            // Close the EventSource connection
            eventSource.close();

            // Remove the progress bar div
            const progressContainer = document.getElementById('progress-container');
            progressContainer.remove();
        });
        fetchLatestAnimations(); // Start fetching videos only after authentication
        loadAnalyticsData(); // Start fetching GA4 metrics
        // Fetch the latest animations every 60 seconds (after authentication)
        setInterval(() => {
            if (isAuthenticated) {
                fetchLatestAnimations();
            }
        }, 60000);
    }, function (error) {
        console.error('Error initializing API client:', JSON.stringify(error, null, 2));
    });
}

function handleSignIn() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response) => {
            if (response.error) {
                console.error(response);
                return;
            }
            accessToken = response.access_token;
            gapi.load('client', initClient);
            document.getElementById('signin-button').style.display = 'none';
            document.getElementById('signout-button').style.display = 'block';
            console.log('Token acquired:', accessToken);
            isAuthenticated = true;

        },
    });
    tokenClient.requestAccessToken();

}

// Sign-out function
function handleSignOut() {
    google.accounts.oauth2.revoke(accessToken, () => {
        console.log('Access token revoked.');
        isAuthenticated = false;
        document.getElementById("signin-button").style.display = 'block';
        document.getElementById("signout-button").style.display = 'none';
        // Stop fetching videos when signed out
        clearTimeout(videoTimeout);
    });
}

// Function to load GA4 metrics
function loadAnalyticsData() {
    if (!accessToken) return;

    // Request Daily Active Users
    gapi.client.request({
        path: `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}:runReport`,
        method: 'POST',
        body: {
            "metrics": [
                { "name": "activeUsers" }
            ],
            "dateRanges": [
                { "startDate": "1daysAgo", "endDate": "today" }
            ]
        }
    }).then(function (response) {
        const dailyActiveUsers = response.result.rows[0].metricValues[0].value;
        document.getElementById('daily-active-users').innerText = parseInt(dailyActiveUsers).toLocaleString();
    }, function (error) {
        console.error('Error fetching Daily Active Users:', error);
    });

    // Request Active Users in the Last Minute (Real-Time)
    gapi.client.request({
        path: `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}:runRealtimeReport`,
        method: 'POST',
        body: {
            "metrics": [
                { "name": "activeUsers" }
            ],
            "minuteRanges": [
                { "startMinutesAgo": 1, "endMinutesAgo": 0 }
            ]
        }
    }).then(function (response) {
        const activeUsersLastMinute = response.result.rows[0].metricValues[0].value;
        document.getElementById('active-users-minute').innerText = activeUsersLastMinute;
    }, function (error) {
        console.error('Error fetching Active Users in the Last Minute (Real-Time):', error);
    });

    // Request Daily Downloads
    gapi.client.request({
        path: `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}:runReport`,
        method: 'POST',
        body: {
            "dimensions": [
                { "name": "eventName" }
            ],
            "metrics": [
                { "name": "eventCount" }
            ],
            "dateRanges": [
                { "startDate": "1daysAgo", "endDate": "today" }
            ],
            "dimensionFilter": {
                "filter": {
                    "fieldName": "eventName",
                    "stringFilter": {
                        "matchType": "EXACT",
                        "value": "Export Page Download Button"
                    }
                }
            }
        }
    }).then(function (response) {
        const dailyDownloads = response.result.rows[0].metricValues[0].value;
        document.getElementById('daily-downloads').innerText = parseInt(dailyDownloads).toLocaleString();
    }, function (error) {
        console.error('Error fetching Daily Downloads:', error);
    });

    // Request Downloads in the Last Minute (Real-Time)
    gapi.client.request({
        path: `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}:runRealtimeReport`,
        method: 'POST',
        body: {
            "dimensions": [
                { "name": "eventName" }
            ],
            "metrics": [
                { "name": "eventCount" }
            ],
            "dimensionFilter": {
                "filter": {
                    "fieldName": "eventName",
                    "stringFilter": {
                        "matchType": "EXACT",
                        "value": "Export Page Download Button"
                    }
                }
            },
            "minuteRanges": [
                { "startMinutesAgo": 1, "endMinutesAgo": 0 }
            ]
        }
    }).then(function (response) {
        const downloadsLastMinute = response.result.rows[0].metricValues[0].value;
        document.getElementById('downloads-minute').innerText = downloadsLastMinute;
    }, function (error) {
        console.error('Error fetching Downloads in the Last Minute (Real-Time):', error);
    });

    // Request Daily Credit Purchases
    gapi.client.request({
        path: `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}:runReport`,
        method: 'POST',
        body: {
            "dimensions": [
                { "name": "eventName" }
            ],
            "metrics": [
                { "name": "eventCount" }
            ],
            "dateRanges": [
                { "startDate": "1daysAgo", "endDate": "today" }
            ],
            "dimensionFilter": {
                "filter": {
                    "fieldName": "eventName",
                    "stringFilter": {
                        "matchType": "EXACT",
                        "value": "Export Page Buy Credits Button"
                    }
                }
            }
        }
    }).then(function (response) {
        const dailyCredits = response.result.rows[0].metricValues[0].value;
        document.getElementById('daily-credits').innerText = parseInt(dailyCredits).toLocaleString();
    }, function (error) {
        console.error('Error fetching Daily Credits:', error);
    });

    // Request Credit Purchases in the Last 30 Minutes (Real-Time)
    gapi.client.request({
        path: `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}:runRealtimeReport`,
        method: 'POST',
        body: {
            "dimensions": [
                { "name": "eventName" }
            ],
            "metrics": [
                { "name": "eventCount" }
            ],
            "dimensionFilter": {
                "filter": {
                    "fieldName": "eventName",
                    "stringFilter": {
                        "matchType": "EXACT",
                        "value": "Export Page Buy Credits Button"
                    }
                }
            },
            "minuteRanges": [
                { "startMinutesAgo": 29, "endMinutesAgo": 0 }
            ]
        }
    }).then(function (response) {
        const creditsLast30Minutes = response.result.rows[0].metricValues[0].value;
        document.getElementById('credits-minute').innerText = creditsLast30Minutes;
    }, function (error) {
        console.error('Error fetching Credit Purchases in the Last 30 Minutes (Real-Time):', error);
    });
}

async function fetchLatestAnimations() {
    try {
        const response = await fetch(API_URL + `/latest-animations?checkDecency=${decency}`);
        const data = await response.json();
        console.log(data);

        if (data.animations && data.animations.length > 0) {
            // Only update the animation list if there is a change
            const newUrls = data.animations.map(anim => anim.resultDownloadUrl);
            const newTimes = data.animations.map(anim => anim.endedAt);
            const newNames = data.animations.map(anim => anim.filename);
            const newDecency = data.animations.map(anim => anim.isIndecent);
            if (JSON.stringify(newUrls) !== JSON.stringify(animationList)) {
                animationList = newUrls;
                timeList = newTimes;
                nameList = newNames;
                decencyList = newDecency;
                currentIndex = 0; // Reset the index when the list changes
                playCurrentAnimation();
                console.log('Loaded new animations:', animationList);
            } else {
                console.log('No new animations found, keeping current list.');
            }
        } else {
            console.error('No animations found.');
        }
    } catch (error) {
        console.error('Error fetching animations:', error);
    }
}

function playCurrentAnimation() {
    if (animationList.length > 0) {
        const videoContainer = document.getElementById('container');
        const video = document.getElementById('animation-video');
        const videoSource = document.getElementById('video-source');
        const timeAgoElement = document.getElementById('timeAgo'); // Get the time ago element

        const currentAnimation = animationList[currentIndex]; // URL or path
        const currentFilename = nameList[currentIndex]; // Get the filename from the server data
        const currentDecency = decencyList[currentIndex]; // Get the decency value from the server data

        // Check if the file is an image (gif, jpg, png)
        const isImage = /\.(gif|jpg|jpeg|png)$/i.test(currentFilename);
        const isGIF = /\.(gif)$/i.test(currentFilename);

        if (isImage) {
            // Remove the video element and replace it with an img element for images (GIF, JPG, PNG)
            video.style.display = 'none'; // Hide video element if it exists
            let imageElement = document.getElementById('image-element');

            if (!imageElement) {
                imageElement = document.createElement('img');
                imageElement.id = 'image-element';
                // imageElement.style.maxHeight = '90vh';
                // imageElement.style.maxWidth = '100%';
                videoContainer.insertBefore(imageElement, videoContainer.firstChild);
            }

            imageElement.src = currentAnimation; // Set the image source
            imageElement.style.display = 'inline-block'; // Show the image
            if (currentDecency) {
                imageElement.style.filter = 'blur(20px)';
            } else {
                imageElement.style.filter = 'none';
            }

            // Update the time ago text for the image
            timeAgoElement.textContent = timeAgo(timeList[currentIndex]) + ` (${isGIF ? "GIF" : "IMG"}) `;

            // Skip to next animation after 10 seconds
            clearTimeout(videoTimeout);
            videoTimeout = setTimeout(() => {
                skipToNextVideo(); // Skip to the next animation after 10 seconds
            }, 10000);

        } else {
            // Handle video as usual
            video.style.display = 'inline-block'; // Show video element
            let imageElement = document.getElementById('image-element');
            if (imageElement) {
                imageElement.style.display = 'none'; // Hide image if previously used
            }

            // Set the video source to the current animation
            videoSource.src = currentAnimation;
            video.load(); // Load the current video
            if (currentDecency) {
                video.style.filter = 'blur(20px)';
            } else {
                video.style.filter = 'none';
            }

            video.onloadedmetadata = function () {
                if (video.duration > 0) {
                    // Valid video: Update the time ago text
                    timeAgoElement.textContent = timeAgo(timeList[currentIndex]) + ' (MP4)';
                } else {
                    console.warn('Corrupted or unreadable video, skipping...');
                    skipToNextVideo();
                }
            };

            video.oncanplaythrough = function () {
                video.play().catch(error => {
                    if (error.name === 'AbortError') {
                        console.warn('Playback was aborted to save power.');
                    } else {
                        console.error('Error playing video:', error);
                    }
                    skipToNextVideo();
                });
            };

            // Listen for any playback errors and skip the video if needed
            video.onerror = function () {
                console.error('Error loading video, skipping...');
                skipToNextVideo();
            };

            // Clear any existing timeout to avoid overlapping
            clearTimeout(videoTimeout);

            // Set a timeout to skip the video after 10 seconds
            videoTimeout = setTimeout(() => {
                video.pause(); // Pause the video after 10 seconds
                skipToNextVideo(); // Move to the next video
            }, 10000); // 10,000 milliseconds = 10 seconds

            // Listen for the 'ended' event to play the next video in the list
            video.onended = () => {
                clearTimeout(videoTimeout); // Clear the timeout if the video ends naturally
                skipToNextVideo(); // Move to the next video
            };
        }
    }
}

function skipToNextVideo() {
    currentIndex = (currentIndex + 1) % animationList.length; // Loop back to the first video
    playCurrentAnimation(); // Play the next animation
}

function initializeSignInButton() {
    google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: handleSignIn,
    });

    google.accounts.id.renderButton(
        document.getElementById('signin-button'),
        { theme: 'outline', size: 'small' } // Customizations to button
    );
}

window.onload = function () {
    gapi.load('client', () => {
        gapi.client.setApiKey(API_KEY);
    });
    initializeSignInButton();
};