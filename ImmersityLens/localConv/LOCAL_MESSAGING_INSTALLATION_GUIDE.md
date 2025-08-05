# ImmersityLens Local Messaging App Installation Guide

This guide provides detailed instructions for installing the local messaging app required for the ImmersityLens Chrome extension to perform local 2D-to-3D conversions.

## Overview

The ImmersityLens Chrome extension can operate in two modes:
- **Cloud Mode**: Uses remote Immersity AI servers for conversion (default)
- **Local Mode**: Uses a local native messaging host for conversion

Local mode provides faster processing, offline capability, and enhanced privacy by keeping your images on your local machine.

## Prerequisites

Before installing the local messaging app, ensure you have:

- **Operating System**: macOS, Windows, or Linux
- **Node.js**: Version 16 or higher
- **Chrome Browser**: Version 88 or higher
- **ImmersityLens Extension**: Already installed in Chrome
- **LIF Converter Tool**: The `lif_converter` executable and associated files

### Installing Node.js

#### macOS
```bash
# Using Homebrew (recommended)
brew install node

# Or download from https://nodejs.org/
```

#### Windows
1. Download Node.js from https://nodejs.org/
2. Run the installer and follow the setup wizard
3. Verify installation: `node --version`

#### Linux (Ubuntu/Debian)
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

## Installation Steps

### Step 1: Locate Your LIF Converter Directory

The `host.js` file must be installed in the same directory as your `lif_converter` executable. This directory should contain:
- `lif_converter` (executable)
- `models/` (folder with ONNX models)
- `host.js` (native messaging host - we'll install this)

**Important**: The host.js file expects to find the `lif_converter` executable in the same directory.

### Step 2: Copy the Host Application

Copy the provided `host.js` file to your LIF converter directory:

```bash
# Navigate to your LIF converter directory
cd /path/to/your/lif_converter_directory

# Copy the host.js file from the localConv directory
cp /path/to/ImmersityLens/localConv/host.js .

# Make it executable
chmod +x host.js
```

**Note**: The host.js file uses a shebang line `#!/opt/homebrew/bin/node` for macOS. If you're on a different system or Node.js is installed elsewhere, you may need to update this line.

### Step 3: Verify Directory Structure

Your LIF converter directory should now look like this:
```
lif_converter_directory/
├── lif_converter          # The conversion executable
├── host.js               # Native messaging host
├── models/               # ONNX models folder
│   ├── depth_inpaint_lama_model.onnx
│   ├── lama_fp32.onnx
│   ├── lama.onnx
│   └── ... (other model files)
└── tmp/                  # Temporary files (if any)
```

### Step 4: Create the Native Messaging Manifest

Create a file named `com.leia.lif_converter.json` with the following content:

#### For macOS/Linux:
```json
{
  "name": "com.leia.lif_converter",
  "description": "ImmersityLens Local Conversion Host",
  "path": "/FULL/PATH/TO/YOUR/lif_converter_directory/host.js",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://YOUR_EXTENSION_ID/"
  ]
}
```

#### For Windows:
```json
{
  "name": "com.leia.lif_converter",
  "description": "ImmersityLens Local Conversion Host",
  "path": "C:\\FULL\\PATH\\TO\\YOUR\\lif_converter_directory\\host.js",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://YOUR_EXTENSION_ID/"
  ]
}
```

**Important**: Replace the following placeholders:
- `/FULL/PATH/TO/YOUR/lif_converter_directory/` or `C:\\FULL\\PATH\\TO\\YOUR\\lif_converter_directory\\`: The actual full path to your LIF converter directory
- `YOUR_EXTENSION_ID`: The Chrome extension ID (see Step 5)

### Step 5: Find Your Extension ID

1. Open Chrome and go to `chrome://extensions/`
2. Find "IAI-Lens" in the list
3. Copy the ID shown under the extension name (it's a long string of letters and numbers)

### Step 6: Install the Native Messaging Manifest

#### For macOS:
```bash
# Create the native messaging directory
mkdir -p ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/

# Copy the manifest file
cp com.leia.lif_converter.json ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/
```

#### For Linux:
```bash
# Create the native messaging directory
mkdir -p ~/.config/google-chrome/NativeMessagingHosts/

# Copy the manifest file
cp com.leia.lif_converter.json ~/.config/google-chrome/NativeMessagingHosts/
```

#### For Windows:
1. Create the directory: `%LOCALAPPDATA%\Google\Chrome\User Data\NativeMessagingHosts\`
2. Copy `com.leia.lif_converter.json` to that directory

### Step 7: Test the Installation

Create a test script to verify the native messaging host is working:

```javascript
// test_host.js
#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

function testHost() {
    console.log('🧪 Testing ImmersityLens native messaging host...');

    // Update this path to match your LIF converter directory
    const hostPath = '/FULL/PATH/TO/YOUR/lif_converter_directory/host.js';
    const host = spawn('node', [hostPath], {
        stdio: ['pipe', 'pipe', 'inherit']
    });

    // Create ping message
    const message = JSON.stringify({ type: 'ping' });
    const messageBuffer = Buffer.from(message);
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32LE(messageBuffer.length, 0);

    console.log(`📤 Sending ping message: ${message}`);

    // Send message
    host.stdin.write(lengthBuffer);
    host.stdin.write(messageBuffer);

    // Read response
    let responseData = Buffer.alloc(0);

    host.stdout.on('data', (data) => {
        responseData = Buffer.concat([responseData, data]);

        if (responseData.length >= 4) {
            const responseLength = responseData.readUInt32LE(0);
            if (responseData.length >= 4 + responseLength) {
                const responseMessage = responseData.slice(4, 4 + responseLength).toString();
                console.log(`📥 Received response: ${responseMessage}`);

                try {
                    const parsed = JSON.parse(responseMessage);
                    if (parsed.pong) {
                        console.log('✅ SUCCESS: Native messaging host is working!');
                    } else {
                        console.log('❓ Unexpected response:', parsed);
                    }
                } catch (e) {
                    console.log('❌ ERROR: Could not parse response');
                }

                host.kill();
            }
        }
    });

    host.on('error', (error) => {
        console.log('❌ ERROR: Failed to spawn host:', error.message);
    });

    host.on('exit', (code) => {
        console.log(`🔚 Host exited with code: ${code}`);
    });

    // Timeout
    setTimeout(() => {
        console.log('⏰ TIMEOUT: No response after 5 seconds');
        host.kill();
    }, 5000);
}

testHost();
```

Run the test:
```bash
# Update the path in test_host.js first, then run:
node test_host.js
```

### Step 8: Configure the Extension

1. Open Chrome and go to any website with images
2. Right-click on an image and look for "IAI-Lens" in the context menu
3. Click on the extension icon in the toolbar
4. In the popup, you should see a toggle for "Local Mode"
5. Enable local mode if available

## Verification

To verify the installation is working:

1. **Check Extension Status**: The extension popup should show "Local Available: Yes"
2. **Test Conversion**: Right-click on an image and select "Convert to 3D"
3. **Check Logs**: Look at the log file in `/tmp/lif_host.log`

## Troubleshooting

### Common Issues

#### 1. "Local Available: No" in Extension
- **Cause**: Native messaging host not found or not accessible
- **Solution**: 
  - Verify the manifest file is in the correct location
  - Check that the path in the manifest matches your actual host.js location
  - Ensure the extension ID in the manifest is correct

#### 2. Permission Denied Errors
- **Cause**: Host script not executable or insufficient permissions
- **Solution**:
  ```bash
  chmod +x host.js
  chmod 644 com.leia.lif_converter.json
  ```

#### 3. "Extension ID Mismatch" Errors
- **Cause**: Wrong extension ID in manifest
- **Solution**: Update the manifest with the correct extension ID

#### 4. Node.js Not Found
- **Cause**: Node.js not installed or not in PATH
- **Solution**: Install Node.js and verify with `node --version`

#### 5. "lif_converter not found" Errors
- **Cause**: The host.js file is not in the same directory as the lif_converter executable
- **Solution**: Ensure host.js is copied to the LIF converter directory

#### 6. Shebang Line Issues
- **Cause**: The shebang line points to the wrong Node.js location
- **Solution**: Update the first line of host.js to point to your Node.js installation:
  ```bash
  # Find your Node.js location
  which node
  
  # Update the shebang line in host.js accordingly
  # For example: #!/usr/local/bin/node or #!/opt/homebrew/bin/node
  ```

### Debug Mode

The host.js file already includes comprehensive logging. Check the log file:
```bash
tail -f /tmp/lif_host.log
```

### Manual Testing

Test the host directly:
```bash
cd /path/to/your/lif_converter_directory
echo '{"type":"ping"}' | node host.js
```

## Advanced Configuration

### Custom Node.js Path

If your Node.js is installed in a different location, update the shebang line in host.js:

```bash
# Find your Node.js location
which node

# Edit host.js and update the first line
# Change from: #!/opt/homebrew/bin/node
# To: #!/your/actual/node/path
```

### Performance Optimization

- The host already includes proper error handling and logging
- Temporary files are automatically cleaned up
- The conversion process is optimized for the LIF converter tool

### Security Considerations

- The host validates all input data
- File paths are properly sanitized
- Temporary files are cleaned up after processing
- Error handling prevents crashes

## Support

If you encounter issues:

1. Check the log file: `/tmp/lif_host.log`
2. Verify the installation steps were followed correctly
3. Test the host manually using the test script
4. Check Chrome's extension page for any error messages
5. Ensure the LIF converter tool is working independently

For additional help, refer to the Chrome Native Messaging documentation or contact ImmersityLens support. 