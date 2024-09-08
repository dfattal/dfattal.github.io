
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.1.0/+esm';

const supabaseUrl = 'https://jcrggsguegcmuvdglifa.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impjcmdnc2d1ZWdjbXV2ZGdsaWZhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNTY3MzEzMywiZXhwIjoyMDQxMjQ5MTMzfQ.V1_vSCOo7tINwWuU6PFU7fQnBCMNrAwPYG-XMtonmLA';
const supabase = createClient(supabaseUrl, supabaseKey);

const bucketName = 'testAppImages';

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
async function uploadImage() {
    const fileInput = document.getElementById('imageInput');
    const file = fileInput.files[0];

    if (!file) {
        alert('Please select an image to upload.');
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
        const signedURL = await supabase.storage
            .from(bucketName)
            .createSignedUrl(fileName, 60);

        if (signedURL) {
            appendImageToGrid(fileName, signedURL.data.signedUrl);
            cacheImage(fileName, signedURL.data.signedUrl);
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
                const signedURL = await supabase.storage
                    .from(bucketName)
                    .createSignedUrl(file.name, 60);

                if (signedURL) {
                    appendImageToGrid(file.name, signedURL.data.signedUrl);
                    cacheImage(file.name, signedURL.data.signedUrl);
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
    container.classList.add('grid-item');

    const img = document.createElement('img');
    img.src = url;
    img.alt = id;

    // Add onclick event for image visualization
    img.onclick = () => sendToViz(img.src);

    container.appendChild(img);
    document.getElementById('imageGrid').appendChild(container);
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

// Event listener for image upload
document.getElementById('imageInput').addEventListener('change', uploadImage);

// Display images when the page loads
document.addEventListener('DOMContentLoaded', displayImages);
