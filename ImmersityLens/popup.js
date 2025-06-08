document.addEventListener('DOMContentLoaded', function () {
    const toggleBtn = document.getElementById('toggleBtn');
    const statusDiv = document.getElementById('status');
    const xrStatusDiv = document.getElementById('xrStatus');
    const STORAGE_KEY = 'lifExtensionEnabled';

    // Function to update UI based on current state
    function updateUI(isEnabled) {
        if (isEnabled) {
            toggleBtn.textContent = 'Disable Extension';
            toggleBtn.classList.remove('disabled');
            statusDiv.textContent = 'Status: Enabled';
            statusDiv.style.color = '#4CAF50';
        } else {
            toggleBtn.textContent = 'Enable Extension';
            toggleBtn.classList.add('disabled');
            statusDiv.textContent = 'Status: Disabled';
            statusDiv.style.color = '#ff6b6b';
        }
    }

    // Function to update XR status UI
    function updateXRStatus(isSupported, reason) {
        if (isSupported) {
            xrStatusDiv.textContent = 'XR Status: Available';
            xrStatusDiv.style.color = '#4CAF50';
            xrStatusDiv.title = 'WebXR is supported - VR buttons will be shown';
        } else {
            xrStatusDiv.textContent = 'XR Status: Not Available';
            xrStatusDiv.style.color = '#ff6b6b';
            xrStatusDiv.title = reason || 'WebXR is not supported on this device';
        }
    }

    // Function to check XR status from content script
    function checkXRStatus() {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'getXRStatus' }, function (response) {
                    if (chrome.runtime.lastError) {
                        // Content script not loaded yet
                        xrStatusDiv.textContent = 'XR Status: Page not ready';
                        xrStatusDiv.style.color = '#ffa726';
                        xrStatusDiv.title = 'Refresh the page to check XR support';
                    } else if (response) {
                        updateXRStatus(response.supported, response.reason);
                    } else {
                        xrStatusDiv.textContent = 'XR Status: Unknown';
                        xrStatusDiv.style.color = '#ffa726';
                    }
                });
            }
        });
    }

    // Load initial state from storage
    chrome.storage.local.get([STORAGE_KEY]).then((result) => {
        const isEnabled = result[STORAGE_KEY] !== undefined ? result[STORAGE_KEY] : false;
        updateUI(isEnabled);

        // Check XR status after loading initial state
        checkXRStatus();
    }).catch((error) => {
        console.error('Error loading extension state in popup:', error);
        updateUI(false);
        checkXRStatus();
    });

    // Handle toggle button click
    toggleBtn.addEventListener('click', function () {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleExtension' }, function (response) {
                if (response) {
                    updateUI(response.enabled);
                }
            });
        });
    });

    // Listen for storage changes to keep popup in sync
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes[STORAGE_KEY]) {
            updateUI(changes[STORAGE_KEY].newValue);
        }
    });
}); 