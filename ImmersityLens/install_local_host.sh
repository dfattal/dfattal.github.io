#!/bin/bash

# ImmersityLens Local Host Installation Script
# This script automates the installation of the native messaging host

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MANIFEST_NAME="com.leia.lif_converter.json"

# Print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js first."
        echo "Visit https://nodejs.org/ to download and install Node.js"
        exit 1
    fi
    
    # Check Node.js version
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 16 ]; then
        print_error "Node.js version 16 or higher is required. Current version: $(node --version)"
        exit 1
    fi
    
    print_success "Node.js $(node --version) is installed"
    
    # Check if Chrome is installed
    if ! command -v google-chrome &> /dev/null && ! command -v chromium-browser &> /dev/null; then
        print_warning "Chrome browser not found in PATH. Please ensure Chrome is installed."
    else
        print_success "Chrome browser found"
    fi
}

# Get LIF converter directory from user
get_lif_converter_directory() {
    echo
    print_status "Please provide the path to your LIF converter directory."
    echo "This directory should contain:"
    echo "- lif_converter (executable)"
    echo "- models/ (folder with ONNX models)"
    echo
    read -p "Enter the full path to your LIF converter directory: " LIF_CONVERTER_DIR
    
    if [ -z "$LIF_CONVERTER_DIR" ]; then
        print_error "LIF converter directory path is required"
        exit 1
    fi
    
    # Check if directory exists
    if [ ! -d "$LIF_CONVERTER_DIR" ]; then
        print_error "Directory does not exist: $LIF_CONVERTER_DIR"
        exit 1
    fi
    
    # Check if lif_converter executable exists
    if [ ! -f "$LIF_CONVERTER_DIR/lif_converter" ] && [ ! -f "$LIF_CONVERTER_DIR/lif_converter.exe" ]; then
        print_warning "lif_converter executable not found in $LIF_CONVERTER_DIR"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    
    # Check if models directory exists
    if [ ! -d "$LIF_CONVERTER_DIR/models" ]; then
        print_warning "models directory not found in $LIF_CONVERTER_DIR"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    
    print_success "LIF converter directory validated: $LIF_CONVERTER_DIR"
}

# Get extension ID from user
get_extension_id() {
    echo
    print_status "To find your extension ID:"
    echo "1. Open Chrome and go to chrome://extensions/"
    echo "2. Find 'IAI-Lens' in the list"
    echo "3. Copy the ID shown under the extension name"
    echo
    read -p "Enter your extension ID: " EXTENSION_ID
    
    if [ -z "$EXTENSION_ID" ]; then
        print_error "Extension ID is required"
        exit 1
    fi
    
    # Validate extension ID format (basic check)
    if [[ ! "$EXTENSION_ID" =~ ^[a-z]{32}$ ]]; then
        print_warning "Extension ID format doesn't look correct. Expected format: 32 lowercase letters"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Copy host.js to LIF converter directory
copy_host_files() {
    print_status "Copying host.js to LIF converter directory..."
    
    # Get the directory where this script is located
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    HOST_JS_SOURCE="$SCRIPT_DIR/localConv/host.js"
    
    if [ ! -f "$HOST_JS_SOURCE" ]; then
        print_error "host.js not found at: $HOST_JS_SOURCE"
        print_error "Please ensure you're running this script from the ImmersityLens directory"
        exit 1
    fi
    
    # Copy host.js to LIF converter directory
    cp "$HOST_JS_SOURCE" "$LIF_CONVERTER_DIR/"
    
    # Make it executable
    chmod +x "$LIF_CONVERTER_DIR/host.js"
    
    print_success "host.js copied to: $LIF_CONVERTER_DIR/host.js"
    
    # Check if shebang line needs updating
    NODE_PATH=$(which node)
    SHEBANG_LINE=$(head -n 1 "$LIF_CONVERTER_DIR/host.js")
    EXPECTED_SHEBANG="#!$NODE_PATH"
    
    if [ "$SHEBANG_LINE" != "$EXPECTED_SHEBANG" ]; then
        print_warning "Node.js path in host.js may need updating"
        echo "Current shebang: $SHEBANG_LINE"
        echo "Expected shebang: $EXPECTED_SHEBANG"
        read -p "Update shebang line? (Y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            sed -i.bak "1s|.*|$EXPECTED_SHEBANG|" "$LIF_CONVERTER_DIR/host.js"
            print_success "Updated shebang line in host.js"
        fi
    fi
}

# Create test script
create_test_script() {
    print_status "Creating test script..."
    
    cat > test_host.js << EOF
#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

function testHost() {
    console.log('🧪 Testing ImmersityLens native messaging host...');

    const hostPath = '$LIF_CONVERTER_DIR/host.js';
    const host = spawn('node', [hostPath], {
        stdio: ['pipe', 'pipe', 'inherit']
    });

    // Create ping message
    const message = JSON.stringify({ type: 'ping' });
    const messageBuffer = Buffer.from(message);
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32LE(messageBuffer.length, 0);

    console.log(\`📤 Sending ping message: \${message}\`);

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
                console.log(\`📥 Received response: \${responseMessage}\`);

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
        console.log(\`🔚 Host exited with code: \${code}\`);
    });

    // Timeout
    setTimeout(() => {
        console.log('⏰ TIMEOUT: No response after 5 seconds');
        host.kill();
    }, 5000);
}

testHost();
EOF

    chmod +x test_host.js
    print_success "Test script created: test_host.js"
}

# Create manifest file
create_manifest() {
    print_status "Creating native messaging manifest..."
    
    # Determine OS and set appropriate paths
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
        HOST_PATH="$LIF_CONVERTER_DIR/host.js"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        MANIFEST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
        HOST_PATH="$LIF_CONVERTER_DIR/host.js"
    else
        print_error "Unsupported operating system: $OSTYPE"
        exit 1
    fi
    
    # Create manifest content
    cat > "$MANIFEST_NAME" << EOF
{
  "name": "com.leia.lif_converter",
  "description": "ImmersityLens Local Conversion Host",
  "path": "$HOST_PATH",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF
    
    print_success "Manifest file created: $MANIFEST_NAME"
}

# Install manifest
install_manifest() {
    print_status "Installing native messaging manifest..."
    
    # Determine OS and set appropriate paths
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        MANIFEST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
    else
        print_error "Unsupported operating system: $OSTYPE"
        exit 1
    fi
    
    # Create directory if it doesn't exist
    mkdir -p "$MANIFEST_DIR"
    
    # Copy manifest file
    cp "$MANIFEST_NAME" "$MANIFEST_DIR/"
    
    # Set proper permissions
    chmod 644 "$MANIFEST_DIR/$MANIFEST_NAME"
    
    print_success "Manifest installed to: $MANIFEST_DIR/$MANIFEST_NAME"
}

# Test the installation
test_installation() {
    print_status "Testing the installation..."
    
    if node test_host.js; then
        print_success "Native messaging host test passed!"
    else
        print_error "Native messaging host test failed!"
        print_status "Check the log file: /tmp/lif_host.log"
        exit 1
    fi
}

# Main installation process
main() {
    echo "🚀 ImmersityLens Local Host Installation Script"
    echo "================================================"
    echo
    
    check_prerequisites
    get_lif_converter_directory
    get_extension_id
    copy_host_files
    create_test_script
    create_manifest
    install_manifest
    test_installation
    
    echo
    print_success "Installation completed successfully!"
    echo
    print_status "Next steps:"
    echo "1. Restart Chrome browser"
    echo "2. Go to chrome://extensions/"
    echo "3. Find IAI-Lens and click 'Reload'"
    echo "4. Right-click on any image and look for 'Convert to 3D' option"
    echo "5. The extension should now show 'Local Available: Yes'"
    echo
    print_status "Files created:"
    echo "- Host script: $LIF_CONVERTER_DIR/host.js"
    echo "- Test script: test_host.js"
    echo "- Log file: /tmp/lif_host.log"
    echo
    print_status "Directory structure:"
    echo "$LIF_CONVERTER_DIR/"
    echo "├── lif_converter"
    echo "├── host.js"
    echo "├── models/"
    echo "└── ... (other files)"
    echo
    print_warning "Note: The host.js file is configured to work with the actual LIF converter tool."
}

# Run main function
main "$@" 