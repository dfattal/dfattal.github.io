imDiv = document.getElementById('image-preview');

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

    window.open(`../newShaderLDI/index.html`, '_blank');
}

// Function to generate an image from the Hugging Face API
async function generateImage(mode) {
    const prompt = document.getElementById('message-content').value;

    if (!prompt.trim()) {
        alert("Please enter a prompt to generate an image.");
        return;
    }

    showLoadingSpinner(); // Show loading spinner while waiting for image generation
    const endpoint = `https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-${mode}`; // -dev

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer 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',  // Replace with your actual Hugging Face API key
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                inputs: prompt,
                options: { seed: Math.floor(Math.random() * 1000000) }
            })
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);
        displayImage(imageUrl); // Display the generated image in the preview area
        imDiv.classList.add('glowing');
        
        const imageFile = new File([blob], 'generatedImage.jpg', { type: 'image/jpeg' });
        const lifGen = new monoLdiGenerator(imageFile);
    
        lifGen.afterLoad = function () {
            
            const viewer = new lifViewer(this.lifDownloadUrl, imDiv, height = 400, autoplay=true);
            viewer.afterLoad = function() {
                this.container.firstElementChild.style.display = 'none';
                this.container.classList.remove('glowing');
                this.container.onclick = function() {sendToViz(lifGen.lifDownloadUrl)};
                this.container.addEventListener('mouseenter', () => this.startAnimation());
                this.container.addEventListener('mouseleave', () => this.stopAnimation());
            };
            
        }
        await lifGen.init()

    } catch (error) {
        console.error('Error generating image:', error);
        alert('Error generating image. Please try again.');
    }
}

// Add event listener for the Enter key
document.getElementById('message-content').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent default form submission behavior
        generateImage(); // Trigger image generation
    }
});