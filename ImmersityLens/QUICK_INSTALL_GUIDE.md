# ImmersityLens Local Messaging - Quick Install Guide

## Prerequisites
- Node.js 16+ installed
- Chrome browser
- ImmersityLens extension installed
- LIF converter tool and models directory

## Quick Installation

### Option 1: Manual Installation (Recommended)

1. **Locate your LIF converter directory** (contains `lif_converter` executable and `models/` folder)

2. **Copy host.js to the LIF converter directory:**
   ```bash
   # Copy the host.js file to your LIF converter directory
   cp /path/to/ImmersityLens/localConv/host.js /path/to/your/lif_converter_directory/
   
   # Make it executable
   chmod +x /path/to/your/lif_converter_directory/host.js
   ```

3. **Find your extension ID:**
   - Go to `chrome://extensions/`
   - Copy the ID under "IAI-Lens"

4. **Create manifest file:**
   ```json
   {
     "name": "com.leia.lif_converter",
     "description": "ImmersityLens Local Conversion Host",
     "path": "/FULL/PATH/TO/YOUR/lif_converter_directory/host.js",
     "type": "stdio",
     "allowed_origins": ["chrome-extension://YOUR_EXTENSION_ID/"]
   }
   ```

5. **Install manifest:**
   - **macOS:** `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
   - **Linux:** `~/.config/google-chrome/NativeMessagingHosts/`
   - **Windows:** `%LOCALAPPDATA%\Google\Chrome\User Data\NativeMessagingHosts\`

### Option 2: Automated Installation Scripts

#### macOS/Linux:
```bash
# Download and run the installation script
curl -O https://raw.githubusercontent.com/your-repo/ImmersityLens/main/install_local_host.sh
chmod +x install_local_host.sh
./install_local_host.sh
```

#### Windows:
1. Download `install_local_host.bat`
2. Double-click to run
3. Follow the prompts

## Directory Structure

Your LIF converter directory should look like this:
```
lif_converter_directory/
├── lif_converter          # The conversion executable
├── host.js               # Native messaging host (copied from localConv/)
├── models/               # ONNX models folder
│   ├── depth_inpaint_lama_model.onnx
│   ├── lama_fp32.onnx
│   ├── lama.onnx
│   └── ... (other model files)
└── tmp/                  # Temporary files (if any)
```

## Verification

1. Restart Chrome
2. Go to `chrome://extensions/`
3. Reload IAI-Lens extension
4. Check extension popup for "Local Available: Yes"

## Troubleshooting

- **"Local Available: No"**: Check manifest path and extension ID
- **Permission errors**: Ensure host.js is executable (`chmod +x host.js`)
- **Node.js not found**: Install Node.js from https://nodejs.org/
- **"lif_converter not found"**: Ensure host.js is in the same directory as lif_converter
- **Shebang issues**: Update the first line of host.js to point to your Node.js location

## Files Created
- `host.js` - Native messaging host (copied to LIF converter directory)
- `/tmp/lif_host.log` - Log file

## Next Steps
The host.js file is already configured to work with the actual LIF converter tool. No additional configuration needed.

For detailed instructions, see `localConv/LOCAL_MESSAGING_INSTALLATION_GUIDE.md` 