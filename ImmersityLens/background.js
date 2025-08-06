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
        id: "downloadMP4",
        title: "Download MP4",
        contexts: ["all"],
        visible: false
    });

    chrome.contextMenus.create({
        id: "enterVR",
        title: "Enter VR",
        contexts: ["all"],
        visible: false
    });

    // Check local host availability on installation
    console.log('🚀 Extension installed - checking local availability...');
    checkLocalAvailable();
});

// Function to check if local native messaging host is available
async function checkLocalAvailable() {
    console.log('🔍 Starting local host availability check...');

    return new Promise(resolve => {
        console.log('📤 Sending ping message to com.leia.lif_converter...');

        const startTime = Date.now();

        chrome.runtime.sendNativeMessage(
            'com.leia.lif_converter',
            { type: 'ping' },
            response => {
                clearTimeout(timeoutId); // Clear timeout since we got a response
                const duration = Date.now() - startTime;
                console.log(`⏱️ Native message response received after ${duration}ms`);

                if (chrome.runtime.lastError) {
                    console.log('❌ Local host not available - Chrome runtime error:');
                    console.log('   Error message:', chrome.runtime.lastError.message);
                    console.log('   This usually means the native messaging host is not installed or not running');
                    chrome.storage.local.set({ localAvailable: false }, () => {
                        console.log('💾 Stored localAvailable: false');
                    });
                    resolve(false);
                } else if (response && response.pong) {
                    console.log('✅ Local host availability check: SUCCESS');
                    console.log('   Response type: Pong received');
                    console.log('   Host is running and responding correctly');
                    chrome.storage.local.set({ localAvailable: true }, () => {
                        console.log('💾 Stored localAvailable: true');
                    });
                    resolve(true);
                } else if (response && response.error) {
                    console.log('⚠️ Local host returned error to ping:');
                    console.log('   Error:', response.error);
                    console.log('   Host is running but may have issues');
                    chrome.storage.local.set({ localAvailable: true }, () => {
                        console.log('💾 Stored localAvailable: true (host responded, but with error)');
                    });
                    resolve(true);
                } else {
                    console.log('❓ Local host returned unexpected response to ping:');
                    console.log('   Response:', response);
                    console.log('   Response type:', typeof response);
                    console.log('   Response keys:', response ? Object.keys(response) : 'null');
                    chrome.storage.local.set({ localAvailable: false }, () => {
                        console.log('💾 Stored localAvailable: false (unexpected response)');
                    });
                    resolve(false);
                }
            }
        );

        // Add timeout to fail availability check if no response
        const timeoutId = setTimeout(() => {
            console.log('⏰ Native message timeout: No response after 5 seconds');
            chrome.storage.local.set({ localAvailable: false }, () => {
                console.log('💾 Stored localAvailable: false (timeout)');
            });
            resolve(false);
        }, 5000);
    });
}

// Check local availability on startup
console.log('🚀 Background script starting - checking local availability...');
console.warn('🔔 BACKGROUND SCRIPT LOADED - You should see this in the background page console!');
console.warn('🆔 EXTENSION ID:', chrome.runtime.id);
checkLocalAvailable();

// Constants for chunking
const CHUNK_SIZE = 800 * 1024; // 800KB chunks (well below 1MB limit)
const activeConversions = new Map(); // Track ongoing chunked conversions

// Enhanced local conversion with chunking support
async function handleLocalConversionWithChunking(dataUrl, sendResponse) {
    try {
        const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        console.log(`🔄 Starting chunked conversion session: ${sessionId}`);

        // Extract base64 data and estimate size
        const base64Data = dataUrl.replace(/^data:.+;base64,/, '');
        const estimatedSize = base64Data.length;

        console.log(`📏 Image size: ${estimatedSize} characters (~${Math.round(estimatedSize / 1024)}KB)`);

        // Check if chunking is needed (considering JSON overhead)
        const messageOverhead = 200; // JSON structure overhead estimate
        const needsChunking = (estimatedSize + messageOverhead) > CHUNK_SIZE;

        if (!needsChunking) {
            console.log('📤 Image is small enough, sending directly...');

            // Still create a session to track this conversion for potential chunked responses
            activeConversions.set(sessionId, {
                sendResponse: sendResponse,
                startTime: Date.now(),
                isDirect: true,
                responseChunks: new Map()
            });

            // Use original single-message approach for small images
            chrome.runtime.sendNativeMessage(
                'com.leia.lif_converter',
                { image: dataUrl },
                response => {
                    handleNativeResponse(response, sendResponse, sessionId);
                }
            );
            return;
        }

        console.log('📦 Image requires chunking, preparing chunks...');

        // Prepare chunks
        const chunks = [];
        let offset = 0;
        let chunkIndex = 0;

        while (offset < base64Data.length) {
            const chunkData = base64Data.substr(offset, CHUNK_SIZE - messageOverhead);
            const chunk = {
                type: 'chunk',
                sessionId: sessionId,
                chunkIndex: chunkIndex,
                totalChunks: Math.ceil(base64Data.length / (CHUNK_SIZE - messageOverhead)),
                data: chunkData
            };

            // Add metadata to first chunk
            if (chunkIndex === 0) {
                chunk.metadata = {
                    originalDataUrl: dataUrl,
                    totalSize: base64Data.length,
                    mimeType: dataUrl.split(';')[0].split(':')[1]
                };
            }

            chunks.push(chunk);
            offset += CHUNK_SIZE - messageOverhead;
            chunkIndex++;
        }

        console.log(`📦 Created ${chunks.length} chunks for session ${sessionId}`);

        // Store conversion context
        activeConversions.set(sessionId, {
            sendResponse: sendResponse,
            startTime: Date.now(),
            totalChunks: chunks.length,
            responseChunks: new Map() // For chunked responses
        });

        // Send chunks sequentially with small delays to avoid overwhelming
        let sentChunks = 0;
        for (const chunk of chunks) {
            await new Promise(resolve => {
                chrome.runtime.sendNativeMessage(
                    'com.leia.lif_converter',
                    chunk,
                    response => {
                        sentChunks++;
                        console.log(`📤 Sent chunk ${chunk.chunkIndex + 1}/${chunks.length} (Session: ${sessionId})`);

                        if (response && response.error) {
                            console.error('Chunk sending failed:', response.error);
                            const conversion = activeConversions.get(sessionId);
                            if (conversion) {
                                conversion.sendResponse({ error: response.error });
                                activeConversions.delete(sessionId);
                            }
                        } else if (response) {
                            // Handle any response (chunks, completion, etc.)
                            handleNativeResponse(response, null, sessionId);
                        }
                        resolve();
                    }
                );
            });

            // Small delay between chunks to avoid overwhelming
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        console.log(`✅ All chunks sent for session ${sessionId}`);

    } catch (error) {
        console.error('Chunking error:', error);
        sendResponse({ error: 'Failed to process large image: ' + error.message });
    }
}

// Handle native messaging responses (both single and chunked)
function handleNativeResponse(response, sendResponse, sessionId = null) {
    if (chrome.runtime.lastError) {
        console.error('Local conversion failed:', chrome.runtime.lastError);
        if (sendResponse) sendResponse({ error: 'Local conversion failed: ' + chrome.runtime.lastError.message });
    } else if (response && response.error) {
        console.error('Local conversion error:', response.error);
        if (sendResponse) sendResponse({ error: response.error });
    } else if (response && response.lif) {
        console.log('Local conversion successful');
        if (sendResponse) sendResponse({ lif: response.lif, source: 'local' });
    } else if (response && response.type === 'chunk') {
        handleChunkedResponse(response, sessionId);
    } else if (response && response.type === 'complete') {
        handleConversionComplete(response, sessionId);
    } else if (response && response.type === 'large_response') {
        handleLargeResponse(response, sessionId);
    } else if (response && response.type === 'chunked_ready') {
        handleChunkedReady(response, sessionId);
    } else {
        console.error('Local conversion returned unexpected response:', response);
        if (sendResponse) sendResponse({ error: 'Local conversion failed: unexpected response format' });
    }
}

// Handle chunked responses from host
function handleChunkedResponse(chunk, knownSessionId = null) {
    const { sessionId, chunkIndex, totalChunks, data } = chunk;
    let conversion = activeConversions.get(sessionId);

    // Handle case where host creates new session for large response to direct input
    if (!conversion && sessionId.startsWith('response_')) {
        console.log(`📦 Host created new response session ${sessionId} for large response`);
        console.log(`🔍 Current active conversions:`, Array.from(activeConversions.keys()));

        // Find the most recent direct conversion (they should be very close in time)
        let newestDirectConversion = null;
        let newestTime = 0;
        let newestKey = null;

        for (const [key, conv] of activeConversions.entries()) {
            console.log(`🔍 Checking conversion ${key}:`, { isDirect: conv.isDirect, startTime: conv.startTime, age: Date.now() - conv.startTime });
            if (conv.isDirect && conv.startTime > newestTime) {
                newestDirectConversion = conv;
                newestTime = conv.startTime;
                newestKey = key;
            }
        }

        if (newestDirectConversion && (Date.now() - newestTime) < 30000) { // Within 30 seconds (increased from 5)
            console.log(`🔗 Linking response session ${sessionId} to direct conversion ${newestKey}`);
            conversion = newestDirectConversion;
            activeConversions.set(sessionId, conversion);
            activeConversions.delete(newestKey);
        } else {
            console.log(`❌ No suitable direct conversion found. Newest: ${newestKey}, age: ${newestTime ? Date.now() - newestTime : 'N/A'}ms`);
        }
    }

    if (!conversion) {
        console.error(`Received chunk for unknown session: ${sessionId}`);
        return;
    }

    console.log(`📥 Received response chunk ${chunkIndex + 1}/${totalChunks} (Session: ${sessionId})`);
    console.log(`📊 Chunk data size: ${data.length} chars`);

    // Store chunk
    conversion.responseChunks.set(chunkIndex, data);
    console.log(`📦 Stored chunks so far: ${Array.from(conversion.responseChunks.keys()).sort().join(', ')} of ${totalChunks} total`);

    // Check if all chunks received
    if (conversion.responseChunks.size === totalChunks) {
        // Reassemble response
        let completeData = '';
        for (let i = 0; i < totalChunks; i++) {
            completeData += conversion.responseChunks.get(i);
        }

        console.log(`🔄 Reassembled complete response for session ${sessionId}: ${completeData.length} characters`);

        // Send final response
        conversion.sendResponse({
            lif: `data:image/jpeg;base64,${completeData}`,
            source: 'local'
        });

        // Cleanup
        activeConversions.delete(sessionId);
    }
}

// Handle large response via file transfer
function handleLargeResponse(response, expectedSessionId = null) {
    const { sessionId, filePath, size } = response;
    console.log(`📁 Handling large response: ${filePath} (${size} chars)`);

    // Find the appropriate conversion
    let conversion = activeConversions.get(sessionId);

    if (!conversion && sessionId.startsWith('response_')) {
        // Same linking logic as chunked responses
        console.log(`📦 Host created large response session ${sessionId}`);

        let newestDirectConversion = null;
        let newestTime = 0;
        let newestKey = null;

        for (const [key, conv] of activeConversions.entries()) {
            if (conv.isDirect && conv.startTime > newestTime) {
                newestDirectConversion = conv;
                newestTime = conv.startTime;
                newestKey = key;
            }
        }

        if (newestDirectConversion && (Date.now() - newestTime) < 30000) {
            console.log(`🔗 Linking large response ${sessionId} to direct conversion ${newestKey}`);
            conversion = newestDirectConversion;
            activeConversions.set(sessionId, conversion);
            activeConversions.delete(newestKey);
        }
    }

    if (!conversion) {
        console.error(`Received large response for unknown session: ${sessionId}`);
        return;
    }

    // Request the file content from the host
    console.log(`📖 Reading large response file: ${filePath}`);
    chrome.runtime.sendNativeMessage(
        'com.leia.lif_converter',
        { type: 'read_file', filePath: filePath },
        fileResponse => {
            if (chrome.runtime.lastError) {
                console.error('Failed to read large response file:', chrome.runtime.lastError);
                conversion.sendResponse({ error: 'Failed to read large response file' });
            } else if (fileResponse && fileResponse.error) {
                console.error('Large response file read error:', fileResponse.error);
                conversion.sendResponse({ error: fileResponse.error });
            } else if (fileResponse && fileResponse.content) {
                console.log(`✅ Large response read successfully: ${fileResponse.content.length} chars`);
                conversion.sendResponse({
                    lif: fileResponse.content,
                    source: 'local'
                });
            } else {
                console.error('Unexpected large response file read result:', fileResponse);
                conversion.sendResponse({ error: 'Unexpected file read response format' });
            }

            // Cleanup
            activeConversions.delete(sessionId);
        }
    );
}

// Handle chunked ready response - request chunks sequentially
function handleChunkedReady(response, expectedSessionId = null) {
    const { sessionId, totalChunks, totalSize } = response;
    console.log(`📦 Chunked response ready: ${sessionId} (${totalChunks} chunks, ${totalSize} chars)`);

    // Find the appropriate conversion (same logic as large response)
    let conversion = activeConversions.get(sessionId);

    if (!conversion && sessionId.startsWith('response_')) {
        console.log(`📦 Host created chunked response session ${sessionId}`);

        let newestDirectConversion = null;
        let newestTime = 0;
        let newestKey = null;

        for (const [key, conv] of activeConversions.entries()) {
            if (conv.isDirect && conv.startTime > newestTime) {
                newestDirectConversion = conv;
                newestTime = conv.startTime;
                newestKey = key;
            }
        }

        if (newestDirectConversion && (Date.now() - newestTime) < 30000) {
            console.log(`🔗 Linking chunked response ${sessionId} to direct conversion ${newestKey}`);
            conversion = newestDirectConversion;
            activeConversions.set(sessionId, conversion);
            activeConversions.delete(newestKey);
        }
    }

    if (!conversion) {
        console.error(`Received chunked ready for unknown session: ${sessionId}`);
        return;
    }

    // Initialize chunk collection
    conversion.responseChunks = new Map();
    conversion.totalChunks = totalChunks;
    conversion.receivedChunks = 0;

    // Request chunks sequentially
    console.log(`📥 Starting to request ${totalChunks} chunks for session ${sessionId}`);
    requestNextChunk(sessionId, 0);
}

// Request chunks one by one
function requestNextChunk(sessionId, chunkIndex) {
    const conversion = activeConversions.get(sessionId);
    if (!conversion) {
        console.error(`Conversion not found for chunk request: ${sessionId}`);
        return;
    }

    console.log(`📤 Requesting chunk ${chunkIndex + 1}/${conversion.totalChunks} for session ${sessionId}`);

    chrome.runtime.sendNativeMessage(
        'com.leia.lif_converter',
        { type: 'get_chunk', sessionId: sessionId, chunkIndex: chunkIndex },
        chunkResponse => {
            if (chrome.runtime.lastError) {
                console.error(`Failed to get chunk ${chunkIndex}:`, chrome.runtime.lastError);
                conversion.sendResponse({ error: 'Failed to retrieve response chunks' });
                activeConversions.delete(sessionId);
                return;
            }

            if (chunkResponse && chunkResponse.error) {
                console.error(`Chunk ${chunkIndex} error:`, chunkResponse.error);
                conversion.sendResponse({ error: chunkResponse.error });
                activeConversions.delete(sessionId);
                return;
            }

            if (chunkResponse && chunkResponse.data) {
                // Store chunk
                conversion.responseChunks.set(chunkIndex, chunkResponse.data);
                conversion.receivedChunks++;

                console.log(`📥 Received chunk ${chunkIndex + 1}/${conversion.totalChunks} (${chunkResponse.data.length} chars)`);

                // Check if we have all chunks
                if (conversion.receivedChunks === conversion.totalChunks) {
                    // Reassemble complete response
                    let completeData = '';
                    for (let i = 0; i < conversion.totalChunks; i++) {
                        completeData += conversion.responseChunks.get(i);
                    }

                    const mimeType = chunkResponse.mimeType || 'image/jpeg';
                    const lifDataUrl = `data:${mimeType};base64,${completeData}`;

                    console.log(`✅ All chunks received and assembled: ${completeData.length} chars`);
                    conversion.sendResponse({
                        lif: lifDataUrl,
                        source: 'local'
                    });

                    activeConversions.delete(sessionId);
                } else {
                    // Request next chunk
                    requestNextChunk(sessionId, chunkIndex + 1);
                }
            } else {
                console.error(`Unexpected chunk response for ${chunkIndex}:`, chunkResponse);
                conversion.sendResponse({ error: 'Unexpected chunk response format' });
                activeConversions.delete(sessionId);
            }
        }
    );
}

// Handle conversion complete notification
function handleConversionComplete(response, expectedSessionId = null) {
    const { sessionId, success, error } = response;
    const conversion = activeConversions.get(sessionId);

    if (!conversion) {
        console.error(`Received completion for unknown session: ${sessionId}`);
        return;
    }

    if (success) {
        console.log(`✅ Conversion completed successfully for session ${sessionId}`);
        // Response chunks should follow
    } else {
        console.error(`❌ Conversion failed for session ${sessionId}:`, error);
        conversion.sendResponse({ error: error || 'Conversion failed' });
        activeConversions.delete(sessionId);
    }
}

// Function to run cloud conversion (existing monoLdiGenerator flow)


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
    } else if (info.menuItemId === "downloadMP4") {
        // Send message to content script to handle the MP4 download
        chrome.tabs.sendMessage(tab.id, {
            action: "downloadMP4",
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

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "updateContextMenu") {
        console.log('Background: Updating context menu, hasLIF:', message.hasLIF);

        if (message.hasLIF) {
            // Show LIF options, hide convert option
            chrome.contextMenus.update("convertTo3D", { visible: false });
            chrome.contextMenus.update("downloadLIF", { visible: true });
            chrome.contextMenus.update("downloadMP4", { visible: true });
            chrome.contextMenus.update("enterVR", { visible: message.webXRSupported });

            console.log('Background: Updated menu to show LIF options (VR:', message.webXRSupported, ')');
            sendResponse({ success: true, menuType: message.webXRSupported ? "lifOptionsWithVR" : "lifOptionsNoVR" });
        } else {
            // Show convert option, hide LIF options
            chrome.contextMenus.update("convertTo3D", { visible: true });
            chrome.contextMenus.update("downloadLIF", { visible: false });
            chrome.contextMenus.update("downloadMP4", { visible: false });
            chrome.contextMenus.update("enterVR", { visible: false });

            console.log('Background: Updated menu to show convert option');
            sendResponse({ success: true, menuType: "convertTo3D" });
        }
    } else if (message.type === 'getLocalAvailable') {
        // Handle popup request for local availability
        console.log('📨 Background: Received getLocalAvailable request from popup');

        chrome.storage.local.get('localAvailable', data => {
            const available = !!data.localAvailable;
            console.log('📤 Background: Responding with localAvailable:', available);
            console.log('   Raw storage data:', data);
            sendResponse({ localAvailable: available });
        });
        return true; // async response
    } else if (message.type === 'convertImage') {
        // Handle image conversion request with local/cloud routing
        console.log('Background: Received conversion request');

        chrome.storage.sync.get('conversionMode', data => {
            const mode = data.conversionMode || 'cloud';
            console.log('Background: Using conversion mode:', mode);

            if (mode === 'local') {
                // Use local native messaging with chunking support for large images
                handleLocalConversionWithChunking(message.dataUrl, sendResponse);
            } else {
                // Use cloud API - signal content script to handle directly
                console.log('Cloud conversion mode - delegating to content script');
                sendResponse({ useCloudInContent: true, dataUrl: message.dataUrl });
            }
        });
        return true; // async response
    }
}); 