imDiv = document.getElementById('image-preview');
// Backend proxy endpoint hosted on Vercel
const API_URL = 'https://vercel-apis-pi.vercel.app/api/generate';
let lifGen = null; // Declare lifGen globally to be accessible by other functions

// Get the full URL
const urlParams = new URLSearchParams(window.location.search);
const inpainting = urlParams.get('inpainting') ? urlParams.get('inpainting') : 'lama'; // Default to lama


// Function to show the loading spinner while the image is being generated
function showLoadingSpinner() {
    imDiv.innerHTML = `<div class="spinner"></div>`;
}

// Function to display the generated image
function displayImage(imageUrl) {
    imDiv.innerHTML = `<img src="${imageUrl}"/>`;
}

// Function to send an image to the visualization app
async function sendToViz(url) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const binaryString = arrayBufferToBinaryString(arrayBuffer);
    const base64String = btoa(binaryString);
    const request = indexedDB.open("lifFileDB", 1);

    request.onupgradeneeded = function (event) {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("lifFiles")) {
            db.createObjectStore("lifFiles", { keyPath: "id" });
        }
    };

    request.onsuccess = function (event) {
        const db = event.target.result;
        const transaction = db.transaction(["lifFiles"], "readwrite");
        const objectStore = transaction.objectStore("lifFiles");
        const fileData = { id: "lifFileData", data: base64String };

        const requestUpdate = objectStore.put(fileData);

        requestUpdate.onsuccess = function () {
            console.log("File saved to IndexedDB successfully!");
        };

        requestUpdate.onerror = function () {
            console.error("Error saving file to IndexedDB");
        };
    };

    request.onerror = function () {
        console.error("Error opening IndexedDB");
    };

    window.open(`../VIZ/index.html`, '_blank');
}

let longPressTimer;

// Function to disable both right-click and long-press download
function disableDownloadOption() {
    imDiv.removeEventListener('contextmenu', handleRightClickDownload);
    imDiv.removeEventListener('touchstart', handleTouchStart);
    imDiv.removeEventListener('touchend', cancelLongPress);
    imDiv.removeEventListener('touchcancel', cancelLongPress);
}

// Function to enable both right-click and long-press download
function enableDownloadOption(lifGen) {
    imDiv.addEventListener('contextmenu', handleRightClickDownload);
    imDiv.addEventListener('touchstart', handleTouchStart);
    imDiv.addEventListener('touchend', cancelLongPress);
    imDiv.addEventListener('touchcancel', cancelLongPress);
}

// Function to handle the right-click download and long-press download
async function handleRightClickDownload(event) {
    event.preventDefault(); // Prevent the default right-click menu or long press default behavior

    // Ensure lifGen is defined before trying to download
    if (lifGen && lifGen.lifDownloadUrl) {
        try {
            const fileName = 'genAI_LIF.jpg'; // Default file name

            // Check if showSaveFilePicker is supported
            if (window.showSaveFilePicker) {
                const options = {
                    suggestedName: fileName,
                    types: [{
                        description: 'JPEG Image',
                        accept: { 'image/jpeg': ['.jpg', '.jpeg'] }
                    }]
                };

                const handle = await window.showSaveFilePicker(options);
                const writableStream = await handle.createWritable();
                const response = await fetch(lifGen.lifDownloadUrl);
                const arrayBuffer = await response.arrayBuffer();
                await writableStream.write(new Blob([arrayBuffer], { type: 'image/jpeg' }));
                await writableStream.close();

                console.log('File saved successfully');
            } else {
                // Fallback for iOS or other browsers that do not support showSaveFilePicker
                const response = await fetch(lifGen.lifDownloadUrl);
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);

                const link = document.createElement('a');
                link.href = url;
                link.download = fileName;
                document.body.appendChild(link);
                link.click();

                // Clean up and remove the link
                document.body.removeChild(link);
                URL.revokeObjectURL(url);

                console.log('File downloaded successfully using fallback');
            }
        } catch (err) {
            console.error('Error saving the file:', err);
        }
    } else {
        console.error('LIF file not available for download');
    }
}

// Function to start the long-press timer
function handleTouchStart(event) {
    longPressTimer = setTimeout(async () => {
        await handleRightClickDownload(event); // Reuse the right-click download function
    }, 500); // 500ms long press threshold
}

// Function to cancel the long-press if the user lifts their finger too early
function cancelLongPress() {
    clearTimeout(longPressTimer);
}

// In the generateImage function, manage download option accordingly
async function generateImage(mode) {
    const prompt = document.getElementById('message-content').value;

    if (!prompt.trim()) {
        alert("Please enter a prompt to generate an image.");
        return;
    }

    showLoadingSpinner(); // Show loading spinner while waiting for image generation
    disableDownloadOption(); // Disable right-click download during generation

    // Call your Vercel proxy (no token on the client!)
    try {
        const response = await fetch(API_URL + `?mode=${encodeURIComponent(mode)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                inputs: prompt,
                parameters: { seed: Math.floor(Math.random() * 1000000) }
            })
        });

        if (!response.ok) {
            // Clear loading state before surfacing the error
            imDiv.innerHTML = '';
            imDiv.classList.remove('glowing');
            const text = await response.text();
            alert(`Proxy error (${response.status}): ${text}`);
            return;
        }

        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);
        displayImage(imageUrl); // Display the generated image in the preview area
        imDiv.classList.add('glowing');

        const imageFile = new File([blob], 'generatedImage.jpg', { type: 'image/jpeg' });
        lifGen = new monoLdiGenerator(imageFile, inpainting);

        lifGen.afterLoad = function () {
            const viewer = new lifViewer(this.lifDownloadUrl, imDiv, height = 400, autoplay = true);
            viewer.afterLoad = function () {
                this.container.firstElementChild.style.display = 'none';
                this.container.classList.remove('glowing');
                this.container.onclick = function () { sendToViz(lifGen.lifDownloadUrl) };
                this.container.addEventListener('mouseenter', () => this.startAnimation());
                this.container.addEventListener('mouseleave', () => this.stopAnimation());

                // Re-enable right-click download option after LIF generation
                enableDownloadOption(lifGen);
            };
        };

        await lifGen.init();

    } catch (error) {
        console.error('Error generating image:', error);
        // Clear any loading state
        imDiv.innerHTML = '';
        imDiv.classList.remove('glowing');
        alert('Error generating image. Please try again.');
    }
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    // Add event listener for the Enter key in prompt textarea
    document.getElementById('message-content').addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            event.preventDefault(); // Prevent default form submission behavior
            generateImage(); // Trigger image generation
        }
    });

    // List of prompts with brackets
    const prompts = [
        "A [beautiful young] woman with [long, wavy brunette hair] rests her head on her clasped hands, she is looking in the camera. She is dressed in [a purple top] and wears [a delicate bracelet on her left wrist]. Her expression is [gentle and thoughtful], enhanced by [natural makeup and a hint of purple lipstick]. The background is [a dim and blurred office space], drawing attention to [her face and hands].",
        "A [handsome young] man with [short, curly blonde hair] leans against a [window sill], gazing outside with [a thoughtful expression]. He is dressed in [a light blue button-down shirt] and wears [a leather watch on his right wrist]. The background is [a brightly lit apartment], softly focusing on [his posture and expression].",
        "A [stylish middle-aged] woman with [straight, jet-black hair] is [sitting cross-legged] on a couch, holding a book in her lap. She is dressed in [a dark green sweater] and wears [gold hoop earrings]. Her expression is [calm and peaceful], complemented by [minimal makeup and neutral lipstick]. The background is [a cozy living room], accentuating [her relaxed pose and serene demeanor].",
        "A [young man] with [medium-length auburn hair] is [standing with arms crossed], looking confidently into the camera. He is wearing [a casual black hoodie] and has [a silver chain around his neck]. His expression is [bold and charismatic], highlighted by [sharp facial features]. The background is [a dimly lit street at night], drawing focus to [his strong stance and determined look].",
        "A [cheerful elderly] woman with [short, silver hair] is [laughing with her head tilted back], her hands clasped together. She is wearing [a light pink cardigan] and has [a pearl necklace around her neck]. Her expression is [joyful and infectious], complemented by [bright red lipstick and soft wrinkles]. The background is [a sunny park], emphasizing [her radiant energy and warm smile].",
        "A [confident young] man with [close-cropped black hair] is [seated on a stool], looking directly into the camera. He is dressed in [a gray turtleneck] and wears [a sleek silver ring on his left hand]. His expression is [serious and contemplative], enhanced by [a clean-shaven face and sharp cheekbones]. The background is [a minimalist office space], with the focus on [his calm yet intense expression]."
    ];

    // Select a random prompt
    const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];

    // Set the random prompt as the value of the textarea
    document.getElementById("message-content").value = randomPrompt;
});