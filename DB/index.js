import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.1.0/+esm';

const supabaseUrl = 'https://jcrggsguegcmuvdglifa.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impjcmdnc2d1ZWdjbXV2ZGdsaWZhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNTY3MzEzMywiZXhwIjoyMDQxMjQ5MTMzfQ.V1_vSCOo7tINwWuU6PFU7fQnBCMNrAwPYG-XMtonmLA';
const supabase = createClient(supabaseUrl, supabaseKey);

const bucketName = 'testAppImages';
let deleteMode = false; // Track if the user is in delete mode
let downloadMode = false; // Track if the user is in download mode

// IndexedDB functions for caching
function openIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("imageCacheDB", 1);
        request.onupgradeneeded = function (event) {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("images")) {
                db.createObjectStore("images", { keyPath: "id" });
            }
        };
        request.onsuccess = function (event) {
            resolve(event.target.result);
        };
        request.onerror = function (event) {
            reject("Error opening IndexedDB");
        };
    });
}

async function cacheImage(id, imageData) {
    const db = await openIndexedDB();
    const transaction = db.transaction("images", "readwrite");
    const objectStore = transaction.objectStore("images");
    objectStore.put({ id, data: imageData });
}

async function getCachedImage(id) {
    const db = await openIndexedDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("images", "readonly");
        const objectStore = transaction.objectStore("images");
        const request = objectStore.get(id);
        request.onsuccess = function (event) {
            resolve(event.target.result ? event.target.result.data : null);
        };
        request.onerror = function () {
            reject("Error fetching image from cache");
        };
    });
}

async function removeCachedImage(id) {
    const db = await openIndexedDB();
    const transaction = db.transaction("images", "readwrite");
    const objectStore = transaction.objectStore("images");
    objectStore.delete(id);
}

// Function to handle image uploading
async function uploadImage(fileInput) {

    const file = fileInput.files[0];

    try {
        const arrayBuffer = await file.arrayBuffer();
        const lifInfo = await parseLif53(arrayBuffer);
        console.log(lifInfo);
    } catch (e) {
        alert('Please choose a valid LIF file 🙏');
        return;
    }

    const fileName = `${file.name}`;
    const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(fileName, file);

    if (error) {
        console.error('Error uploading image:', error);
        alert('Failed to upload image.');
    } else {
        const publicURL = supabase.storage.from(bucketName).getPublicUrl(file.name);

        if (publicURL) {
            appendImageToGrid(fileName, publicURL.data.publicUrl);
            cacheImage(fileName, publicURL.data.publicUrl);
            //alert('Image uploaded successfully!');
        }
    }
}

// Function to display images in the grid
async function displayImages() {
    const { data, error } = await supabase.storage
        .from(bucketName)
        .list();
    if (error) {
        console.error('Error retrieving images:', error);
        return;
    }

    const imageGrid = document.getElementById('imageGrid');
    imageGrid.innerHTML = ''; // Clear the grid without full reload

    for (const file of data) {
        let cachedImage = await getCachedImage(file.name);
        if (cachedImage) {
            appendImageToGrid(file.name, cachedImage);
        } else {
            try {
                const publicURL = supabase.storage.from(bucketName).getPublicUrl(file.name);
                if (publicURL) {
                    appendImageToGrid(file.name, publicURL.data.publicUrl);
                    cacheImage(file.name, publicURL.data.publicUrl);
                }
            } catch (err) {
                console.error('Error processing file:', file.name, err);
            }
        }
    }
}

// Function to add an image element to the DOM grid
function appendImageToGrid(id, url) {
    const container = document.createElement('div');
    container.id = id;

    document.getElementById('imageGrid').appendChild(container);
    let lifObj = new lifViewer(url, container);

    // Add onclick event for image deletion in delete mode
    container.onclick = async () => {
        if (deleteMode) {
            const confirmDelete = confirm('Delete?');
            if (confirmDelete) {
                await deleteImage(id);
                container.remove(); // Remove from DOM
            }
        } else if (downloadMode) {
            const confirmDownload = confirm('Download?');
            if (confirmDownload) {
                await downloadImage(id);
            }
        } else {
            sendToViz(url); // Regular click action when not in delete mode
        }
    };

    document.getElementById('imageGrid').appendChild(container);
}

// Function to delete image from Supabase and cache
async function deleteImage(id) {
    // Remove from Supabase
    const { error } = await supabase.storage.from(bucketName).remove([id]);
    if (error) {
        console.error('Error deleting image from Supabase:', error);
        alert('Failed to delete image from Supabase.');
        return;
    }

    // Remove from IndexedDB cache
    await removeCachedImage(id);
}

// Function to download image from Supabase and cache
async function downloadImage(id) {
    try {
        // Check if the image is cached in the browser
        const cachedImage = await getCachedImage(id);  // Assuming you have this function to retrieve cached images
        let imageUrl = cachedImage;

        // If not cached, retrieve the public URL from Supabase
        if (!cachedImage) {
            const { data, error } = await supabase.storage.from(bucketName).getPublicUrl(id);
            if (error) {
                console.error('Error fetching image URL from Supabase:', error);
                return;
            }
            imageUrl = data.publicUrl;
        }

        // Generate the file name based on the image ID or URL
        let fileName = id.split('.').slice(0, -1).join('.');

        // Only add "_LIF5" if "LIF" is not already in the filename
        if (!fileName.includes('LIF')) {
            fileName += '_LIF5';
        }
        fileName += '.jpg';  // Add the file extension

        // Fetch the image data as an ArrayBuffer (either from cache or Supabase URL)
        const response = await fetch(imageUrl);
        const arrayBuffer = await response.arrayBuffer();

        // Check if showSaveFilePicker is supported for direct file saving
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
            await writableStream.write(new Blob([arrayBuffer], { type: 'image/jpeg' }));
            await writableStream.close();

            console.log('File saved successfully');
        } else {
            // Fallback for browsers that don't support showSaveFilePicker
            const blob = new Blob([arrayBuffer], { type: 'image/jpeg' });
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
        console.error('Error downloading the file:', err);
    }
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

function arrayBufferToBinaryString(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return binary;
}

// Enable delete mode when trash button is clicked
document.getElementById('trashButton').addEventListener('click', function () {
    deleteMode = !deleteMode; // Toggle delete mode
    if (deleteMode) {
        if (downloadMode) document.getElementById('downloadButton').click();
        this.classList.add('active'); // Add 'active' class to button when in delete mode

        // Apply delete-hover effect to all images dynamically
        const images = document.querySelectorAll('.grid div');
        images.forEach((img) => {
            img.onmouseover = () => img.classList.add('delete-hover'); // Add red shadow on hover
            img.onmouseout = () => img.classList.remove('delete-hover'); // Remove red shadow on hover exit
        });

    } else {
        this.classList.remove('active'); // Remove 'active' class when exiting delete mode

        // Remove delete-hover effect from all images
        const images = document.querySelectorAll('.grid div');
        images.forEach((img) => {
            img.onmouseover = null; // Disable hover effect
            img.onmouseout = null; // Disable hover effect
            // if creates issues with onmouseenter in object need to use add/remove EventListener
            img.classList.remove('delete-hover'); // Ensure the class is removed
        });
    }
});

// Enable download mode when download button is clicked
document.getElementById('downloadButton').addEventListener('click', function () {
    downloadMode = !downloadMode; // Toggle download mode
    if (downloadMode) {
        if (deleteMode) document.getElementById('deleteButton').click();
        this.classList.add('active'); // Add 'active' class to button when in download mode

        // Apply download-hover effect to all images dynamically
        const images = document.querySelectorAll('.grid div');
        images.forEach((img) => {
            img.onmouseover = () => img.classList.add('download-hover'); // Add red shadow on hover
            img.onmouseout = () => img.classList.remove('download-hover'); // Remove red shadow on hover exit
        });

    } else {
        this.classList.remove('active'); // Remove 'active' class when exiting download mode

        // Remove download-hover effect from all images
        const images = document.querySelectorAll('.grid div');
        images.forEach((img) => {
            img.onmouseover = null; // Disable hover effect
            img.onmouseout = null; // Disable hover effect
            // if creates issues with onmouseenter in object need to use add/remove EventListener
            img.classList.remove('download-hover'); // Ensure the class is removed
        });
    }
});

// Event listener for image upload
document.getElementById('addImageButton').addEventListener('click', function () {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = function () {
        uploadImage(fileInput); // Pass the fileInput directly to the uploadImage function
    };
    fileInput.click();  // Simulate a click to open file selector
});

// Display images when the page loads
document.addEventListener('DOMContentLoaded', displayImages);
