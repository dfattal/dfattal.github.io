/**
 * URL Router
 * Handles URL parameter routing for site selection
 * Enables direct links to sites via ?site=X parameter
 */

export class URLRouter {
    constructor() {
        this.currentSiteId = null;
        this.urlParams = new URLSearchParams(window.location.search);
    }

    /**
     * Check if a site parameter exists in the URL
     * @returns {boolean} True if ?site=X parameter exists
     */
    hasSiteParameter() {
        return this.urlParams.has('site');
    }

    /**
     * Get the site ID from URL parameter
     * @returns {string|null} Site ID from ?site=X parameter, or null if not present
     */
    getSiteFromURL() {
        return this.urlParams.get('site');
    }

    /**
     * Validate if site ID exists in the scenes manifest
     * @param {string} siteId - Site ID to validate
     * @param {Array} availableScenes - Array of scene objects from manifest
     * @returns {boolean} True if site ID is valid
     */
    isValidSite(siteId, availableScenes) {
        if (!siteId || !availableScenes) return false;
        return availableScenes.some(scene => scene.id === siteId);
    }

    /**
     * Determine if globe screen should be shown
     * @param {Array} availableScenes - Array of scene objects from manifest
     * @returns {boolean} True if globe should be displayed
     */
    shouldShowGlobe(availableScenes) {
        const siteId = this.getSiteFromURL();

        // No site parameter - show globe
        if (!siteId) return true;

        // Invalid site parameter - show globe (fallback)
        if (!this.isValidSite(siteId, availableScenes)) {
            console.warn(`Invalid site parameter: ${siteId}. Showing globe.`);
            return true;
        }

        // Valid site parameter - skip globe
        this.currentSiteId = siteId;
        return false;
    }

    /**
     * Navigate to a specific site by updating URL
     * @param {string} siteId - Site ID to navigate to
     */
    navigateToSite(siteId) {
        const newURL = `${window.location.pathname}?site=${siteId}`;
        window.location.href = newURL;
    }

    /**
     * Navigate back to globe (remove site parameter)
     */
    navigateToGlobe() {
        window.location.href = window.location.pathname;
    }

    /**
     * Get current site ID (either from URL or set during navigation)
     * @returns {string|null} Current site ID
     */
    getCurrentSiteId() {
        return this.currentSiteId || this.getSiteFromURL();
    }

    /**
     * Update URL without page reload (for browser history)
     * @param {string} siteId - Site ID to add to URL
     */
    updateURLWithoutReload(siteId) {
        const newURL = `${window.location.pathname}?site=${siteId}`;
        window.history.pushState({ siteId }, '', newURL);
    }
}
