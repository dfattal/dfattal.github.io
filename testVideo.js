

async function main() {
    try {
        // Request the user-facing camera
        const constraints = {
            video: {
                facingMode: { ideal: 'user' }       // to get the best FOV
            }
        };

        // Get the media stream
        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        const video = await setupCamera();
        console.log(`Actual video resolution: ${video.videoWidth}x${video.videoHeight}`);
        document.getElementById("resolution").textContent = [video.videoWidth,video.videoHeight];
        document.body.appendChild(video);

        iOSmsg = document.getElementById("iOSmsg");
        function startVideo() {
            iOSmsg.remove();
            video.play();
        }

        if (isIOS()) {
          console.log("iOS Device Detected");
          iOSmsg.textContent = "iOS Device Detected. Click to start video.";
          document.addEventListener('click', startVideo, { once: true });
        } else {
          startVideo();
        }



    } catch (error) {
        console.error('Error accessing user-facing camera:', error);
    }
}

// Call the function to get the camera feed
main();

