document.addEventListener('DOMContentLoaded', function () {
    const debugToggle = document.getElementById('debugToggle');
    const xrStatusDiv = document.getElementById('xrStatus');
    const xrStatusContainer = document.getElementById('xrStatusContainer');
    const DEBUG_STORAGE_KEY = 'lifDebugEnabled';

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

    // Load initial debug state from storage
    chrome.storage.local.get([DEBUG_STORAGE_KEY]).then((result) => {
        const isDebugEnabled = result[DEBUG_STORAGE_KEY] !== undefined ? result[DEBUG_STORAGE_KEY] : false;
        updateDebugUI(isDebugEnabled);

        // Check XR status after loading initial state (extension is always enabled now)
        checkXRStatus();
    }).catch((error) => {
        console.error('Error loading debug state in popup:', error);
        updateDebugUI(false);
        checkXRStatus();
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
            if (changes[DEBUG_STORAGE_KEY]) {
                const newDebugValue = changes[DEBUG_STORAGE_KEY].newValue;
                updateDebugUI(newDebugValue);
            }
        }
    });
}); 