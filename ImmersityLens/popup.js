document.addEventListener('DOMContentLoaded', function () {
    const toggleBtn = document.getElementById('toggleBtn');
    const statusDiv = document.getElementById('status');

    // Get current tab
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        // Get current status
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getStatus' }, function (response) {
            if (response) {
                updateUI(response.active);
            }
        });
    });

    // Handle toggle button click
    toggleBtn.addEventListener('click', function () {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleInversion' }, function (response) {
                if (response) {
                    updateUI(response.active);
                }
            });
        });
    });

    // Update UI based on current state
    function updateUI(isActive) {
        if (isActive) {
            toggleBtn.textContent = 'Disable Inversion';
            toggleBtn.classList.add('active');
            statusDiv.textContent = 'Status: Active';
            statusDiv.style.color = '#ff6b6b';
        } else {
            toggleBtn.textContent = 'Enable Inversion';
            toggleBtn.classList.remove('active');
            statusDiv.textContent = 'Status: Disabled';
            statusDiv.style.color = '#4CAF50';
        }
    }
}); 