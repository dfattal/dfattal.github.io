#!/bin/bash

# Chrome Web Store Extension Packaging Script
# Run this from the ImmersityLens directory

echo "🚀 Packaging ImmersityLens Extension for Chrome Web Store..."

# Get version from manifest.json
VERSION=$(grep '"version"' manifest.json | sed 's/.*"version": *"\([^"]*\)".*/\1/')
echo "📦 Version: $VERSION"

# Create package name
PACKAGE_NAME="immersitylens-v${VERSION}.zip"

# Update installation.html with correct version
echo "📝 Updating installation.html with version $VERSION..."
if [ -f "installation.html" ]; then
    # Update the download link href
    sed -i.bak "s/href=\"immersitylens-v[0-9]\+\.[0-9]\+\.[0-9]\+\.zip\"/href=\"$PACKAGE_NAME\"/g" installation.html
    
    # Update the download button text
    sed -i.bak "s/📦 Download Extension (v[0-9]\+\.[0-9]\+\.[0-9]\+)/📦 Download Extension (v$VERSION)/g" installation.html
    
    # Remove backup file
    rm installation.html.bak
    echo "✅ Updated installation.html with version $VERSION"
else
    echo "⚠️  installation.html not found, skipping version update"
fi

# Update index.html with correct version
echo "📝 Updating index.html with version $VERSION..."
if [ -f "index.html" ]; then
    # Update the version in the download section description
    sed -i.bak "s/Download ImmersityLens v[0-9]\+\.[0-9]\+ and start/Download ImmersityLens v$VERSION and start/g" index.html
    
    # Update the manual download link href
    sed -i.bak "s/href=\"immersitylens-v[0-9]\+\.[0-9]\+\.[0-9]\+\.zip\"/href=\"$PACKAGE_NAME\"/g" index.html
    
    # Remove backup file
    rm index.html.bak
    echo "✅ Updated index.html with version $VERSION"
else
    echo "⚠️  index.html not found, skipping version update"
fi

# Clean up any existing package
if [ -f "$PACKAGE_NAME" ]; then
    echo "🗑️  Removing existing package: $PACKAGE_NAME"
    rm "$PACKAGE_NAME"
fi

# Files and directories to include (whitelist approach for security)
echo "📁 Including files:"
echo "   ✅ manifest.json"
echo "   ✅ content.js"
echo "   ✅ popup.html"
echo "   ✅ popup.js"
echo "   ✅ icons/ directory"
echo "   ✅ libs/ directory"
echo "   ✅ shaders/ directory"

# Create the package
zip -r "$PACKAGE_NAME" \
    manifest.json \
    content.js \
    popup.html \
    popup.js \
    icons/ \
    libs/ \
    shaders/ \
    -x "*.DS_Store" \
       "*.git*" \
       "*/.*" \
       "*~" \
       "*.tmp" \
       "*.log" \
       "CHROME_STORE_SUBMISSION.md" \
       "privacy-policy.md" \
       "package-for-store.sh" \
       "README.md"

# Check if package was created successfully
if [ -f "$PACKAGE_NAME" ]; then
    echo "✅ Package created successfully: $PACKAGE_NAME"
    
    # Show package size
    SIZE=$(du -h "$PACKAGE_NAME" | cut -f1)
    echo "📏 Package size: $SIZE"
    
    # List contents for verification
    echo ""
    echo "📋 Package contents:"
    unzip -l "$PACKAGE_NAME" | head -20
    
    echo ""
    echo "🎯 Next Steps:"
    echo "   1. Upload $PACKAGE_NAME to Chrome Web Store Developer Dashboard"
    echo "   2. Fill in store listing information (see CHROME_STORE_SUBMISSION.md)"
    echo "   3. Upload screenshots and promotional images"
    echo "   4. Set up privacy policy URL"
    echo "   5. Submit for review"
    
else
    echo "❌ Failed to create package"
    exit 1
fi

echo ""
echo "🏪 Chrome Web Store Developer Dashboard:"
echo "   https://chrome.google.com/webstore/devconsole/"
echo ""
echo "✨ Good luck with your submission!" 