document.addEventListener('DOMContentLoaded', function () {
    const toggleBtn = document.getElementById('toggleBtn');
    const statusDiv = document.getElementById('status');
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

    // Load initial state from storage
    chrome.storage.local.get([STORAGE_KEY]).then((result) => {
        const isEnabled = result[STORAGE_KEY] !== undefined ? result[STORAGE_KEY] : true;
        updateUI(isEnabled);
    }).catch((error) => {
        console.error('Error loading extension state in popup:', error);
        updateUI(true); // Default to enabled
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