const { logToFile } = require('./logs-optimized');

/**
 * RATE LIMIT MONITOR SERVICE
 * 
 * Capture et analyse les headers x-rate-limit de Twitter
 * Calcul dynamique des délais pour éviter les erreurs 429
 */

class RateLimitMonitor {
    constructor() {
        this.rateLimitData = new Map(); // accountId -> rate limit info
        this.endpointLimits = new Map(); // endpoint -> limit info
        
        // Configuration des seuils critiques
        this.CRITICAL_THRESHOLD = 5; // Actions restantes avant alerte
        this.WARNING_THRESHOLD = 15; // Actions restantes avant ralentissement
        
        logToFile('[RATE-LIMIT-MONITOR] Service initialized');
    }

    /**
     * Capture les headers de rate limit d'une réponse Twitter API
     */
    captureRateLimitHeaders(response, accountId, endpoint = 'unknown') {
        if (!response || !response.headers) return null;

        const headers = response.headers;
        const rateLimitInfo = {
            accountId,
            endpoint,
            remaining: parseInt(headers['x-rate-limit-remaining']) || null,
            limit: parseInt(headers['x-rate-limit-limit']) || null,
            reset: parseInt(headers['x-rate-limit-reset']) || null,
            capturedAt: Date.now()
        };

        // Calculer le temps jusqu'au reset
        if (rateLimitInfo.reset) {
            rateLimitInfo.resetIn = (rateLimitInfo.reset * 1000) - Date.now();
            rateLimitInfo.resetAt = new Date(rateLimitInfo.reset * 1000);
        }

        // Stocker les données
        const key = `${accountId}_${endpoint}`;
        this.rateLimitData.set(key, rateLimitInfo);
        this.endpointLimits.set(endpoint, rateLimitInfo);

        // Log détaillé
        if (rateLimitInfo.remaining !== null) {
            const resetTime = rateLimitInfo.resetAt ? rateLimitInfo.resetAt.toLocaleTimeString() : 'unknown';
            logToFile(`[RATE-LIMIT][${accountId}][${endpoint}] ${rateLimitInfo.remaining}/${rateLimitInfo.limit} remaining, reset at ${resetTime}`);
            
            // Alertes selon les seuils
            if (rateLimitInfo.remaining <= this.CRITICAL_THRESHOLD) {
                logToFile(`[RATE-LIMIT][CRITICAL][${accountId}] Only ${rateLimitInfo.remaining} requests remaining for ${endpoint}!`);
                return { status: 'critical', ...rateLimitInfo };
            } else if (rateLimitInfo.remaining <= this.WARNING_THRESHOLD) {
                logToFile(`[RATE-LIMIT][WARNING][${accountId}] ${rateLimitInfo.remaining} requests remaining for ${endpoint}`);
                return { status: 'warning', ...rateLimitInfo };
            }
        }

        return { status: 'ok', ...rateLimitInfo };
    }

    /**
     * Calcule le délai optimal avant la prochaine requête
     */
    calculateOptimalDelay(accountId, endpoint = 'unknown') {
        const key = `${accountId}_${endpoint}`;
        const rateLimitInfo = this.rateLimitData.get(key);

        if (!rateLimitInfo || rateLimitInfo.remaining === null) {
            // Pas d'info de rate limit, utiliser délai par défaut
            return { delay: 3000, reason: 'no_rate_limit_data' };
        }

        const { remaining, resetIn } = rateLimitInfo;

        // Si plus de requêtes disponibles, attendre le reset
        if (remaining <= 0) {
            const waitTime = Math.max(resetIn || 900000, 60000); // Min 1min, max 15min
            return { 
                delay: waitTime, 
                reason: 'rate_limit_exhausted',
                resetAt: rateLimitInfo.resetAt 
            };
        }

        // Calcul dynamique du délai selon les requêtes restantes
        if (remaining <= this.CRITICAL_THRESHOLD) {
            // Mode critique: espacer au maximum
            const optimalDelay = Math.floor((resetIn || 900000) / remaining);
            return { 
                delay: Math.min(optimalDelay, 300000), // Max 5min
                reason: 'critical_spacing',
                remaining 
            };
        } else if (remaining <= this.WARNING_THRESHOLD) {
            // Mode prudent: délai modéré
            const optimalDelay = Math.floor((resetIn || 900000) / (remaining * 2));
            return { 
                delay: Math.min(optimalDelay, 60000), // Max 1min
                reason: 'conservative_spacing',
                remaining 
            };
        }

        // Mode normal: délai minimal
        return { delay: 3000, reason: 'normal_operation', remaining };
    }

    /**
     * Vérifie si une action peut être effectuée maintenant
     */
    canPerformAction(accountId, endpoint = 'unknown') {
        const key = `${accountId}_${endpoint}`;
        const rateLimitInfo = this.rateLimitData.get(key);

        if (!rateLimitInfo) {
            return { allowed: true, reason: 'no_data' };
        }

        const { remaining, resetIn } = rateLimitInfo;

        if (remaining <= 0) {
            return { 
                allowed: false, 
                reason: 'rate_limit_exhausted',
                waitTime: resetIn,
                resetAt: rateLimitInfo.resetAt
            };
        }

        if (remaining <= this.CRITICAL_THRESHOLD) {
            return { 
                allowed: false, 
                reason: 'critical_threshold_reached',
                remaining,
                suggestion: 'wait_for_reset'
            };
        }

        return { allowed: true, remaining };
    }

    /**
     * Obtient les statistiques de rate limit pour un compte
     */
    getAccountStats(accountId) {
        const accountData = [];
        
        for (const [key, data] of this.rateLimitData.entries()) {
            if (key.startsWith(accountId + '_')) {
                accountData.push(data);
            }
        }

        if (accountData.length === 0) {
            return { accountId, status: 'no_data' };
        }

        // Calculer le statut global
        const criticalEndpoints = accountData.filter(d => d.remaining <= this.CRITICAL_THRESHOLD);
        const warningEndpoints = accountData.filter(d => d.remaining <= this.WARNING_THRESHOLD);

        let status = 'healthy';
        if (criticalEndpoints.length > 0) {
            status = 'critical';
        } else if (warningEndpoints.length > 0) {
            status = 'warning';
        }

        return {
            accountId,
            status,
            endpoints: accountData.length,
            criticalEndpoints: criticalEndpoints.length,
            warningEndpoints: warningEndpoints.length,
            data: accountData
        };
    }

    /**
     * Nettoie les données expirées
     */
    cleanup() {
        const now = Date.now();
        const expiredKeys = [];

        for (const [key, data] of this.rateLimitData.entries()) {
            // Supprimer les données plus anciennes que 1h
            if (now - data.capturedAt > 3600000) {
                expiredKeys.push(key);
            }
        }

        expiredKeys.forEach(key => {
            this.rateLimitData.delete(key);
        });

        if (expiredKeys.length > 0) {
            logToFile(`[RATE-LIMIT-MONITOR] Cleaned up ${expiredKeys.length} expired entries`);
        }
    }

    /**
     * Obtient toutes les statistiques
     */
    getAllStats() {
        return {
            totalEntries: this.rateLimitData.size,
            endpoints: Array.from(this.endpointLimits.keys()),
            accounts: Array.from(new Set(
                Array.from(this.rateLimitData.keys()).map(k => k.split('_')[0])
            ))
        };
    }
}

// Instance singleton
let rateLimitMonitorInstance = null;

function getRateLimitMonitor() {
    if (!rateLimitMonitorInstance) {
        rateLimitMonitorInstance = new RateLimitMonitor();
        
        // Nettoyage périodique toutes les heures
        setInterval(() => {
            rateLimitMonitorInstance.cleanup();
        }, 3600000);
    }
    return rateLimitMonitorInstance;
}

module.exports = {
    RateLimitMonitor,
    getRateLimitMonitor
};
