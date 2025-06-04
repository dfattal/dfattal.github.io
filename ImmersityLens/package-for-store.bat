@echo off
REM Chrome Web Store Extension Packaging Script for Windows
REM Run this from the ImmersityLens directory

echo 🚀 Packaging ImmersityLens Extension for Chrome Web Store...

REM Extract version from manifest.json (simplified approach)
findstr "version" manifest.json > temp_version.txt
for /f "tokens=2 delims=:" %%a in (temp_version.txt) do (
    set VERSION_RAW=%%a
)
REM Clean up the version string (remove quotes, spaces, commas)
set VERSION=%VERSION_RAW:"=%
set VERSION=%VERSION: =%
set VERSION=%VERSION:,=%
del temp_version.txt

echo 📦 Version: %VERSION%

REM Create package name
set PACKAGE_NAME=immersitylens-v%VERSION%.zip

REM Clean up any existing package
if exist "%PACKAGE_NAME%" (
    echo 🗑️  Removing existing package: %PACKAGE_NAME%
    del "%PACKAGE_NAME%"
)

REM Files and directories to include
echo 📁 Including files:
echo    ✅ manifest.json
echo    ✅ content.js
echo    ✅ popup.html
echo    ✅ popup.js
echo    ✅ icons/ directory
echo    ✅ libs/ directory
echo    ✅ shaders/ directory

REM Create the package using PowerShell (available on Windows 10+)
powershell -command "Compress-Archive -Path 'manifest.json','content.js','popup.html','popup.js','icons','libs','shaders' -DestinationPath '%PACKAGE_NAME%' -Force"

REM Check if package was created successfully
if exist "%PACKAGE_NAME%" (
    echo ✅ Package created successfully: %PACKAGE_NAME%
    
    REM Show package size
    for %%I in ("%PACKAGE_NAME%") do set SIZE=%%~zI
    set /a SIZE_KB=%SIZE%/1024
    echo 📏 Package size: %SIZE_KB% KB
    
    echo.
    echo 🎯 Next Steps:
    echo    1. Upload %PACKAGE_NAME% to Chrome Web Store Developer Dashboard
    echo    2. Fill in store listing information (see CHROME_STORE_SUBMISSION.md)
    echo    3. Upload screenshots and promotional images
    echo    4. Set up privacy policy URL
    echo    5. Submit for review
    
) else (
    echo ❌ Failed to create package
    pause
    exit /b 1
)

echo.
echo 🏪 Chrome Web Store Developer Dashboard:
echo    https://chrome.google.com/webstore/devconsole/
echo.
echo ✨ Good luck with your submission!
pause 