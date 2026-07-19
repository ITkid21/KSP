'use strict';

const { getCatalystApp } = require('../services/catalystService');

/**
 * Creates default users on startup.
 * Safe to call multiple times.
 * Currently a no-op until the real bootstrap logic is implemented.
 */
async function ensureDefaultUsers() {
    try {
        const app = getCatalystApp();

        if (!app) {
            console.log('[Bootstrap] Catalyst unavailable. Skipping default user bootstrap.');
            return;
        }

        console.log('[Bootstrap] Default user bootstrap skipped (placeholder).');

        // TODO:
        // - Check if admin exists
        // - Create default admin if missing
        // - Create demo users if required

    } catch (err) {
        console.warn('[Bootstrap] Failed:', err.message);
    }
}

module.exports = {
    ensureDefaultUsers
};