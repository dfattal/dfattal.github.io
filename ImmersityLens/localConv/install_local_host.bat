@echo off
setlocal enabledelayedexpansion

REM ImmersityLens Local Host Installation Script for Windows
REM This script automates the installation of the native messaging host

echo 🚀 ImmersityLens Local Host Installation Script
echo ================================================
echo.

REM Configuration
set "HOST_DIR=%USERPROFILE%\immersity-lens-host"
set "MANIFEST_NAME=com.leia.lif_converter.json"

REM Check prerequisites
echo [INFO] Checking prerequisites...

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed. Please install Node.js first.
    echo Visit https://nodejs.org/ to download and install Node.js
    pause
    exit /b 1
)

REM Check Node.js version
for /f "tokens=1,2 delims=." %%a in ('node --version') do set "NODE_VERSION=%%a"
set "NODE_VERSION=%NODE_VERSION:~1%"
if %NODE_VERSION% LSS 16 (
    echo [ERROR] Node.js version 16 or higher is required. Current version: 
    node --version
    pause
    exit /b 1
)

echo [SUCCESS] Node.js version is installed
node --version

REM Get extension ID from user
echo.
echo [INFO] To find your extension ID:
echo 1. Open Chrome and go to chrome://extensions/
echo 2. Find 'IAI-Lens' in the list
echo 3. Copy the ID shown under the extension name
echo.
set /p "EXTENSION_ID=Enter your extension ID: "

if "%EXTENSION_ID%"=="" (
    echo [ERROR] Extension ID is required
    pause
    exit /b 1
)

REM Create host directory and files
echo [INFO] Creating host directory: %HOST_DIR%
if not exist "%HOST_DIR%" mkdir "%HOST_DIR%"
cd /d "%HOST_DIR%"

echo [INFO] Creating host.js...
(
echo #!/usr/bin/env node
echo.
echo const fs = require^('fs'^);
echo const path = require^('path'^);
echo.
echo // Configuration
echo const CONFIG = {
echo     maxImageSize: 10 * 1024 * 1024, // 10MB
echo     supportedFormats: ['image/jpeg', 'image/png', 'image/webp'],
echo     tempDir: path.join^(__dirname, 'temp'^),
echo     logFile: path.join^(__dirname, 'host.log'^)
echo };
echo.
echo // Ensure temp directory exists
echo if ^(!fs.existsSync^(CONFIG.tempDir^)^) {
echo     fs.mkdirSync^(CONFIG.tempDir, { recursive: true }^);
echo }
echo.
echo // Logging function
echo function log^(message^) {
echo     const timestamp = new Date^(^).toISOString^(^);
echo     const logMessage = `[${timestamp}] ${message}\n`;
echo     
echo     // Console output
echo     console.error^(logMessage.trim^(^)^);
echo     
echo     // File output
echo     fs.appendFileSync^(CONFIG.logFile, logMessage^);
echo }
echo.
echo // Chrome Native Messaging Protocol
echo function sendMessage^(message^) {
echo     const messageBuffer = Buffer.from^(JSON.stringify^(message^)^);
echo     const lengthBuffer = Buffer.alloc^(4^);
echo     lengthBuffer.writeUInt32LE^(messageBuffer.length, 0^);
echo     
echo     process.stdout.write^(lengthBuffer^);
echo     process.stdout.write^(messageBuffer^);
echo }
echo.
echo // Handle incoming messages
echo function handleMessage^(message^) {
echo     log^(`Received message: ${JSON.stringify^(message^)}`);
echo     
echo     try {
echo         if ^(message.type === 'ping'^) {
echo             // Respond to ping with pong
echo             sendMessage^({ pong: true, timestamp: Date.now^(^) }^);
echo             log^('Sent pong response'^);
echo             
echo         } else if ^(message.image^) {
echo             // Handle image conversion
echo             handleImageConversion^(message.image^);
echo             
echo         } else {
echo             // Unknown message type
echo             sendMessage^({ error: 'Unknown message type' }^);
echo             log^('Unknown message type received'^);
echo         }
echo         
echo     } catch ^(error^) {
echo         log^(`Error handling message: ${error.message}`);
echo         sendMessage^({ error: error.message }^);
echo     }
echo }
echo.
echo // Handle image conversion
echo async function handleImageConversion^(imageDataUrl^) {
echo     try {
echo         log^('Starting image conversion...'^);
echo         
echo         // Validate image data
echo         if ^(!imageDataUrl.startsWith^('data:image/'^)^) {
echo             throw new Error^('Invalid image data format'^);
echo         }
echo         
echo         // Extract image format and data
echo         const [header, base64Data] = imageDataUrl.split^(','^);
echo         const format = header.match^(/data:image\/^([^;]+^)/^)?.[1];
echo         
echo         if ^(!format ^|^| !CONFIG.supportedFormats.includes^(`image/${format}`^)^) {
echo             throw new Error^(`Unsupported image format: ${format}`);
echo         }
echo         
echo         // Decode base64 data
echo         const imageBuffer = Buffer.from^(base64Data, 'base64'^);
echo         
echo         if ^(imageBuffer.length ^> CONFIG.maxImageSize^) {
echo             throw new Error^(`Image too large: ${imageBuffer.length} bytes ^(max: ${CONFIG.maxImageSize}^)`);
echo         }
echo         
echo         // Save image to temp file
echo         const tempImagePath = path.join^(CONFIG.tempDir, `input_${Date.now^(^)}.${format}`);
echo         fs.writeFileSync^(tempImagePath, imageBuffer^);
echo         
echo         log^(`Saved input image: ${tempImagePath}`);
echo         
echo         // TODO: Implement actual LIF conversion here
echo         // For now, we'll create a mock LIF file
echo         const mockLifData = createMockLIF^(imageBuffer, format^);
echo         
echo         // Clean up temp file
echo         fs.unlinkSync^(tempImagePath^);
echo         
echo         // Send response
echo         sendMessage^({ 
echo             lif: mockLifData,
echo             source: 'local',
echo             processingTime: Date.now^(^)
echo         }^);
echo         
echo         log^('Image conversion completed successfully'^);
echo         
echo     } catch ^(error^) {
echo         log^(`Image conversion failed: ${error.message}`);
echo         sendMessage^({ error: error.message }^);
echo     }
echo }
echo.
echo // Create mock LIF data ^(replace with actual conversion logic^)
echo function createMockLIF^(imageBuffer, format^) {
echo     // This is a placeholder - replace with actual LIF conversion
echo     const mockLif = {
echo         version: '1.0',
echo         format: 'mock-lif',
echo         originalFormat: format,
echo         size: imageBuffer.length,
echo         timestamp: Date.now^(^),
echo         data: imageBuffer.toString^('base64'^) // In real implementation, this would be actual LIF data
echo     };
echo     
echo     return mockLif;
echo }
echo.
echo // Read messages from stdin
echo let buffer = Buffer.alloc^(0^);
echo.
echo process.stdin.on^('data', ^(chunk^) =^> {
echo     buffer = Buffer.concat^([buffer, chunk]^);
echo     
echo     // Process complete messages
echo     while ^(buffer.length ^>= 4^) {
echo         const messageLength = buffer.readUInt32LE^(0^);
echo         
echo         if ^(buffer.length ^>= 4 + messageLength^) {
echo             const messageData = buffer.slice^(4, 4 + messageLength^);
echo             const message = JSON.parse^(messageData.toString^(^)^);
echo             
echo             handleMessage^(message^);
echo             
echo             // Remove processed message from buffer
echo             buffer = buffer.slice^(4 + messageLength^);
echo         } else {
echo             break; // Wait for more data
echo         }
echo     }
echo }^);
echo.
echo // Handle process termination
echo process.on^('SIGINT', ^(^) =^> {
echo     log^('Host process terminated by SIGINT'^);
echo     process.exit^(0^);
echo }^);
echo.
echo process.on^('SIGTERM', ^(^) =^> {
echo     log^('Host process terminated by SIGTERM'^);
echo     process.exit^(0^);
echo }^);
echo.
echo // Log startup
echo log^('ImmersityLens Native Messaging Host started'^);
echo log^(`Temp directory: ${CONFIG.tempDir}`);
echo log^(`Log file: ${CONFIG.logFile}`);
) > host.js

echo [INFO] Creating test script...
(
echo #!/usr/bin/env node
echo.
echo const { spawn } = require^('child_process'^);
echo const path = require^('path'^);
echo.
echo function testHost^(^) {
echo     console.log^('🧪 Testing ImmersityLens native messaging host...'^);
echo.
echo     const hostPath = path.join^(__dirname, 'host.js'^);
echo     const host = spawn^('node', [hostPath], {
echo         stdio: ['pipe', 'pipe', 'inherit']
echo     }^);
echo.
echo     // Create ping message
echo     const message = JSON.stringify^({ type: 'ping' }^);
echo     const messageBuffer = Buffer.from^(message^);
echo     const lengthBuffer = Buffer.alloc^(4^);
echo     lengthBuffer.writeUInt32LE^(messageBuffer.length, 0^);
echo.
echo     console.log^(`📤 Sending ping message: ${message}`);
echo.
echo     // Send message
echo     host.stdin.write^(lengthBuffer^);
echo     host.stdin.write^(messageBuffer^);
echo.
echo     // Read response
echo     let responseData = Buffer.alloc^(0^);
echo.
echo     host.stdout.on^('data', ^(data^) =^> {
echo         responseData = Buffer.concat^([responseData, data]^);
echo.
echo         if ^(responseData.length ^>= 4^) {
echo             const responseLength = responseData.readUInt32LE^(0^);
echo             if ^(responseData.length ^>= 4 + responseLength^) {
echo                 const responseMessage = responseData.slice^(4, 4 + responseLength^).toString^(^);
echo                 console.log^(`📥 Received response: ${responseMessage}`);
echo.
echo                 try {
echo                     const parsed = JSON.parse^(responseMessage^);
echo                     if ^(parsed.pong^) {
echo                         console.log^('✅ SUCCESS: Native messaging host is working!'^);
echo                     } else {
echo                         console.log^('❓ Unexpected response:', parsed^);
echo                     }
echo                 } catch ^(e^) {
echo                     console.log^('❌ ERROR: Could not parse response'^);
echo                 }
echo.
echo                 host.kill^(^);
echo             }
echo         }
echo     }^);
echo.
echo     host.on^('error', ^(error^) =^> {
echo         console.log^('❌ ERROR: Failed to spawn host:', error.message^);
echo     }^);
echo.
echo     host.on^('exit', ^(code^) =^> {
echo         console.log^(`🔚 Host exited with code: ${code}`);
echo     }^);
echo.
echo     // Timeout
echo     setTimeout^(^(^) =^> {
echo         console.log^('⏰ TIMEOUT: No response after 5 seconds'^);
echo         host.kill^(^);
echo     }, 5000^);
echo }
echo.
echo testHost^(^);
) > test_host.js

echo [SUCCESS] Host files created successfully

REM Create manifest file
echo [INFO] Creating native messaging manifest...
set "MANIFEST_DIR=%LOCALAPPDATA%\Google\Chrome\User Data\NativeMessagingHosts"
set "HOST_PATH=%HOST_DIR%\host.js"

(
echo {
echo   "name": "com.leia.lif_converter",
echo   "description": "ImmersityLens Local Conversion Host",
echo   "path": "%HOST_PATH%",
echo   "type": "stdio",
echo   "allowed_origins": [
echo     "chrome-extension://%EXTENSION_ID%/"
echo   ]
echo }
) > "%MANIFEST_NAME%"

echo [SUCCESS] Manifest file created: %MANIFEST_NAME%

REM Install manifest
echo [INFO] Installing native messaging manifest...
if not exist "%MANIFEST_DIR%" mkdir "%MANIFEST_DIR%"
copy "%MANIFEST_NAME%" "%MANIFEST_DIR%\" >nul
echo [SUCCESS] Manifest installed to: %MANIFEST_DIR%\%MANIFEST_NAME%

REM Test the installation
echo [INFO] Testing the installation...
cd /d "%HOST_DIR%"
node test_host.js
if errorlevel 1 (
    echo [ERROR] Native messaging host test failed!
    echo [INFO] Check the log file: %HOST_DIR%\host.log
    pause
    exit /b 1
)

echo.
echo [SUCCESS] Installation completed successfully!
echo.
echo [INFO] Next steps:
echo 1. Restart Chrome browser
echo 2. Go to chrome://extensions/
echo 3. Find IAI-Lens and click 'Reload'
echo 4. Right-click on any image and look for 'Convert to 3D' option
echo 5. The extension should now show 'Local Available: Yes'
echo.
echo [INFO] Files created:
echo - Host directory: %HOST_DIR%
echo - Host script: %HOST_DIR%\host.js
echo - Test script: %HOST_DIR%\test_host.js
echo - Log file: %HOST_DIR%\host.log
echo.
echo [WARNING] Note: This is a mock implementation. Replace the conversion logic in host.js with actual LIF conversion code.
echo.
pause 