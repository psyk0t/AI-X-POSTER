const { getUnifiedLogger } = require('./unified-logger');
const { getPerformanceMonitor } = require('./performance-monitor');

/**
 * 🚨 GESTIONNAIRE D'ERREURS UNIFIÉ
 * Centralise la gestion des erreurs avec classification automatique et recovery
 */
class ErrorHandler {
    constructor() {
        this.logger = getUnifiedLogger();
        this.monitor = getPerformanceMonitor();
        
        this.errorCategories = {
            AUTHENTICATION: 'authentication',
            RATE_LIMIT: 'rate_limit', 
            QUOTA: 'quota',
            NETWORK: 'network',
            VALIDATION: 'validation',
            SYSTEM: 'system',
            UNKNOWN: 'unknown'
        };
        
        this.recoveryStrategies = new Map();
        this.circuitBreakers = new Map();
        
        this.setupRecoveryStrategies();
        this.setupGlobalHandlers();
    }

    setupRecoveryStrategies() {
        // Stratégie pour les erreurs d'authentification
        this.recoveryStrategies.set(this.errorCategories.AUTHENTICATION, {
            maxRetries: 1,
            retryDelay: 0,
            action: async (error, context) => {
                await this.logger.logError(`[AUTH] Erreur d'authentification: ${error.message}`, error);
                // Pas de retry automatique pour l'auth - nécessite intervention manuelle
                return { canRetry: false, shouldAlert: true };
            }
        });

        // Stratégie pour les rate limits
        this.recoveryStrategies.set(this.errorCategories.RATE_LIMIT, {
            maxRetries: 3,
            retryDelay: 900000, // 15 minutes
            action: async (error, context) => {
                const delay = this.extractDelayFromRateLimit(error.message) || 900000;
                await this.logger.logWarning(`[RATE-LIMIT] Limite atteinte, attente de ${delay/1000}s`);
                return { canRetry: true, delay, shouldAlert: false };
            }
        });

        // Stratégie pour les quotas
        this.recoveryStrategies.set(this.errorCategories.QUOTA, {
            maxRetries: 0,
            retryDelay: 0,
            action: async (error, context) => {
                await this.logger.logWarning(`[QUOTA] Quota épuisé: ${error.message}`);
                return { canRetry: false, shouldAlert: true, shouldPause: true };
            }
        });

        // Stratégie pour les erreurs réseau
        this.recoveryStrategies.set(this.errorCategories.NETWORK, {
            maxRetries: 3,
            retryDelay: 5000, // 5 secondes
            action: async (error, context) => {
                await this.logger.logWarning(`[NETWORK] Erreur réseau: ${error.message}`);
                return { canRetry: true, delay: 5000, shouldAlert: false };
            }
        });
    }

    setupGlobalHandlers() {
        // Gestionnaire d'erreurs non capturées
        process.on('uncaughtException', (error) => {
            this.handleCriticalError('UNCAUGHT_EXCEPTION', error);
        });

        process.on('unhandledRejection', (reason, promise) => {
            this.handleCriticalError('UNHANDLED_REJECTION', new Error(reason), { promise });
        });
    }

    /**
     * 🔍 CLASSIFICATION AUTOMATIQUE DES ERREURS
     */
    classifyError(error) {
        const message = error.message.toLowerCase();
        const code = error.code || '';

        // Erreurs d'authentification
        if (message.includes('unauthorized') || message.includes('invalid token') || 
            message.includes('authentication') || code === '401') {
            return this.errorCategories.AUTHENTICATION;
        }

        // Rate limiting
        if (message.includes('rate limit') || message.includes('too many requests') || 
            code === '429' || message.includes('x-rate-limit')) {
            return this.errorCategories.RATE_LIMIT;
        }

        // Quotas
        if (message.includes('quota') || message.includes('limit exceeded') ||
            message.includes('daily limit') || message.includes('monthly limit')) {
            return this.errorCategories.QUOTA;
        }

        // Erreurs réseau
        if (message.includes('network') || message.includes('timeout') ||
            message.includes('connection') || code === 'ECONNRESET' || 
            code === 'ETIMEDOUT' || code === 'ENOTFOUND') {
            return this.errorCategories.NETWORK;
        }

        // Erreurs de validation
        if (message.includes('validation') || message.includes('invalid') ||
            message.includes('required') || code === '400') {
            return this.errorCategories.VALIDATION;
        }

        // Erreurs système
        if (message.includes('memory') || message.includes('disk') ||
            message.includes('system') || code === '500') {
            return this.errorCategories.SYSTEM;
        }

        return this.errorCategories.UNKNOWN;
    }

    /**
     * 🛠️ GESTION PRINCIPALE DES ERREURS
     */
    async handleError(error, context = {}) {
        const category = this.classifyError(error);
        const timestamp = new Date().toISOString();
        
        // Enrichir le contexte
        const enrichedContext = {
            ...context,
            category,
            timestamp,
            stack: error.stack,
            accountId: context.accountId || 'unknown',
            operation: context.operation || 'unknown'
        };

        // Logger l'erreur
        await this.logger.logError(
            `[${category.toUpperCase()}] ${error.message}`,
            { ...enrichedContext, originalError: error }
        );

        // Vérifier le circuit breaker
        if (this.isCircuitBreakerOpen(category, enrichedContext.accountId)) {
            return {
                handled: false,
                reason: 'circuit_breaker_open',
                category,
                shouldRetry: false
            };
        }

        // Appliquer la stratégie de récupération
        const strategy = this.recoveryStrategies.get(category);
        if (strategy) {
            try {
                const result = await strategy.action(error, enrichedContext);
                
                // Mettre à jour le circuit breaker
                if (!result.canRetry) {
                    this.updateCircuitBreaker(category, enrichedContext.accountId, false);
                }

                return {
                    handled: true,
                    category,
                    ...result,
                    strategy: strategy
                };
            } catch (recoveryError) {
                await this.logger.logError(
                    `[ERROR-HANDLER] Erreur dans la stratégie de récupération: ${recoveryError.message}`,
                    { originalError: error, recoveryError }
                );
            }
        }

        // Stratégie par défaut
        return {
            handled: false,
            category,
            shouldRetry: false,
            shouldAlert: true
        };
    }

    /**
     * ⚡ CIRCUIT BREAKER PATTERN
     */
    isCircuitBreakerOpen(category, accountId) {
        const key = `${category}_${accountId}`;
        const breaker = this.circuitBreakers.get(key);
        
        if (!breaker) return false;
        
        // Vérifier si le circuit breaker doit être réinitialisé
        if (Date.now() - breaker.lastFailure > breaker.resetTimeout) {
            this.circuitBreakers.delete(key);
            return false;
        }
        
        return breaker.failures >= breaker.threshold;
    }

    updateCircuitBreaker(category, accountId, success) {
        const key = `${category}_${accountId}`;
        let breaker = this.circuitBreakers.get(key);
        
        if (!breaker) {
            breaker = {
                failures: 0,
                threshold: 5,
                resetTimeout: 300000, // 5 minutes
                lastFailure: null
            };
        }
        
        if (success) {
            breaker.failures = Math.max(0, breaker.failures - 1);
        } else {
            breaker.failures++;
            breaker.lastFailure = Date.now();
        }
        
        this.circuitBreakers.set(key, breaker);
        
        // Logger si le circuit breaker s'ouvre
        if (breaker.failures >= breaker.threshold) {
            this.logger.logWarning(
                `[CIRCUIT-BREAKER] Circuit ouvert pour ${category}/${accountId} (${breaker.failures} échecs)`
            );
        }
    }

    /**
     * 🚨 GESTION DES ERREURS CRITIQUES
     */
    async handleCriticalError(type, error, context = {}) {
        const criticalError = {
            type,
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
            context,
            pid: process.pid,
            memory: process.memoryUsage(),
            uptime: process.uptime()
        };

        // Logger l'erreur critique
        await this.logger.logError(
            `[CRITICAL] ${type}: ${error.message}`,
            criticalError
        );

        // Notifier le monitor de performance
        this.monitor.emit('critical-error', criticalError);

        // Actions d'urgence selon le type
        switch (type) {
            case 'UNCAUGHT_EXCEPTION':
                console.error('[CRITICAL] Exception non capturée, arrêt du processus dans 5s...');
                setTimeout(() => process.exit(1), 5000);
                break;
                
            case 'UNHANDLED_REJECTION':
                console.error('[CRITICAL] Promise rejetée non gérée');
                break;
                
            case 'MEMORY_LEAK':
                console.error('[CRITICAL] Fuite mémoire détectée');
                // Déclencher un garbage collection forcé
                if (global.gc) global.gc();
                break;
        }
    }

    /**
     * 🔧 UTILITAIRES
     */
    extractDelayFromRateLimit(message) {
        // Extraire le délai depuis le message d'erreur X-Rate-Limit
        const match = message.match(/reset.*?(\d+)/i);
        if (match) {
            const resetTime = parseInt(match[1]);
            const now = Math.floor(Date.now() / 1000);
            return Math.max(0, (resetTime - now) * 1000);
        }
        return null;
    }

    /**
     * 📊 STATISTIQUES D'ERREURS
     */
    getErrorStats() {
        const stats = {
            circuitBreakers: {},
            categories: {},
            recovery: {
                totalAttempts: 0,
                successfulRecoveries: 0,
                failedRecoveries: 0
            }
        };

        // Statistiques des circuit breakers
        for (const [key, breaker] of this.circuitBreakers.entries()) {
            stats.circuitBreakers[key] = {
                failures: breaker.failures,
                isOpen: breaker.failures >= breaker.threshold,
                lastFailure: breaker.lastFailure
            };
        }

        return stats;
    }

    /**
     * 🧹 NETTOYAGE
     */
    cleanup() {
        this.circuitBreakers.clear();
        this.recoveryStrategies.clear();
        
        // Supprimer les gestionnaires globaux
        process.removeAllListeners('uncaughtException');
        process.removeAllListeners('unhandledRejection');
    }
}

// Instance singleton
let errorHandlerInstance = null;

function getErrorHandler() {
    if (!errorHandlerInstance) {
        errorHandlerInstance = new ErrorHandler();
    }
    return errorHandlerInstance;
}

/**
 * 🎯 WRAPPER POUR FONCTIONS ASYNC
 */
function withErrorHandling(fn, context = {}) {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            const handler = getErrorHandler();
            const result = await handler.handleError(error, context);
            
            if (result.shouldRetry && result.delay) {
                await new Promise(resolve => setTimeout(resolve, result.delay));
                return withErrorHandling(fn, context)(...args);
            }
            
            throw error;
        }
    };
}

/**
 * 🎯 DECORATOR POUR CLASSES
 */
function errorHandled(target, propertyName, descriptor) {
    const method = descriptor.value;
    
    descriptor.value = async function(...args) {
        try {
            return await method.apply(this, args);
        } catch (error) {
            const handler = getErrorHandler();
            await handler.handleError(error, {
                class: target.constructor.name,
                method: propertyName,
                args: args.length
            });
            throw error;
        }
    };
    
    return descriptor;
}

module.exports = {
    ErrorHandler,
    getErrorHandler,
    withErrorHandling,
    errorHandled
};
