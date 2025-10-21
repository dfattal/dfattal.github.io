/**
 * File Validator for Gaussian Splat files
 * Validates file types, sizes, and provides helpful error messages
 */

// Supported file extensions (based on Spark's supported formats)
export const SUPPORTED_EXTENSIONS = {
    ply: '.ply',
    splat: '.splat',
    spz: '.spz',      // Scaniverse format
    ksplat: '.ksplat', // GaussianSplats3D format
    sog: '.sog',      // PlayCanvas format
    glb: '.glb',      // For Luma AI captures
};

// File size limits (in bytes)
export const FILE_SIZE_LIMITS = {
    warning: 100 * 1024 * 1024,  // 100MB - show warning
    max: 500 * 1024 * 1024,       // 500MB - hard limit
};

/**
 * Get file extension from filename or URL
 * @param {string} path - File path or URL
 * @returns {string} - Lowercase extension with dot (e.g., '.splat')
 */
export function getFileExtension(path) {
    const match = path.match(/\.([^./?#]+)(?:[?#]|$)/);
    return match ? `.${match[1].toLowerCase()}` : '';
}

/**
 * Check if file extension is supported
 * @param {string} filename - File name or path
 * @returns {boolean}
 */
export function isSupportedFormat(filename) {
    const ext = getFileExtension(filename);
    return Object.values(SUPPORTED_EXTENSIONS).includes(ext);
}

/**
 * Validate file before loading
 * @param {File|string} file - File object or URL string
 * @returns {Object} - { valid: boolean, error?: string, warning?: string, format?: string }
 */
export function validateFile(file) {
    const result = {
        valid: false,
        error: null,
        warning: null,
        format: null,
    };

    // Handle URL strings
    if (typeof file === 'string') {
        // Check if it's a Luma AI capture URL first
        if (isLumaURL(file)) {
            result.valid = true;
            result.format = 'luma';
            return result;
        }

        const ext = getFileExtension(file);

        if (!isSupportedFormat(file)) {
            result.error = `Unsupported file format. Please use ${Object.values(SUPPORTED_EXTENSIONS).join(', ')} or a Luma AI capture URL`;
            return result;
        }

        result.valid = true;
        result.format = ext;
        return result;
    }

    // Handle File objects
    if (file instanceof File) {
        const ext = getFileExtension(file.name);

        // Check file extension
        if (!isSupportedFormat(file.name)) {
            result.error = `Unsupported file format "${ext}". Please use ${Object.values(SUPPORTED_EXTENSIONS).join(', ')}`;
            return result;
        }

        // Check file size
        if (file.size > FILE_SIZE_LIMITS.max) {
            result.error = `File too large (${formatFileSize(file.size)}). Maximum size is ${formatFileSize(FILE_SIZE_LIMITS.max)}`;
            return result;
        }

        // Warn about large files
        if (file.size > FILE_SIZE_LIMITS.warning) {
            result.warning = `Large file detected (${formatFileSize(file.size)}). Loading may take a while and affect performance.`;
        }

        result.valid = true;
        result.format = ext;
        return result;
    }

    result.error = 'Invalid file input';
    return result;
}

/**
 * Detect Gaussian Splat format from file extension
 * @param {string} filename - File name or path
 * @returns {string} - Format identifier: 'splat', 'ply', 'luma', or 'unknown'
 */
export function detectSplatFormat(filename) {
    const ext = getFileExtension(filename);

    switch (ext) {
        case SUPPORTED_EXTENSIONS.splat:
            return 'splat';
        case SUPPORTED_EXTENSIONS.ply:
            return 'ply';
        case SUPPORTED_EXTENSIONS.glb:
            return 'luma'; // GLB files are assumed to be Luma AI captures
        default:
            return 'unknown';
    }
}

/**
 * Check if URL appears to be a Luma AI capture URL
 * @param {string} url - URL to check
 * @returns {boolean}
 */
export function isLumaURL(url) {
    return url.includes('lumalabs.ai/capture/') || url.includes('luma.ai/capture/');
}

/**
 * Extract Luma capture ID from URL if it's a Luma URL
 * @param {string} url - URL to parse
 * @returns {string|null} - Capture ID or null if not a Luma URL
 */
export function getLumaCaptureId(url) {
    const match = url.match(/lumalabs\.ai\/capture\/([a-f0-9-]+)/i) ||
                  url.match(/luma\.ai\/capture\/([a-f0-9-]+)/i);
    return match ? match[1] : null;
}

/**
 * Format file size in human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted size (e.g., "1.5 MB")
 */
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get appropriate error message for validation failure
 * @param {string} filename - File name that failed validation
 * @returns {string} - User-friendly error message
 */
export function getValidationErrorMessage(filename) {
    const ext = getFileExtension(filename);

    if (!ext) {
        return 'Could not determine file type. Please ensure the file has a valid extension.';
    }

    return `File format "${ext}" is not supported. Please use one of the following formats: ${Object.values(SUPPORTED_EXTENSIONS).join(', ')}`;
}
