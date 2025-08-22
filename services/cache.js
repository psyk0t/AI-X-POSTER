const redis = require('redis');
const { logToFile } = require('./logs-optimized');

/**
 * Service de cache Redis pour X-AutoRaider
 * Responsabilités :
 * - Cache des logs temps réel
 * - Cache des quotas et statistiques
 * - Sessions utilisateurs persistantes
 * - Rate limiting distribué
 */
class CacheService {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.retryAttempts = 0;
        this.maxRetries = 5;
    }

    /**
     * Initialise la connexion Redis
     */
    async initialize() {
        try {
            // Configuration Redis avec fallback
            const redisConfig = {
                host: process.env.REDIS_HOST || 'localhost',
                port: process.env.REDIS_PORT || 6379,
                password: process.env.REDIS_PASSWORD || undefined,
                retryDelayOnFailover: 100,
                enableReadyCheck: false,
                maxRetriesPerRequest: 3,
                lazyConnect: true
            };

            this.client = redis.createClient(redisConfig);

            // Gestion des événements Redis
            this.client.on('connect', () => {
                logToFile('[CACHE] Connexion Redis établie');
                this.isConnected = true;
                this.retryAttempts = 0;
            });

            this.client.on('error', (err) => {
                this.isConnected = false;
                this.handleRedisError(err);
            });

            this.client.on('end', () => {
                logToFile('[CACHE] Connexion Redis fermée');
                this.isConnected = false;
            });

            // Tentative de connexion
            await this.client.connect();
            
            // Test de connexion
            await this.client.ping();
            logToFile('[CACHE] Service Redis initialisé avec succès');
            
            return true;
        } catch (error) {
            const errorMsg = error?.message || error?.code || error?.toString() || 'Erreur inconnue';
            logToFile(`[CACHE] Échec d'initialisation Redis: ${errorMsg}`);
            this.isConnected = false;
            return false;
        }
    }

    /**
     * Gestion des erreurs Redis avec retry automatique
     */
    async handleRedisError(error) {
        // Éviter le spam de logs - ne logger qu'une fois par minute
        const now = Date.now();
        if (!this.lastErrorLog || (now - this.lastErrorLog) > 60000) {
            const errorMsg = error?.message || error?.code || error?.toString() || 'Erreur inconnue';
            logToFile(`[CACHE] Erreur Redis: ${errorMsg}`);
            this.lastErrorLog = now;
        }
        
        if (this.retryAttempts < this.maxRetries) {
            this.retryAttempts++;
            
            // Ne logger les tentatives qu'une fois
            if (this.retryAttempts === 1) {
                logToFile(`[CACHE] Redis non disponible - Tentatives de reconnexion en cours...`);
            }
            
            setTimeout(async () => {
                try {
                    await this.initialize();
                } catch (retryError) {
                    // Pas de log ici pour éviter le spam
                }
            }, 2000 * this.retryAttempts); // Délai exponentiel
        } else {
            // Ne logger qu'une fois le passage en mode dégradé
            if (!this.degradedModeLogged) {
                logToFile('[CACHE] Redis indisponible - Mode dégradé activé (fonctionnement sans cache)');
                this.degradedModeLogged = true;
            }
        }
    }

    /**
     * Vérifie si Redis est disponible
     */
    isAvailable() {
        return this.isConnected && this.client;
    }

    /**
     * Cache des logs temps réel avec TTL
     */
    async cacheLiveLogs(logs, ttlSeconds = 300) {
        if (!this.isAvailable()) return false;
        
        try {
            const key = 'live_logs';
            const value = JSON.stringify(logs);
            await this.client.setEx(key, ttlSeconds, value);
            return true;
        } catch (error) {
            logToFile(`[CACHE] Erreur cache logs: ${error.message}`);
            return false;
        }
    }

    /**
     * Récupère les logs depuis le cache
     */
    async getCachedLiveLogs() {
        if (!this.isAvailable()) return null;
        
        try {
            const cached = await this.client.get('live_logs');
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            logToFile(`[CACHE] Erreur récupération logs: ${error.message}`);
            return null;
        }
    }

    /**
     * Cache des quotas avec TTL
     */
    async cacheQuotas(quotas, ttlSeconds = 3600) {
        if (!this.isAvailable()) return false;
        
        try {
            const key = 'quotas_data';
            const value = JSON.stringify(quotas);
            await this.client.setEx(key, ttlSeconds, value);
            return true;
        } catch (error) {
            logToFile(`[CACHE] Erreur cache quotas: ${error.message}`);
            return false;
        }
    }

    /**
     * Récupère les quotas depuis le cache
     */
    async getCachedQuotas() {
        if (!this.isAvailable()) return null;
        
        try {
            const cached = await this.client.get('quotas_data');
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            logToFile(`[CACHE] Erreur récupération quotas: ${error.message}`);
            return null;
        }
    }

    /**
     * Rate limiting par compte avec compteur
     */
    async incrementRateLimit(accountId, windowSeconds = 900) {
        if (!this.isAvailable()) return { count: 0, ttl: 0 };
        
        try {
            const key = `rate_limit:${accountId}`;
            const current = await this.client.incr(key);
            
            if (current === 1) {
                await this.client.expire(key, windowSeconds);
            }
            
            const ttl = await this.client.ttl(key);
            return { count: current, ttl: ttl };
        } catch (error) {
            logToFile(`[CACHE] Erreur rate limiting: ${error.message}`);
            return { count: 0, ttl: 0 };
        }
    }

    /**
     * Vérifie le rate limit pour un compte
     */
    async checkRateLimit(accountId, maxRequests = 50) {
        if (!this.isAvailable()) return { allowed: true, remaining: maxRequests };
        
        try {
            const key = `rate_limit:${accountId}`;
            const current = await this.client.get(key) || 0;
            const remaining = Math.max(0, maxRequests - parseInt(current));
            
            return {
                allowed: parseInt(current) < maxRequests,
                remaining: remaining,
                resetTime: await this.client.ttl(key)
            };
        } catch (error) {
            logToFile(`[CACHE] Erreur vérification rate limit: ${error.message}`);
            return { allowed: true, remaining: maxRequests };
        }
    }

    /**
     * Cache des statistiques dashboard
     */
    async cacheDashboardStats(stats, ttlSeconds = 60) {
        if (!this.isAvailable()) return false;
        
        try {
            const key = 'dashboard_stats';
            const value = JSON.stringify({
                ...stats,
                cachedAt: Date.now()
            });
            await this.client.setEx(key, ttlSeconds, value);
            return true;
        } catch (error) {
            logToFile(`[CACHE] Erreur cache stats: ${error.message}`);
            return false;
        }
    }

    /**
     * Récupère les stats dashboard depuis le cache
     */
    async getCachedDashboardStats() {
        if (!this.isAvailable()) return null;
        
        try {
            const cached = await this.client.get('dashboard_stats');
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            logToFile(`[CACHE] Erreur récupération stats: ${error.message}`);
            return null;
        }
    }

    /**
     * Cache des sessions utilisateur
     */
    async cacheSession(sessionId, sessionData, ttlSeconds = 86400) {
        if (!this.isAvailable()) return false;
        
        try {
            const key = `session:${sessionId}`;
            const value = JSON.stringify(sessionData);
            await this.client.setEx(key, ttlSeconds, value);
            return true;
        } catch (error) {
            logToFile(`[CACHE] Erreur cache session: ${error.message}`);
            return false;
        }
    }

    /**
     * Récupère une session utilisateur
     */
    async getSession(sessionId) {
        if (!this.isAvailable()) return null;
        
        try {
            const cached = await this.client.get(`session:${sessionId}`);
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            logToFile(`[CACHE] Erreur récupération session: ${error.message}`);
            return null;
        }
    }

    /**
     * Supprime une session
     */
    async deleteSession(sessionId) {
        if (!this.isAvailable()) return false;
        
        try {
            await this.client.del(`session:${sessionId}`);
            return true;
        } catch (error) {
            logToFile(`[CACHE] Erreur suppression session: ${error.message}`);
            return false;
        }
    }

    /**
     * Nettoyage des clés expirées et maintenance
     */
    async cleanup() {
        if (!this.isAvailable()) return;
        
        try {
            // Nettoyage des clés de rate limiting expirées
            const keys = await this.client.keys('rate_limit:*');
            let cleanedCount = 0;
            
            for (const key of keys) {
                const ttl = await this.client.ttl(key);
                if (ttl === -1) { // Pas d'expiration définie
                    await this.client.del(key);
                    cleanedCount++;
                }
            }
            
            if (cleanedCount > 0) {
                logToFile(`[CACHE] Nettoyage: ${cleanedCount} clés supprimées`);
            }
        } catch (error) {
            logToFile(`[CACHE] Erreur nettoyage: ${error.message}`);
        }
    }

    /**
     * Statistiques du cache
     */
    async getStats() {
        if (!this.isAvailable()) return null;
        
        try {
            const info = await this.client.info('memory');
            const keyspace = await this.client.info('keyspace');
            
            return {
                connected: this.isConnected,
                memory: info,
                keyspace: keyspace,
                timestamp: Date.now()
            };
        } catch (error) {
            logToFile(`[CACHE] Erreur stats: ${error.message}`);
            return null;
        }
    }

    /**
     * Fermeture propre de la connexion
     */
    async close() {
        if (this.client) {
            try {
                await this.client.quit();
                logToFile('[CACHE] Connexion Redis fermée proprement');
            } catch (error) {
                logToFile(`[CACHE] Erreur fermeture: ${error.message}`);
            }
        }
    }
}

// Instance singleton
let cacheInstance = null;

/**
 * Récupère l'instance du cache (singleton)
 */
function getCacheInstance() {
    if (!cacheInstance) {
        cacheInstance = new CacheService();
    }
    return cacheInstance;
}

module.exports = {
    CacheService,
    getCacheInstance
};
