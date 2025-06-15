// Create context menu items when extension is installed
chrome.runtime.onInstalled.addListener(() => {
    // Pre-create all possible menu items (they'll be shown/hidden as needed)
    chrome.contextMenus.create({
        id: "convertTo3D",
        title: "Convert to 3D",
        contexts: ["all"],
        visible: true
    });

    chrome.contextMenus.create({
        id: "downloadLIF",
        title: "Download LIF",
        contexts: ["all"],
        visible: false
    });

    chrome.contextMenus.create({
        id: "enterVR",
        title: "Enter VR",
        contexts: ["all"],
        visible: false
    });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "convertTo3D") {
        // Send message to content script to handle the conversion
        chrome.tabs.sendMessage(tab.id, {
            action: "convertImage",
            clickX: info.x,
            clickY: info.y
        });
    } else if (info.menuItemId === "downloadLIF") {
        // Send message to content script to handle the LIF download
        chrome.tabs.sendMessage(tab.id, {
            action: "downloadLIF",
            clickX: info.x,
            clickY: info.y
        });
    } else if (info.menuItemId === "enterVR") {
        // Send message to content script to handle VR entry
        chrome.tabs.sendMessage(tab.id, {
            action: "enterVR",
            clickX: info.x,
            clickY: info.y
        });
    }
});

// Handle messages from content script to update context menu
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "updateContextMenu") {
        console.log('Background: Updating context menu, hasLIF:', message.hasLIF);

        if (message.hasLIF) {
            // Show LIF options, hide convert option
            chrome.contextMenus.update("convertTo3D", { visible: false });
            chrome.contextMenus.update("downloadLIF", { visible: true });
            chrome.contextMenus.update("enterVR", { visible: message.webXRSupported });

            console.log('Background: Updated menu to show LIF options (VR:', message.webXRSupported, ')');
            sendResponse({ success: true, menuType: message.webXRSupported ? "lifOptionsWithVR" : "lifOptionsNoVR" });
        } else {
            // Show convert option, hide LIF options
            chrome.contextMenus.update("convertTo3D", { visible: true });
            chrome.contextMenus.update("downloadLIF", { visible: false });
            chrome.contextMenus.update("enterVR", { visible: false });

            console.log('Background: Updated menu to show convert option');
            sendResponse({ success: true, menuType: "convertTo3D" });
        }
    }
}); 