/**
 * 🔄 TOKEN REFRESH SCHEDULER
 * Système de renouvellement automatique proactif des tokens OAuth2
 * 
 * Responsabilités :
 * - Vérification périodique des tokens proches de l'expiration
 * - Refresh automatique avant expiration
 * - Gestion des erreurs de refresh
 * - Notifications d'état des tokens
 */

const { getOAuth2Manager } = require('./oauth2-manager');
const { TimerManager } = require('./timer-utils');

class TokenRefreshScheduler {
    constructor() {
        this.oauth2Manager = null;
        this.refreshInterval = null; // legacy (compat)
        this.checkIntervalMs = 5 * 60 * 1000; // Vérification toutes les 5 minutes
        this.refreshBeforeExpiryMs = 30 * 60 * 1000; // Refresh 30min avant expiration
        this.isRunning = false;
        this.timers = new TimerManager('token-refresh');
    }

    /**
     * Démarre le scheduler de refresh automatique
     */
    start() {
        if (this.isRunning) {
            console.log('[TOKEN-SCHEDULER] Already running');
            return;
        }

        this.oauth2Manager = getOAuth2Manager();
        this.isRunning = true;

        console.log('[TOKEN-SCHEDULER] Starting automatic token refresh scheduler');
        console.log(`[TOKEN-SCHEDULER] Check interval: ${this.checkIntervalMs / 60000} minutes`);
        console.log(`[TOKEN-SCHEDULER] Refresh before expiry: ${this.refreshBeforeExpiryMs / 60000} minutes`);

        // Vérifications périodiques (avec exécution immédiate)
        this.timers.setInterval('check', () => this.checkAndRefreshTokens(), this.checkIntervalMs, { immediate: true, unref: true });
    }

    /**
     * Arrête le scheduler
     */
    stop() {
        if (this.timers) this.timers.clearAll();
        if (this.refreshInterval) { // compat
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
        this.isRunning = false;
        console.log('[TOKEN-SCHEDULER] Stopped');
    }

    /**
     * Nettoyage
     */
    cleanup() {
        this.stop();
    }

    /**
     * Vérifie et refresh les tokens nécessaires
     */
    async checkAndRefreshTokens() {
        if (!this.oauth2Manager) {
            console.error('[TOKEN-SCHEDULER] OAuth2 manager not available');
            return;
        }

        try {
            const users = this.oauth2Manager.getAllUsers();
            const now = new Date();
            
            console.log(`[TOKEN-SCHEDULER] Checking ${users.length} OAuth2 users for token expiration`);

            for (const user of users) {
                if (!user.expiresAt) {
                    console.log(`[TOKEN-SCHEDULER] User @${user.username} has no expiration date - skipping`);
                    continue;
                }

                const expiresAt = new Date(user.expiresAt);
                const timeUntilExpiry = expiresAt.getTime() - now.getTime();
                const minutesUntilExpiry = Math.round(timeUntilExpiry / 60000);

                if (timeUntilExpiry <= 0) {
                    // Token déjà expiré
                    console.log(`[TOKEN-SCHEDULER] ⚠️  Token EXPIRED for @${user.username} (expired ${Math.abs(minutesUntilExpiry)}min ago)`);
                    await this.attemptRefresh(user.id, user.username, 'EXPIRED');
                } else if (timeUntilExpiry <= this.refreshBeforeExpiryMs) {
                    // Token expire bientôt
                    console.log(`[TOKEN-SCHEDULER] 🔄 Token expiring soon for @${user.username} (${minutesUntilExpiry}min remaining)`);
                    await this.attemptRefresh(user.id, user.username, 'EXPIRING_SOON');
                } else {
                    // Token encore valide
                    console.log(`[TOKEN-SCHEDULER] ✅ Token OK for @${user.username} (${minutesUntilExpiry}min remaining)`);
                }
            }

        } catch (error) {
            console.error('[TOKEN-SCHEDULER] Error during token check:', error.message);
        }
    }

    /**
     * Tente de refresh un token utilisateur
     */
    async attemptRefresh(userId, username, reason) {
        try {
            console.log(`[TOKEN-SCHEDULER] Attempting refresh for @${username} (reason: ${reason})`);
            
            const refreshedUser = await this.oauth2Manager.refreshUserToken(userId);
            const newExpiryMinutes = Math.round((new Date(refreshedUser.expiresAt).getTime() - Date.now()) / 60000);
            
            console.log(`[TOKEN-SCHEDULER] ✅ SUCCESS: Token refreshed for @${username} - New expiry in ${newExpiryMinutes}min`);
            
            return { success: true, user: refreshedUser };

        } catch (error) {
            console.error(`[TOKEN-SCHEDULER] ❌ FAILED: Refresh failed for @${username}: ${error.message}`);
            
            // Analyser le type d'erreur
            if (error.code === 400 || error.message.includes('invalid_grant')) {
                console.log(`[TOKEN-SCHEDULER] 🔒 User @${username} requires manual reconnection (invalid refresh token)`);
            } else if (error.code === 429) {
                console.log(`[TOKEN-SCHEDULER] ⏳ Rate limit reached for @${username} - will retry later`);
            } else {
                console.log(`[TOKEN-SCHEDULER] 🔧 Temporary error for @${username} - will retry later`);
            }
            
            return { success: false, error: error.message };
        }
    }

    /**
     * Obtient le statut de tous les tokens
     */
    getTokensStatus() {
        if (!this.oauth2Manager) {
            return { error: 'OAuth2 manager not available' };
        }

        const users = this.oauth2Manager.getAllUsers();
        const now = new Date();
        
        return users.map(user => {
            const expiresAt = new Date(user.expiresAt);
            const timeUntilExpiry = expiresAt.getTime() - now.getTime();
            const minutesUntilExpiry = Math.round(timeUntilExpiry / 60000);
            
            let status = 'UNKNOWN';
            if (timeUntilExpiry <= 0) {
                status = 'EXPIRED';
            } else if (timeUntilExpiry <= this.refreshBeforeExpiryMs) {
                status = 'EXPIRING_SOON';
            } else {
                status = 'VALID';
            }
            
            return {
                id: user.id,
                username: user.username,
                expiresAt: user.expiresAt,
                minutesUntilExpiry,
                status,
                isActive: user.isActive !== false,
                requiresReconnection: user.requiresReconnection || false
            };
        });
    }
}

// Instance singleton
let schedulerInstance = null;

/**
 * Obtient l'instance du scheduler (singleton)
 */
function getTokenRefreshScheduler() {
    if (!schedulerInstance) {
        schedulerInstance = new TokenRefreshScheduler();
    }
    return schedulerInstance;
}

/**
 * Démarre le scheduler automatique
 */
function startTokenRefreshScheduler() {
    const scheduler = getTokenRefreshScheduler();
    scheduler.start();
    return scheduler;
}

/**
 * Arrête le scheduler automatique
 */
function stopTokenRefreshScheduler() {
    if (schedulerInstance) {
        schedulerInstance.stop();
    }
}

module.exports = {
    TokenRefreshScheduler,
    getTokenRefreshScheduler,
    startTokenRefreshScheduler,
    stopTokenRefreshScheduler
};
