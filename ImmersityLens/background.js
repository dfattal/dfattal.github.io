// Create context menu item when extension is installed
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "convertTo3D",
        title: "Convert to 3D",
        contexts: ["all"]  // We'll filter in the content script
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
    }
}); 