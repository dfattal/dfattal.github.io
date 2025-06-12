document.addEventListener('DOMContentLoaded', function () {
    const toggleBtn = document.getElementById('toggleBtn');
    const debugToggle = document.getElementById('debugToggle');
    const statusDiv = document.getElementById('status');
    const xrStatusDiv = document.getElementById('xrStatus');
    const extensionStatusContainer = document.getElementById('extensionStatus');
    const xrStatusContainer = document.getElementById('xrStatusContainer');
    const STORAGE_KEY = 'lifExtensionEnabled';
    const DEBUG_STORAGE_KEY = 'lifDebugEnabled';

    // Function to update UI based on current state
    function updateUI(isEnabled) {
        if (isEnabled) {
            // Update button
            toggleBtn.innerHTML = '<span>🔌</span><span>Disable Extension</span>';
            toggleBtn.className = 'toggle-btn danger';

            // Update status
            statusDiv.textContent = 'Enabled';
            extensionStatusContainer.className = 'status-item enabled';
        } else {
            // Update button
            toggleBtn.innerHTML = '<span>🔌</span><span>Enable Extension</span>';
            toggleBtn.className = 'toggle-btn primary';

            // Update status
            statusDiv.textContent = 'Disabled';
            extensionStatusContainer.className = 'status-item disabled';
        }
    }

    // Function to update debug UI
    function updateDebugUI(isDebugEnabled) {
        if (isDebugEnabled) {
            debugToggle.innerHTML = '<span>🐛</span><span>Debug Logs: On</span>';
            debugToggle.className = 'toggle-btn debug-on';
        } else {
            debugToggle.innerHTML = '<span>🐛</span><span>Debug Logs: Off</span>';
            debugToggle.className = 'toggle-btn secondary';
        }
    }

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
    function checkXRStatus(isExtensionEnabled, retryCount = 0, maxRetries = 15) {
        // Only check XR status if extension is enabled
        if (!isExtensionEnabled) {
            xrStatusDiv.textContent = 'Extension Disabled';
            xrStatusContainer.className = 'status-item disabled';
            xrStatusContainer.title = 'Enable extension to check XR support';
            return;
        }

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
                            checkXRStatus(isExtensionEnabled, retryCount + 1, maxRetries);
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
                            checkXRStatus(isExtensionEnabled, retryCount + 1, maxRetries);
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
                            checkXRStatus(isExtensionEnabled, retryCount + 1, 5);
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

    // Load initial state from storage
    chrome.storage.local.get([STORAGE_KEY, DEBUG_STORAGE_KEY]).then((result) => {
        const isEnabled = result[STORAGE_KEY] !== undefined ? result[STORAGE_KEY] : false;
        const isDebugEnabled = result[DEBUG_STORAGE_KEY] !== undefined ? result[DEBUG_STORAGE_KEY] : false;

        updateUI(isEnabled);
        updateDebugUI(isDebugEnabled);

        // Check XR status after loading initial state
        checkXRStatus(isEnabled);
    }).catch((error) => {
        console.error('Error loading extension state in popup:', error);
        updateUI(false);
        updateDebugUI(false);
        checkXRStatus(false);
    });

    // Handle toggle button click
    toggleBtn.addEventListener('click', function () {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (!tabs[0]) {
                console.error('No active tab found');
                return;
            }

            chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleExtension' }, function (response) {
                if (chrome.runtime.lastError) {
                    // Content script not loaded yet - handle via storage directly
                    console.warn('Content script not available, toggling via storage:', chrome.runtime.lastError.message);

                    // Get current state from storage and toggle it
                    chrome.storage.local.get([STORAGE_KEY]).then((result) => {
                        const currentState = result[STORAGE_KEY] !== undefined ? result[STORAGE_KEY] : false;
                        const newState = !currentState;

                        // Save new state to storage
                        chrome.storage.local.set({ [STORAGE_KEY]: newState }).then(() => {
                            console.log('Extension state updated via storage:', newState);
                            updateUI(newState);

                            // Refresh the page to inject content script with new state
                            chrome.tabs.reload(tabs[0].id);

                            // Check XR status after a delay to allow page reload and initialization
                            if (newState) {
                                setTimeout(() => {
                                    console.log('Checking XR status after page reload...');
                                    checkXRStatus(newState);
                                }, 2000); // Wait 2 seconds for page to reload and initialize
                            }
                        }).catch((error) => {
                            console.error('Error saving extension state:', error);
                        });
                    }).catch((error) => {
                        console.error('Error getting extension state:', error);
                    });
                } else if (response) {
                    updateUI(response.enabled);
                    // Update XR status when extension state changes
                    checkXRStatus(response.enabled);
                } else {
                    console.warn('No response from content script');
                }
            });
        });
    });

    // Handle debug toggle button click
    debugToggle.addEventListener('click', function () {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (!tabs[0]) {
                console.error('No active tab found');
                return;
            }

            chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleDebug' }, function (response) {
                if (chrome.runtime.lastError) {
                    // Content script not loaded yet - handle via storage directly
                    console.warn('Content script not available, toggling debug via storage:', chrome.runtime.lastError.message);

                    // Get current debug state from storage and toggle it
                    chrome.storage.local.get([DEBUG_STORAGE_KEY]).then((result) => {
                        const currentDebugState = result[DEBUG_STORAGE_KEY] !== undefined ? result[DEBUG_STORAGE_KEY] : false;
                        const newDebugState = !currentDebugState;

                        // Save new debug state to storage
                        chrome.storage.local.set({ [DEBUG_STORAGE_KEY]: newDebugState }).then(() => {
                            console.log('Debug state updated via storage:', newDebugState);
                            updateDebugUI(newDebugState);
                        }).catch((error) => {
                            console.error('Error saving debug state:', error);
                        });
                    }).catch((error) => {
                        console.error('Error getting debug state:', error);
                    });
                } else if (response !== undefined) {
                    updateDebugUI(response.debugEnabled);
                } else {
                    console.warn('No response from content script for debug toggle');
                }
            });
        });
    });

    // Listen for storage changes to keep popup in sync
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
            if (changes[STORAGE_KEY]) {
                const newValue = changes[STORAGE_KEY].newValue;
                updateUI(newValue);
                // Update XR status when extension state changes via storage
                checkXRStatus(newValue);
            }
            if (changes[DEBUG_STORAGE_KEY]) {
                const newDebugValue = changes[DEBUG_STORAGE_KEY].newValue;
                updateDebugUI(newDebugValue);
            }
        }
    });
}); 