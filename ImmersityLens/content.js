// State to track if inversion is active
let isInversionActive = false;

// Function to apply color inversion to all images
function invertImages() {
    const images = document.querySelectorAll('img');
    const backgroundImages = document.querySelectorAll('*');

    images.forEach(img => {
        if (isInversionActive) {
            img.style.filter = 'invert(1)';
            img.style.transition = 'filter 0.3s ease';
        } else {
            img.style.filter = '';
            img.style.transition = '';
        }
    });

    // Handle background images
    backgroundImages.forEach(element => {
        const style = window.getComputedStyle(element);
        if (style.backgroundImage && style.backgroundImage !== 'none') {
            if (isInversionActive) {
                element.style.filter = 'invert(1)';
                element.style.transition = 'filter 0.3s ease';
            } else {
                element.style.filter = '';
                element.style.transition = '';
            }
        }
    });
}

// Function to handle new images added dynamically
function observeNewImages() {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    // Check if the added node is an image
                    if (node.tagName === 'IMG') {
                        if (isInversionActive) {
                            node.style.filter = 'invert(1)';
                            node.style.transition = 'filter 0.3s ease';
                        }
                    }

                    // Check for images within the added node
                    const images = node.querySelectorAll && node.querySelectorAll('img');
                    if (images) {
                        images.forEach(img => {
                            if (isInversionActive) {
                                img.style.filter = 'invert(1)';
                                img.style.transition = 'filter 0.3s ease';
                            }
                        });
                    }

                    // Check for background images
                    const style = window.getComputedStyle(node);
                    if (style && style.backgroundImage && style.backgroundImage !== 'none') {
                        if (isInversionActive) {
                            node.style.filter = 'invert(1)';
                            node.style.transition = 'filter 0.3s ease';
                        }
                    }
                }
            });
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggleInversion') {
        isInversionActive = !isInversionActive;
        invertImages();
        sendResponse({ active: isInversionActive });
    } else if (request.action === 'getStatus') {
        sendResponse({ active: isInversionActive });
    }
});

// Initialize the extension
function initialize() {
    // Check if we should auto-enable (you can modify this logic)
    // For now, it starts disabled
    isInversionActive = false;

    // Start观察新图片
    observeNewImages();

    // Apply initial state
    invertImages();
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
} 