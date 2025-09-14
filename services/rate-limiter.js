const { logToFile } = require('./logs-optimized');
const { getCacheInstance } = require('./cache');

/**
 * Service de rate limiting avancé pour X-AutoRaider
 * Responsabilités :
 * - Limitation par IP, utilisateur, compte Twitter
 * - Fenêtres glissantes et quotas dynamiques
 * - Priorités d'actions (like, retweet, comment)
 * - Intégration Redis pour distribution
 * - Protection contre les abus et surcharge
 */
class RateLimiterService {
    constructor() {
        this.cache = getCacheInstance();
        this.initialized = false;
        
        // Configuration par défaut
        this.defaultLimits = {
            // Limites par IP (par heure)
            ip: {
                requests: 1000,
                window: 3600000 // 1 heure en ms
            },
            
            // Limites par utilisateur (par jour)
            user: {
                requests: 5000,
                window: 86400000 // 24 heures en ms
            },
            
            // Limites par compte Twitter (par jour)
            twitterAccount: {
                likes: 170,
                retweets: 100,
                comments: 80,
                total: 350,
                window: 86400000 // 24 heures en ms
            },
            
            // Limites API (par minute)
            api: {
                requests: 60,
                window: 60000 // 1 minute en ms
            }
        };
        
        // Priorités d'actions (plus le score est élevé, plus prioritaire)
        this.actionPriorities = {
            comment: 3, // Priorité haute (engagement)
            like: 2,    // Priorité moyenne
            retweet: 1  // Priorité basse
        };
        
        // Multiplicateurs dynamiques selon l'heure
        this.timeMultipliers = {
            peak: 0.8,    // Heures de pointe (réduction 20%)
            normal: 1.0,  // Heures normales
            low: 1.2      // Heures creuses (augmentation 20%)
        };
    }

    /**
     * Initialise le service de rate limiting
     */
    async initialize() {
        try {
            this.initialized = true;
            logToFile('[RATE-LIMITER] Service de rate limiting initialisé avec succès');
            return true;
        } catch (error) {
            logToFile(`[RATE-LIMITER] Erreur d'initialisation: ${error.message}`);
            return false;
        }
    }

    /**
     * Vérifie si une action est autorisée selon les limites
     * @param {string} type - Type de limitation (ip, user, twitterAccount, api)
     * @param {string} identifier - Identifiant unique (IP, userID, accountID)
     * @param {string} action - Action spécifique (like, retweet, comment, request)
     * @param {object} options - Options supplémentaires
     * @returns {object} - {allowed, remaining, resetTime, reason}
     */
    async checkLimit(type, identifier, action = 'request', options = {}) {
        if (!this.initialized) {
            return { allowed: true, remaining: -1, resetTime: null, reason: 'Service non initialisé' };
        }

        try {
            const key = this.generateKey(type, identifier, action);
            const limit = this.getLimit(type, action, options);
            const window = this.getWindow(type, options);
            const now = Date.now();
            
            // Récupération des données de limitation
            const data = await this.getLimitData(key, window, now);
            
            // Vérification de la limite
            if (data.count >= limit) {
                logToFile(`[RATE-LIMITER] Limite atteinte pour ${type}:${identifier}:${action} (${data.count}/${limit})`);
                return {
                    allowed: false,
                    remaining: 0,
                    resetTime: data.resetTime,
                    reason: `Limite ${type} atteinte (${limit}/${window/1000}s)`
                };
            }

            // Incrémentation du compteur
            await this.incrementCounter(key, window, now);
            
            const remaining = Math.max(0, limit - data.count - 1);
            
            logToFile(`[RATE-LIMITER] Action autorisée ${type}:${identifier}:${action} (${data.count + 1}/${limit})`);
            
            return {
                allowed: true,
                remaining,
                resetTime: data.resetTime,
                reason: 'Autorisé'
            };

        } catch (error) {
            logToFile(`[RATE-LIMITER] Erreur vérification limite: ${error.message}`);
            // En cas d'erreur, on autorise (fail-open)
            return { allowed: true, remaining: -1, resetTime: null, reason: 'Erreur système' };
        }
    }

    /**
     * Vérifie les limites multiples (IP + User + Twitter Account)
     * @param {object} context - Contexte de la requête
     * @returns {object} - Résultat de la vérification
     */
    async checkMultipleLimits(context) {
        const checks = [];
        
        // Vérification par IP
        if (context.ip) {
            checks.push(this.checkLimit('ip', context.ip, 'request'));
        }
        
        // Vérification par utilisateur
        if (context.userId) {
            checks.push(this.checkLimit('user', context.userId, 'request'));
        }
        
        // Vérification par compte Twitter
        if (context.twitterAccountId && context.action) {
            checks.push(this.checkLimit('twitterAccount', context.twitterAccountId, context.action));
        }
        
        // Vérification API générale
        if (context.apiEndpoint) {
            checks.push(this.checkLimit('api', context.apiEndpoint, 'request'));
        }

        const results = await Promise.all(checks);
        
        // Si une limite est atteinte, on refuse
        const blocked = results.find(result => !result.allowed);
        if (blocked) {
            return blocked;
        }
        
        // Toutes les limites sont OK
        const minRemaining = Math.min(...results.map(r => r.remaining).filter(r => r >= 0));
        return {
            allowed: true,
            remaining: minRemaining,
            resetTime: Math.max(...results.map(r => r.resetTime || 0)),
            reason: 'Toutes les limites respectées'
        };
    }

    /**
     * Applique une limitation intelligente selon les priorités
     * @param {string} twitterAccountId - ID du compte Twitter
     * @param {string} action - Action à effectuer
     * @param {object} options - Options supplémentaires
     * @returns {object} - Résultat avec priorité appliquée
     */
    async checkSmartLimit(twitterAccountId, action, options = {}) {
        // Vérification de base
        const baseCheck = await this.checkLimit('twitterAccount', twitterAccountId, action, options);
        
        if (baseCheck.allowed) {
            return baseCheck;
        }

        // Si la limite est atteinte, vérifier si on peut utiliser la priorité
        const priority = this.actionPriorities[action] || 1;
        const totalUsed = await this.getTotalActionsUsed(twitterAccountId);
        const totalLimit = this.getLimit('twitterAccount', 'total', options);
        
        // Si on a de la marge sur le total et que l'action est prioritaire
        if (totalUsed < totalLimit && priority >= 2) {
            // Permettre l'action en réduisant les quotas des actions moins prioritaires
            const rebalanced = await this.rebalanceQuotas(twitterAccountId, action, options);
            
            if (rebalanced.success) {
                logToFile(`[RATE-LIMITER] Rééquilibrage des quotas pour ${twitterAccountId}:${action}`);
                return {
                    allowed: true,
                    remaining: rebalanced.remaining,
                    resetTime: baseCheck.resetTime,
                    reason: 'Rééquilibrage intelligent des quotas'
                };
            }
        }

        return baseCheck;
    }

    /**
     * Génère une clé unique pour le cache
     */
    generateKey(type, identifier, action) {
        return `rate_limit:${type}:${identifier}:${action}`;
    }

    /**
     * Récupère la limite selon le type et l'action
     */
    getLimit(type, action, options = {}) {
        let baseLimit;
        
        if (type === 'twitterAccount') {
            baseLimit = this.defaultLimits.twitterAccount[action] || this.defaultLimits.twitterAccount.total;
        } else {
            baseLimit = this.defaultLimits[type]?.requests || 100;
        }

        // Application du multiplicateur temporel
        const timeMultiplier = this.getTimeMultiplier();
        const customMultiplier = options.multiplier || 1;
        
        return Math.floor(baseLimit * timeMultiplier * customMultiplier);
    }

    /**
     * Récupère la fenêtre temporelle
     */
    getWindow(type, options = {}) {
        return options.window || this.defaultLimits[type]?.window || 3600000;
    }

    /**
     * Récupère les données de limitation depuis le cache
     */
    async getLimitData(key, window, now) {
        if (!this.cache.isAvailable()) {
            // Mode dégradé : utiliser la mémoire locale (moins précis)
            return this.getLocalLimitData(key, window, now);
        }

        try {
            const data = await this.cache.client.hgetall(key);
            
            if (!data.count) {
                // Première utilisation
                const resetTime = now + window;
                return { count: 0, resetTime };
            }

            const resetTime = parseInt(data.resetTime);
            
            // Vérifier si la fenêtre a expiré
            if (now >= resetTime) {
                // Réinitialiser le compteur
                await this.cache.client.del(key);
                return { count: 0, resetTime: now + window };
            }

            return {
                count: parseInt(data.count) || 0,
                resetTime
            };

        } catch (error) {
            logToFile(`[RATE-LIMITER] Erreur récupération données: ${error.message}`);
            return { count: 0, resetTime: now + window };
        }
    }

    /**
     * Incrémente le compteur de limitation
     */
    async incrementCounter(key, window, now) {
        if (!this.cache.isAvailable()) {
            return this.incrementLocalCounter(key, window, now);
        }

        try {
            const resetTime = now + window;
            
            await this.cache.client.multi()
                .hincrby(key, 'count', 1)
                .hset(key, 'resetTime', resetTime)
                .expire(key, Math.ceil(window / 1000))
                .exec();

        } catch (error) {
            logToFile(`[RATE-LIMITER] Erreur incrémentation: ${error.message}`);
        }
    }

    /**
     * Récupère le multiplicateur temporel selon l'heure
     */
    getTimeMultiplier() {
        const hour = new Date().getHours();
        
        // Heures de pointe : 8h-12h et 14h-18h
        if ((hour >= 8 && hour <= 12) || (hour >= 14 && hour <= 18)) {
            return this.timeMultipliers.peak;
        }
        
        // Heures creuses : 22h-6h
        if (hour >= 22 || hour <= 6) {
            return this.timeMultipliers.low;
        }
        
        // Heures normales
        return this.timeMultipliers.normal;
    }

    /**
     * Récupère le total d'actions utilisées pour un compte
     */
    async getTotalActionsUsed(twitterAccountId) {
        const actions = ['likes', 'retweets', 'comments'];
        let total = 0;

        for (const action of actions) {
            const key = this.generateKey('twitterAccount', twitterAccountId, action);
            const data = await this.getLimitData(key, this.defaultLimits.twitterAccount.window, Date.now());
            total += data.count;
        }

        return total;
    }

    /**
     * Rééquilibre les quotas en fonction des priorités
     */
    async rebalanceQuotas(twitterAccountId, requestedAction, options = {}) {
        // Logique de rééquilibrage intelligent
        // À implémenter selon les besoins spécifiques
        return { success: false, remaining: 0 };
    }

    /**
     * Mode dégradé : gestion locale des limites (en mémoire)
     */
    getLocalLimitData(key, window, now) {
        if (!this.localCache) {
            this.localCache = new Map();
        }

        const data = this.localCache.get(key);
        
        if (!data || now >= data.resetTime) {
            const newData = { count: 0, resetTime: now + window };
            this.localCache.set(key, newData);
            return newData;
        }

        return data;
    }

    incrementLocalCounter(key, window, now) {
        const data = this.getLocalLimitData(key, window, now);
        data.count++;
        this.localCache.set(key, data);
    }

    /**
     * Récupère les statistiques de rate limiting
     */
    async getStats(type, identifier) {
        const stats = {
            type,
            identifier,
            limits: {},
            usage: {},
            resetTimes: {}
        };

        const actions = type === 'twitterAccount' 
            ? ['likes', 'retweets', 'comments', 'total']
            : ['request'];

        for (const action of actions) {
            const key = this.generateKey(type, identifier, action);
            const limit = this.getLimit(type, action);
            const window = this.getWindow(type);
            const data = await this.getLimitData(key, window, Date.now());

            stats.limits[action] = limit;
            stats.usage[action] = data.count;
            stats.resetTimes[action] = data.resetTime;
        }

        return stats;
    }

    /**
     * Réinitialise les limites pour un identifiant
     */
    async resetLimits(type, identifier) {
        try {
            const pattern = `rate_limit:${type}:${identifier}:*`;
            
            if (this.cache.isAvailable()) {
                const keys = await this.cache.client.keys(pattern);
                if (keys.length > 0) {
                    await this.cache.client.del(keys);
                }
            }

            // Nettoyage du cache local aussi
            if (this.localCache) {
                for (const [key] of this.localCache) {
                    if (key.startsWith(`rate_limit:${type}:${identifier}:`)) {
                        this.localCache.delete(key);
                    }
                }
            }

            logToFile(`[RATE-LIMITER] Limites réinitialisées pour ${type}:${identifier}`);
            return true;

        } catch (error) {
            logToFile(`[RATE-LIMITER] Erreur réinitialisation: ${error.message}`);
            return false;
        }
    }

    /**
     * Nettoyage périodique des données expirées
     */
    async cleanup() {
        try {
            if (this.localCache) {
                const now = Date.now();
                for (const [key, data] of this.localCache) {
                    if (now >= data.resetTime) {
                        this.localCache.delete(key);
                    }
                }
            }

            logToFile('[RATE-LIMITER] Nettoyage périodique effectué');
        } catch (error) {
            logToFile(`[RATE-LIMITER] Erreur nettoyage: ${error.message}`);
        }
    }
}

// Export du service
const rateLimiterService = new RateLimiterService();
module.exports = rateLimiterService;
