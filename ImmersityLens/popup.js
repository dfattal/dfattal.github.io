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

    // Function to load available animations dynamically from lifViewer instances
    function loadAvailableAnimations(retryCount = 0, maxRetries = 3) {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (!tabs[0]) {
                console.error('No active tab found for animation loading');
                fallbackToStaticAnimations();
                return;
            }

            chrome.tabs.sendMessage(tabs[0].id, { action: 'getAvailableAnimations' }, function (response) {
                if (chrome.runtime.lastError) {
                    // Content script not loaded yet - try fallback after limited retries
                    if (retryCount < maxRetries) {
                        const delay = 500 + (retryCount * 200);
                        console.log(`Content script not ready, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
                        setTimeout(() => {
                            loadAvailableAnimations(retryCount + 1, maxRetries);
                        }, delay);
                    } else {
                        console.log('Using static animation definitions (no content script)');
                        fallbackToStaticAnimations();
                    }
                } else if (response && response.success && response.animations && response.animations.length > 0) {
                    console.log('Got dynamic animations from lifViewer:', response.animations);
                    buildAnimationOptions(response.animations);
                } else {
                    console.log('No lifViewer instances found, using static definitions');
                    fallbackToStaticAnimations();
                }
            });
        });
    }

    // Fallback to static definitions when no instances are available
    function fallbackToStaticAnimations() {
        // Get static animation definitions from lifViewer class without needing instances
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (!tabs[0]) {
                // Ultimate fallback - hardcoded basic animations
                buildAnimationOptions([
                    { name: "Zoom In", index: 0 },
                    { name: "Ken Burns", index: 1 }
                ]);
                return;
            }

            chrome.tabs.sendMessage(tabs[0].id, { action: 'getStaticAnimations' }, function (response) {
                if (chrome.runtime.lastError || !response || !response.success) {
                    console.log('Content script not available, using hardcoded fallback');
                    // Ultimate fallback - hardcoded basic animations
                    buildAnimationOptions([
                        { name: "Zoom In", index: 0 },
                        { name: "Ken Burns", index: 1 },
                        { name: "Panning Hor", index: 2 },
                        { name: "Panning Vert", index: 3 },
                        { name: "Static", index: 4 }
                    ]);
                } else {
                    console.log('Got static animations from lifViewer class:', response.animations);
                    buildAnimationOptions(response.animations);
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



    // Function to refresh animation list (can be called when lifViewer instances change)
    function refreshAnimationList() {
        console.log('Refreshing animation list...');
        loadAvailableAnimations();
    }

    // Load static animations immediately for instant display, then try to get dynamic ones
    const defaultAnimations = [
        { name: "Zoom In", index: 0 },
        { name: "Ken Burns", index: 1 },
        { name: "Panning Hor", index: 2 },
        { name: "Panning Vert", index: 3 },
        { name: "Static", index: 4 }
    ];

    // Show default animations immediately
    buildAnimationOptions(defaultAnimations);

    // Then try to load dynamic animations (will update if different)
    loadAvailableAnimations();

    // Check XR status after initial setup
    checkXRStatus();

    // Listen for potential animation updates from content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'animationsUpdated') {
            console.log('Received animation update notification');
            refreshAnimationList();
        }
    });



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
        // Don't start timer immediately - only when mouse leaves popup

        // Cancel timer when mouse is over the popup
        document.body.addEventListener('mouseenter', () => {
            cancelAutoCloseTimer();
            document.body.classList.remove('fade-out');
            console.log('Mouse entered popup - timer cancelled');
        });

        // Start timer when mouse leaves the popup
        document.body.addEventListener('mouseleave', () => {
            startAutoCloseTimer();
            console.log('Mouse left popup - timer started');
        });

        // Cancel timer when interacting with controls
        animationSelect.addEventListener('focus', () => {
            cancelAutoCloseTimer();
            console.log('Animation select focused - timer cancelled');
        });

        animationSelect.addEventListener('change', () => {
            // Give user a moment to see the change, then wait for mouse leave
            cancelAutoCloseTimer();
            console.log('Animation changed - timer cancelled');
        });

        // Cancel timer when clicking anywhere (general interaction)
        document.addEventListener('click', () => {
            cancelAutoCloseTimer();
            console.log('Popup clicked - timer cancelled');
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