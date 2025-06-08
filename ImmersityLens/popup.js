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

    // Function to check XR status from content script
    function checkXRStatus(isExtensionEnabled) {
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
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'getXRStatus' }, function (response) {
                    if (chrome.runtime.lastError) {
                        // Content script not loaded yet
                        xrStatusDiv.textContent = 'Page not ready';
                        xrStatusContainer.className = 'status-item checking';
                        xrStatusContainer.title = 'Refresh the page to check XR support';
                    } else if (response) {
                        updateXRStatus(response.supported, response.reason);
                    } else {
                        xrStatusDiv.textContent = 'Unknown';
                        xrStatusContainer.className = 'status-item checking';
                        xrStatusContainer.title = 'Unable to determine XR support status';
                    }
                });
            }
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
            chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleExtension' }, function (response) {
                if (response) {
                    updateUI(response.enabled);
                    // Update XR status when extension state changes
                    checkXRStatus(response.enabled);
                }
            });
        });
    });

    // Handle debug toggle button click
    debugToggle.addEventListener('click', function () {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleDebug' }, function (response) {
                if (response !== undefined) {
                    updateDebugUI(response.debugEnabled);
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