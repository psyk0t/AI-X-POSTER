const EventEmitter = require('events');
const { getUnifiedLogger } = require('./unified-logger');

/**
 * 📊 MONITEUR DE PERFORMANCE EN TEMPS RÉEL
 * Centralise toutes les métriques système pour un monitoring unifié
 */
class PerformanceMonitor extends EventEmitter {
    constructor() {
        super();
        this.logger = getUnifiedLogger();
        this.metrics = {
            // Métriques système
            system: {
                startTime: Date.now(),
                uptime: 0,
                memoryUsage: { heapUsed: 0, heapTotal: 0, external: 0 },
                cpuUsage: { user: 0, system: 0 }
            },
            
            // Métriques d'automation
            automation: {
                totalScans: 0,
                successfulScans: 0,
                failedScans: 0,
                avgScanDuration: 0,
                lastScanTime: null,
                tweetsProcessed: 0,
                actionsGenerated: 0
            },
            
            // Métriques API
            api: {
                totalRequests: 0,
                successfulRequests: 0,
                failedRequests: 0,
                avgResponseTime: 0,
                rateLimitHits: 0,
                quotaExceeded: 0
            },
            
            // Métriques de quotas
            quotas: {
                totalAccounts: 0,
                activeAccounts: 0,
                quotaUtilization: 0,
                dailyActionsRemaining: 0,
                hourlyActionsRemaining: 0
            },
            
            // Métriques d'erreurs
            errors: {
                total: 0,
                byType: {},
                recent: [],
                criticalErrors: 0
            }
        };
        
        this.collectors = new Map();
        this.alertThresholds = {
            memoryUsage: 0.85, // 85% de la heap
            errorRate: 0.1,    // 10% d'erreurs
            responseTime: 5000, // 5 secondes
            quotaUtilization: 0.9 // 90% des quotas
        };
        
        this.init();
    }

    init() {
        // Démarrer la collecte des métriques système
        this.startSystemMetricsCollection();
        
        // Écouter les événements du logger
        this.logger.on('log', (logEntry) => {
            this.processLogEntry(logEntry);
        });
        
        console.log('[PERFORMANCE-MONITOR] Service initialisé');
    }

    /**
     * 🔄 COLLECTE DES MÉTRIQUES SYSTÈME
     */
    startSystemMetricsCollection() {
        const collectInterval = setInterval(() => {
            this.collectSystemMetrics();
        }, 30000); // Toutes les 30 secondes
        
        this.collectors.set('system', collectInterval);
    }

    collectSystemMetrics() {
        // Métriques de mémoire
        const memUsage = process.memoryUsage();
        this.metrics.system.memoryUsage = {
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            external: memUsage.external,
            rss: memUsage.rss
        };
        
        // Uptime
        this.metrics.system.uptime = Date.now() - this.metrics.system.startTime;
        
        // CPU usage
        const cpuUsage = process.cpuUsage();
        this.metrics.system.cpuUsage = {
            user: cpuUsage.user,
            system: cpuUsage.system
        };
        
        // Vérifier les seuils d'alerte
        this.checkAlerts();
        
        // Émettre l'événement de mise à jour
        this.emit('metrics-updated', {
            type: 'system',
            metrics: this.metrics.system,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * 📝 TRAITEMENT DES LOGS POUR MÉTRIQUES
     */
    processLogEntry(logEntry) {
        const message = logEntry.message.toLowerCase();
        
        // Métriques d'automation
        if (message.includes('automation scan')) {
            this.metrics.automation.totalScans++;
            if (message.includes('completed')) {
                this.metrics.automation.successfulScans++;
            } else if (message.includes('failed') || message.includes('error')) {
                this.metrics.automation.failedScans++;
            }
        }
        
        if (message.includes('tweets found')) {
            const match = message.match(/(\d+) tweets found/);
            if (match) {
                this.metrics.automation.tweetsProcessed += parseInt(match[1]);
            }
        }
        
        if (message.includes('actions generated')) {
            const match = message.match(/(\d+) actions generated/);
            if (match) {
                this.metrics.automation.actionsGenerated += parseInt(match[1]);
            }
        }
        
        // Métriques API
        if (message.includes('api request')) {
            this.metrics.api.totalRequests++;
            if (logEntry.level === 'ERROR') {
                this.metrics.api.failedRequests++;
            } else {
                this.metrics.api.successfulRequests++;
            }
        }
        
        if (message.includes('rate limit')) {
            this.metrics.api.rateLimitHits++;
        }
        
        if (message.includes('quota exceeded')) {
            this.metrics.api.quotaExceeded++;
        }
        
        // Métriques d'erreurs
        if (logEntry.level === 'ERROR') {
            this.metrics.errors.total++;
            
            // Catégoriser l'erreur
            const errorType = this.categorizeError(message);
            this.metrics.errors.byType[errorType] = (this.metrics.errors.byType[errorType] || 0) + 1;
            
            // Ajouter aux erreurs récentes
            this.metrics.errors.recent.unshift({
                timestamp: logEntry.timestamp,
                message: logEntry.message,
                type: errorType
            });
            
            // Garder seulement les 50 dernières erreurs
            if (this.metrics.errors.recent.length > 50) {
                this.metrics.errors.recent = this.metrics.errors.recent.slice(0, 50);
            }
            
            // Vérifier si c'est une erreur critique
            if (this.isCriticalError(message)) {
                this.metrics.errors.criticalErrors++;
                this.emit('critical-error', {
                    timestamp: logEntry.timestamp,
                    message: logEntry.message,
                    type: errorType
                });
            }
        }
    }

    categorizeError(message) {
        if (message.includes('oauth') || message.includes('auth')) return 'authentication';
        if (message.includes('rate limit') || message.includes('429')) return 'rate_limit';
        if (message.includes('quota')) return 'quota';
        if (message.includes('network') || message.includes('timeout')) return 'network';
        if (message.includes('database') || message.includes('file')) return 'storage';
        return 'other';
    }

    isCriticalError(message) {
        const criticalPatterns = [
            /authentication failed/i,
            /database connection lost/i,
            /out of memory/i,
            /service unavailable/i,
            /critical system error/i
        ];
        
        return criticalPatterns.some(pattern => pattern.test(message));
    }

    /**
     * 🚨 SYSTÈME D'ALERTES
     */
    checkAlerts() {
        const alerts = [];
        
        // Alerte mémoire
        const memoryUsage = this.metrics.system.memoryUsage.heapUsed / this.metrics.system.memoryUsage.heapTotal;
        if (memoryUsage > this.alertThresholds.memoryUsage) {
            alerts.push({
                type: 'memory',
                severity: 'warning',
                message: `Utilisation mémoire élevée: ${(memoryUsage * 100).toFixed(1)}%`,
                value: memoryUsage,
                threshold: this.alertThresholds.memoryUsage
            });
        }
        
        // Alerte taux d'erreur
        const errorRate = this.metrics.api.totalRequests > 0 ? 
            this.metrics.api.failedRequests / this.metrics.api.totalRequests : 0;
        if (errorRate > this.alertThresholds.errorRate) {
            alerts.push({
                type: 'error_rate',
                severity: 'critical',
                message: `Taux d'erreur élevé: ${(errorRate * 100).toFixed(1)}%`,
                value: errorRate,
                threshold: this.alertThresholds.errorRate
            });
        }
        
        // Émettre les alertes
        if (alerts.length > 0) {
            this.emit('alerts', alerts);
            for (const alert of alerts) {
                this.logger.logWarning(`[ALERT] ${alert.message}`);
            }
        }
    }

    /**
     * 📊 MÉTHODES D'ACCÈS AUX MÉTRIQUES
     */
    getMetrics(category = null) {
        if (category) {
            return this.metrics[category] || null;
        }
        return this.metrics;
    }

    getSystemHealth() {
        const memoryUsage = this.metrics.system.memoryUsage.heapUsed / this.metrics.system.memoryUsage.heapTotal;
        const errorRate = this.metrics.api.totalRequests > 0 ? 
            this.metrics.api.failedRequests / this.metrics.api.totalRequests : 0;
        
        let health = 'healthy';
        if (memoryUsage > 0.8 || errorRate > 0.05) {
            health = 'warning';
        }
        if (memoryUsage > 0.9 || errorRate > 0.15 || this.metrics.errors.criticalErrors > 0) {
            health = 'critical';
        }
        
        return {
            status: health,
            uptime: this.metrics.system.uptime,
            memoryUsage: Math.round(memoryUsage * 100),
            errorRate: Math.round(errorRate * 100),
            lastUpdate: new Date().toISOString(),
            details: {
                totalRequests: this.metrics.api.totalRequests,
                totalErrors: this.metrics.errors.total,
                criticalErrors: this.metrics.errors.criticalErrors,
                automationScans: this.metrics.automation.totalScans
            }
        };
    }

    /**
     * 📈 MÉTRIQUES DE PERFORMANCE
     */
    recordApiCall(duration, success = true) {
        this.metrics.api.totalRequests++;
        if (success) {
            this.metrics.api.successfulRequests++;
        } else {
            this.metrics.api.failedRequests++;
        }
        
        // Calculer temps de réponse moyen
        const total = this.metrics.api.avgResponseTime * (this.metrics.api.totalRequests - 1) + duration;
        this.metrics.api.avgResponseTime = total / this.metrics.api.totalRequests;
        
        // Alerte temps de réponse
        if (duration > this.alertThresholds.responseTime) {
            this.emit('slow-response', {
                duration,
                threshold: this.alertThresholds.responseTime,
                timestamp: new Date().toISOString()
            });
        }
    }

    recordAutomationScan(duration, tweetsFound, actionsGenerated, success = true) {
        this.metrics.automation.totalScans++;
        this.metrics.automation.lastScanTime = new Date().toISOString();
        
        if (success) {
            this.metrics.automation.successfulScans++;
            this.metrics.automation.tweetsProcessed += tweetsFound;
            this.metrics.automation.actionsGenerated += actionsGenerated;
            
            // Calculer durée moyenne
            const total = this.metrics.automation.avgScanDuration * (this.metrics.automation.successfulScans - 1) + duration;
            this.metrics.automation.avgScanDuration = total / this.metrics.automation.successfulScans;
        } else {
            this.metrics.automation.failedScans++;
        }
        
        this.emit('automation-scan-completed', {
            duration,
            tweetsFound,
            actionsGenerated,
            success,
            timestamp: new Date().toISOString()
        });
    }

    updateQuotaMetrics(totalAccounts, activeAccounts, utilization, dailyRemaining, hourlyRemaining) {
        this.metrics.quotas = {
            totalAccounts,
            activeAccounts,
            quotaUtilization: utilization,
            dailyActionsRemaining: dailyRemaining,
            hourlyActionsRemaining: hourlyRemaining
        };
        
        // Alerte utilisation quota
        if (utilization > this.alertThresholds.quotaUtilization) {
            this.emit('quota-alert', {
                utilization,
                threshold: this.alertThresholds.quotaUtilization,
                dailyRemaining,
                hourlyRemaining,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * 📊 RAPPORT DE PERFORMANCE
     */
    generateReport() {
        const uptime = this.metrics.system.uptime;
        const uptimeHours = Math.floor(uptime / (1000 * 60 * 60));
        const uptimeMinutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
        
        return {
            timestamp: new Date().toISOString(),
            uptime: `${uptimeHours}h ${uptimeMinutes}m`,
            systemHealth: this.getSystemHealth(),
            performance: {
                automationScans: {
                    total: this.metrics.automation.totalScans,
                    success: this.metrics.automation.successfulScans,
                    failure: this.metrics.automation.failedScans,
                    successRate: this.metrics.automation.totalScans > 0 ? 
                        Math.round((this.metrics.automation.successfulScans / this.metrics.automation.totalScans) * 100) : 0,
                    avgDuration: Math.round(this.metrics.automation.avgScanDuration)
                },
                api: {
                    totalRequests: this.metrics.api.totalRequests,
                    successRate: this.metrics.api.totalRequests > 0 ? 
                        Math.round((this.metrics.api.successfulRequests / this.metrics.api.totalRequests) * 100) : 0,
                    avgResponseTime: Math.round(this.metrics.api.avgResponseTime),
                    rateLimitHits: this.metrics.api.rateLimitHits
                },
                errors: {
                    total: this.metrics.errors.total,
                    critical: this.metrics.errors.criticalErrors,
                    byType: this.metrics.errors.byType,
                    recent: this.metrics.errors.recent.slice(0, 10)
                }
            },
            quotas: this.metrics.quotas
        };
    }

    /**
     * 🧹 NETTOYAGE
     */
    cleanup() {
        // Arrêter tous les collecteurs
        for (const [name, interval] of this.collectors.entries()) {
            clearInterval(interval);
            console.log(`[PERFORMANCE-MONITOR] Collecteur ${name} arrêté`);
        }
        this.collectors.clear();
        
        // Nettoyer les listeners
        this.removeAllListeners();
    }
}

// Instance singleton
let monitorInstance = null;

function getPerformanceMonitor() {
    if (!monitorInstance) {
        monitorInstance = new PerformanceMonitor();
    }
    return monitorInstance;
}

module.exports = {
    PerformanceMonitor,
    getPerformanceMonitor
};
