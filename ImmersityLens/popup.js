document.addEventListener('DOMContentLoaded', function () {
    const xrStatusDiv = document.getElementById('xrStatus');
    const xrStatusContainer = document.getElementById('xrStatusContainer');
    const animationSelect = document.getElementById('animationSelect');
    const ANIMATION_STORAGE_KEY = 'lifAnimationIndex';

    // Auto-close functionality
    let autoCloseTimeout = null;
    const AUTO_CLOSE_DELAY = 4000; // 4 seconds
    const FADE_DURATION = 400; // 0.4 seconds



    // Function to update XR status UI
    function updateXRStatus(isSupported, reason) {
        if (isSupported) {
            xrStatusDiv.textContent = 'Available';
            xrStatusContainer.className = 'status-item enabled';
            xrStatusContainer.title = 'WebXR is supported - VR buttons will be shown';
        } else {
            xrStatusDiv.textContent = 'Not Available';
            xrStatusContainer.className = 'status-item disabled';
            xrStatusContainer.title = reason || 'WebXR is not supported on this device';
        }
    }

    // Function to check XR status from content script with enhanced retry logic
    function checkXRStatus(retryCount = 0, maxRetries = 15) {
        // Set checking state
        xrStatusDiv.textContent = 'Checking';
        xrStatusContainer.className = 'status-item checking';
        xrStatusContainer.title = 'Checking WebXR support...';

        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (!tabs[0]) {
                console.error('No active tab found for XR status check');
                xrStatusDiv.textContent = 'No active tab';
                xrStatusContainer.className = 'status-item disabled';
                return;
            }

            chrome.tabs.sendMessage(tabs[0].id, { action: 'getXRStatus' }, function (response) {
                if (chrome.runtime.lastError) {
                    // Content script not loaded yet - retry with exponential backoff
                    if (retryCount < maxRetries) {
                        const delay = Math.min(500 + (retryCount * 200), 2000); // 500ms to 2s max
                        console.log(`Content script not ready for XR check, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);

                        setTimeout(() => {
                            checkXRStatus(retryCount + 1, maxRetries);
                        }, delay);
                    } else {
                        // Give up after max retries
                        console.warn('Max retries reached for XR status check');
                        xrStatusDiv.textContent = 'Check failed';
                        xrStatusContainer.className = 'status-item disabled';
                        xrStatusContainer.title = 'Unable to check WebXR support - content script not responding';
                    }
                } else if (response) {
                    // If WebXR test is still in progress, retry after a delay
                    if (response.reason === 'WebXR support check in progress' && retryCount < maxRetries) {
                        console.log(`WebXR test in progress, retrying in 500ms (attempt ${retryCount + 1}/${maxRetries})`);
                        setTimeout(() => {
                            checkXRStatus(retryCount + 1, maxRetries);
                        }, 500);
                    } else if (response.reason === 'WebXR support check in progress') {
                        // WebXR test is taking too long
                        console.warn('WebXR test taking too long, assuming not supported');
                        updateXRStatus(false, 'WebXR test timeout');
                    } else {
                        // Valid response received
                        console.log('XR status check completed:', response);
                        updateXRStatus(response.supported, response.reason);
                    }
                } else {
                    // No response but no error either - retry a few times
                    if (retryCount < 5) {
                        console.log(`No response from content script, retrying (attempt ${retryCount + 1}/5)`);
                        setTimeout(() => {
                            checkXRStatus(retryCount + 1, 5);
                        }, 1000);
                    } else {
                        console.warn('No response from content script after retries');
                        xrStatusDiv.textContent = 'Unknown';
                        xrStatusContainer.className = 'status-item disabled';
                        xrStatusContainer.title = 'Unable to determine XR support status';
                    }
                }
            });
        });
    }

    // Function to load available animations dynamically
    function loadAvailableAnimations(retryCount = 0, maxRetries = 5) {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (!tabs[0]) {
                console.error('No active tab found for animation loading');
                fallbackToDefaultAnimations();
                return;
            }

            chrome.tabs.sendMessage(tabs[0].id, { action: 'getAvailableAnimations' }, function (response) {
                if (chrome.runtime.lastError) {
                    // Content script not loaded yet - retry with exponential backoff
                    if (retryCount < maxRetries) {
                        const delay = Math.min(500 + (retryCount * 300), 2000);
                        console.log(`Content script not ready for animation loading, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
                        setTimeout(() => {
                            loadAvailableAnimations(retryCount + 1, maxRetries);
                        }, delay);
                    } else {
                        console.warn('Max retries reached for animation loading, using fallback');
                        fallbackToDefaultAnimations();
                    }
                } else if (response && response.success && response.animations) {
                    buildAnimationOptions(response.animations);
                } else {
                    console.warn('No valid animation response, using fallback');
                    fallbackToDefaultAnimations();
                }
            });
        });
    }

    // Function to build animation dropdown options
    function buildAnimationOptions(animations) {
        // Clear existing options
        animationSelect.innerHTML = '';

        // Add animation options
        animations.forEach(animation => {
            const option = document.createElement('option');
            option.value = animation.index.toString();
            option.textContent = animation.name;
            animationSelect.appendChild(option);
        });

        // Load and set the saved animation selection
        chrome.storage.local.get([ANIMATION_STORAGE_KEY]).then((result) => {
            const animationIndex = result[ANIMATION_STORAGE_KEY] !== undefined ? result[ANIMATION_STORAGE_KEY] : 0;
            animationSelect.value = animationIndex.toString();
            console.log('Loaded animations and set selection to:', animationIndex);
        }).catch((error) => {
            console.error('Error loading animation selection:', error);
            animationSelect.value = '0';
        });
    }

    // Fallback function for when dynamic loading fails
    function fallbackToDefaultAnimations() {
        const defaultAnimations = [
            { name: "Zoom In", index: 0 },
            { name: "Ken Burns", index: 1 }
        ];
        buildAnimationOptions(defaultAnimations);
    }

    // Load available animations on startup
    loadAvailableAnimations();

    // Check XR status after initial setup
    checkXRStatus();



    // Handle animation selection change
    animationSelect.addEventListener('change', function () {
        const selectedAnimationIndex = parseInt(animationSelect.value);

        // Save to storage
        chrome.storage.local.set({ [ANIMATION_STORAGE_KEY]: selectedAnimationIndex }).then(() => {
            console.log('Animation selection saved:', selectedAnimationIndex);

            // Send message to content script to update animation
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (!tabs[0]) {
                    console.error('No active tab found for animation change');
                    return;
                }

                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'setAnimation',
                    animationIndex: selectedAnimationIndex
                }, function (response) {
                    if (chrome.runtime.lastError) {
                        console.warn('Content script not available for animation change:', chrome.runtime.lastError.message);
                    } else if (response && response.success) {
                        console.log('Animation changed successfully to:', selectedAnimationIndex);
                    }
                });
            });
        }).catch((error) => {
            console.error('Error saving animation selection:', error);
        });
    });

    // Auto-close functions
    function startAutoCloseTimer() {
        clearTimeout(autoCloseTimeout);
        autoCloseTimeout = setTimeout(() => {
            fadeOutAndClose();
        }, AUTO_CLOSE_DELAY);
    }

    function cancelAutoCloseTimer() {
        clearTimeout(autoCloseTimeout);
        autoCloseTimeout = null;
    }

    function fadeOutAndClose() {
        document.body.classList.add('fade-out');
        setTimeout(() => {
            window.close();
        }, FADE_DURATION);
    }

    // Set up mouse event listeners for auto-close
    function setupAutoClose() {
        // Start timer when popup opens
        startAutoCloseTimer();

        // Cancel timer when mouse is over the popup
        document.body.addEventListener('mouseenter', () => {
            cancelAutoCloseTimer();
            document.body.classList.remove('fade-out');
        });

        // Start timer when mouse leaves the popup
        document.body.addEventListener('mouseleave', () => {
            startAutoCloseTimer();
        });

        // Cancel timer when interacting with controls
        animationSelect.addEventListener('focus', cancelAutoCloseTimer);
        animationSelect.addEventListener('change', () => {
            // Give user a moment to see the change, then restart timer
            cancelAutoCloseTimer();
            setTimeout(startAutoCloseTimer, 1000);
        });

        // Also cancel timer when clicking anywhere (general interaction)
        document.addEventListener('click', () => {
            cancelAutoCloseTimer();
            setTimeout(startAutoCloseTimer, 1500);
        });
    }

    // Initialize auto-close after everything is loaded
    setupAutoClose();

    // Listen for storage changes to keep popup in sync
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
            if (changes[ANIMATION_STORAGE_KEY]) {
                const newAnimationValue = changes[ANIMATION_STORAGE_KEY].newValue;
                animationSelect.value = newAnimationValue.toString();
            }
        }
    });
}); 