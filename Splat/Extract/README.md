# SuperSplat Downloader

A simple web app to download all assets from SuperSplat 3D Gaussian Splatting models.

## Features

- Extract model ID from SuperSplat URLs
- Download all associated files (.webp textures + meta.json)
- Real-time download progress tracking
- Beautiful, responsive UI
- No build system required - runs directly in browser

## Quick Start

### Option 1: Open Directly in Browser

Simply open `index.html` in your web browser. That's it!

```bash
open index.html
# or
# Double-click index.html in your file browser
```

### Option 2: Local Server (Recommended)

For better CORS handling, serve via local HTTP server:

```bash
# Python 3
python3 -m http.server 8080

# Node.js
npx serve

# PHP
php -S localhost:8080
```

Then navigate to `http://localhost:8080`

## Usage

1. Go to [SuperSplat](https://superspl.at/) and find a model you like
2. Copy the view URL (format: `https://superspl.at/view?id=XXXX`)
3. Paste the URL into the input field
4. Click "Download Files"
5. A file named `supersplat_XXXX.sog` will be downloaded to your Downloads folder
6. Extract the .sog file (it's a zip archive) to get all the model files in one organized folder

## Files Downloaded

For each model, the following files are downloaded into a zip archive:

**Required Files:**
- `meta.json` - Model metadata
- `means_l.webp` - Lower precision position data
- `means_u.webp` - Upper precision position data
- `quats.webp` - Rotation quaternions
- `scales.webp` - Scale data
- `sh0.webp` - Spherical harmonics (base color)

**Optional Files** (may not exist for all models):
- `shN_centroids.webp` - SH cluster centroids
- `shN_labels.webp` - SH cluster labels

## Technical Details

- Built with React 18 (loaded via CDN)
- No build tools or dependencies required
- Uses Babel Standalone for JSX transformation
- Uses JSZip to package files into organized archives
- Fetches files from CloudFront CDN with retry logic and rate limiting
- Pure client-side - no server required
- Downloads packaged as `supersplat_{id}.sog` files (zip format with .sog extension)

## File Structure

```
SuperSplatExtract/
├── index.html          # Standalone HTML app (React via CDN)
├── app.js              # React component (for build systems)
└── README.md           # This file
```

## Integration with Build Systems

If you want to integrate this into a Next.js, Vite, or Create React App project:

1. Install dependencies:
   ```bash
   npm install react react-dom
   ```

2. Import the component from `app.js`:
   ```javascript
   import SuperSplatDownloader from './app.js';
   ```

3. Add Tailwind CSS or replace the Shadcn components with your own UI library

## Credits

Model hosting by [SuperSplat](https://superspl.at/)
