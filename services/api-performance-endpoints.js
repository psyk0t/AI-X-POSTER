const { getUnifiedLogger } = require('./unified-logger');
const { getPerformanceMonitor } = require('./performance-monitor');
const { getErrorHandler } = require('./error-handler');

/**
 * 📊 ENDPOINTS API POUR LE MONITORING DE PERFORMANCE
 * Expose les métriques et statistiques via des API REST
 */

/**
 * 📈 API - Métriques système en temps réel
 */
async function getSystemMetrics(req, res) {
    try {
        const monitor = getPerformanceMonitor();
        const metrics = monitor.getMetrics();
        
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            data: {
                system: metrics.system,
                uptime: Math.floor(metrics.system.uptime / 1000), // en secondes
                memory: {
                    used: Math.round(metrics.system.memoryUsage.heapUsed / 1024 / 1024), // MB
                    total: Math.round(metrics.system.memoryUsage.heapTotal / 1024 / 1024), // MB
                    usage: Math.round((metrics.system.memoryUsage.heapUsed / metrics.system.memoryUsage.heapTotal) * 100) // %
                }
            }
        });
    } catch (error) {
        const errorHandler = getErrorHandler();
        await errorHandler.handleError(error, { endpoint: 'system-metrics' });
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * 🤖 API - Métriques d'automation
 */
async function getAutomationMetrics(req, res) {
    try {
        const monitor = getPerformanceMonitor();
        const metrics = monitor.getMetrics('automation');
        
        const successRate = metrics.totalScans > 0 ? 
            Math.round((metrics.successfulScans / metrics.totalScans) * 100) : 0;
        
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            data: {
                totalScans: metrics.totalScans,
                successfulScans: metrics.successfulScans,
                failedScans: metrics.failedScans,
                successRate: successRate,
                avgScanDuration: Math.round(metrics.avgScanDuration),
                lastScanTime: metrics.lastScanTime,
                tweetsProcessed: metrics.tweetsProcessed,
                actionsGenerated: metrics.actionsGenerated,
                efficiency: metrics.tweetsProcessed > 0 ? 
                    Math.round((metrics.actionsGenerated / metrics.tweetsProcessed) * 100) : 0
            }
        });
    } catch (error) {
        const errorHandler = getErrorHandler();
        await errorHandler.handleError(error, { endpoint: 'automation-metrics' });
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * 🌐 API - Métriques API et réseau
 */
async function getApiMetrics(req, res) {
    try {
        const monitor = getPerformanceMonitor();
        const metrics = monitor.getMetrics('api');
        
        const successRate = metrics.totalRequests > 0 ? 
            Math.round((metrics.successfulRequests / metrics.totalRequests) * 100) : 0;
        
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            data: {
                totalRequests: metrics.totalRequests,
                successfulRequests: metrics.successfulRequests,
                failedRequests: metrics.failedRequests,
                successRate: successRate,
                avgResponseTime: Math.round(metrics.avgResponseTime),
                rateLimitHits: metrics.rateLimitHits,
                quotaExceeded: metrics.quotaExceeded
            }
        });
    } catch (error) {
        const errorHandler = getErrorHandler();
        await errorHandler.handleError(error, { endpoint: 'api-metrics' });
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * 🚨 API - Métriques d'erreurs
 */
async function getErrorMetrics(req, res) {
    try {
        const monitor = getPerformanceMonitor();
        const errorMetrics = monitor.getMetrics('errors');
        const errorHandler = getErrorHandler();
        const errorStats = errorHandler.getErrorStats();
        
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            data: {
                total: errorMetrics.total,
                critical: errorMetrics.criticalErrors,
                byType: errorMetrics.byType,
                recent: errorMetrics.recent.slice(0, 10),
                circuitBreakers: errorStats.circuitBreakers,
                recovery: errorStats.recovery
            }
        });
    } catch (error) {
        const errorHandler = getErrorHandler();
        await errorHandler.handleError(error, { endpoint: 'error-metrics' });
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * 💊 API - État de santé global du système
 */
async function getSystemHealth(req, res) {
    try {
        const monitor = getPerformanceMonitor();
        const health = monitor.getSystemHealth();
        
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            data: health
        });
    } catch (error) {
        const errorHandler = getErrorHandler();
        await errorHandler.handleError(error, { endpoint: 'system-health' });
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * 📋 API - Rapport de performance complet
 */
async function getPerformanceReport(req, res) {
    try {
        const monitor = getPerformanceMonitor();
        const report = monitor.generateReport();
        
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            data: report
        });
    } catch (error) {
        const errorHandler = getErrorHandler();
        await errorHandler.handleError(error, { endpoint: 'performance-report' });
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * 📝 API - Logs en temps réel avec filtres
 */
async function getLogs(req, res) {
    try {
        const logger = getUnifiedLogger();
        const { limit = 100, offset = 0, level, since, search } = req.query;
        
        const filters = {};
        if (level) filters.level = level;
        if (since) filters.since = since;
        if (search) filters.search = search;
        
        const logs = await logger.getLogs(parseInt(limit), parseInt(offset), filters);
        
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            ...logs
        });
    } catch (error) {
        const errorHandler = getErrorHandler();
        await errorHandler.handleError(error, { endpoint: 'logs' });
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * 📊 API - Statistiques des logs
 */
async function getLogStats(req, res) {
    try {
        const logger = getUnifiedLogger();
        const stats = logger.getStats();
        
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            data: stats
        });
    } catch (error) {
        const errorHandler = getErrorHandler();
        await errorHandler.handleError(error, { endpoint: 'log-stats' });
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * 📥 API - Export des logs
 */
async function exportLogs(req, res) {
    try {
        const logger = getUnifiedLogger();
        const format = req.query.format || 'txt';
        
        const content = await logger.generateExport(format);
        const filename = `autoraider-logs-${new Date().toISOString().split('T')[0]}.${format}`;
        
        res.setHeader('Content-Type', format === 'json' ? 'application/json' : 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(content);
    } catch (error) {
        const errorHandler = getErrorHandler();
        await errorHandler.handleError(error, { endpoint: 'export-logs' });
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * 🧹 API - Nettoyage des logs
 */
async function cleanupLogs(req, res) {
    try {
        const logger = getUnifiedLogger();
        const daysToKeep = parseInt(req.body.daysToKeep) || 30;
        
        await logger.cleanup(daysToKeep);
        
        res.json({
            success: true,
            message: `Logs nettoyés (gardés: ${daysToKeep} jours)`,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        const errorHandler = getErrorHandler();
        await errorHandler.handleError(error, { endpoint: 'cleanup-logs' });
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * 🔄 API - Enregistrement manuel de métriques
 */
async function recordMetric(req, res) {
    try {
        const monitor = getPerformanceMonitor();
        const { type, data } = req.body;
        
        switch (type) {
            case 'api_call':
                monitor.recordApiCall(data.duration, data.success);
                break;
            case 'automation_scan':
                monitor.recordAutomationScan(
                    data.duration, 
                    data.tweetsFound, 
                    data.actionsGenerated, 
                    data.success
                );
                break;
            case 'quota_update':
                monitor.updateQuotaMetrics(
                    data.totalAccounts,
                    data.activeAccounts,
                    data.utilization,
                    data.dailyRemaining,
                    data.hourlyRemaining
                );
                break;
            default:
                throw new Error(`Type de métrique non supporté: ${type}`);
        }
        
        res.json({
            success: true,
            message: `Métrique ${type} enregistrée`,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        const errorHandler = getErrorHandler();
        await errorHandler.handleError(error, { endpoint: 'record-metric' });
        res.status(500).json({ success: false, error: error.message });
    }
}

module.exports = {
    getSystemMetrics,
    getAutomationMetrics,
    getApiMetrics,
    getErrorMetrics,
    getSystemHealth,
    getPerformanceReport,
    getLogs,
    getLogStats,
    exportLogs,
    cleanupLogs,
    recordMetric
};
