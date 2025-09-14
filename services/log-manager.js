/**
 * Gestionnaire de logs optimisé pour réduire la verbosité
 * Basé sur les configurations .env pour contrôler le niveau de détail
 */

const fs = require('fs');
const path = require('path');

// Configuration par défaut
const LOG_CONFIG = {
    level: process.env.LOG_LEVEL || 'INFO',
    filterDetails: process.env.LOG_FILTER_DETAILS === 'true',
    batchSummary: process.env.LOG_BATCH_SUMMARY !== 'false',
    format: process.env.LOG_FORMAT || 'unified'
};

// Niveaux de log (ordre croissant de verbosité)
const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
};

// Compteurs pour les résumés
let filterCounters = {
    total: 0,
    replies: 0,
    retweets: 0,
    quotes: 0,
    other: 0
};

let batchCounters = {
    current: 0,
    total: 0,
    tweetsFound: 0
};

/**
 * Vérifie si un niveau de log doit être affiché
 */
function shouldLog(level) {
    const currentLevel = LOG_LEVELS[LOG_CONFIG.level] || LOG_LEVELS.INFO;
    const messageLevel = LOG_LEVELS[level] || LOG_LEVELS.INFO;
    return messageLevel <= currentLevel;
}

/**
 * Formate un message de log de manière unifiée
 */
function formatLogMessage(level, category, message, data = null) {
    const timestamp = new Date().toISOString();
    
    if (LOG_CONFIG.format === 'unified') {
        let formattedMsg = `[${timestamp}] [${level}] [${category}] ${message}`;
        if (data && LOG_CONFIG.level === 'DEBUG') {
            formattedMsg += ` ${JSON.stringify(data)}`;
        }
        return formattedMsg;
    }
    
    // Format JSON structuré
    return JSON.stringify({
        timestamp,
        level: level.toLowerCase(),
        category,
        message,
        data: LOG_CONFIG.level === 'DEBUG' ? data : undefined
    });
}

/**
 * Log principal avec gestion des niveaux
 */
function log(level, category, message, data = null) {
    if (!shouldLog(level)) return;
    
    const formattedMessage = formatLogMessage(level, category, message, data);
    console.log(formattedMessage);
    
    // Écriture dans le fichier si nécessaire
    try {
        const logFile = path.join(__dirname, '..', 'auto-actions.log');
        fs.appendFileSync(logFile, formattedMessage + '\n');
    } catch (err) {
        console.error('Erreur écriture log:', err.message);
    }
}

/**
 * Gestion optimisée des logs de filtrage
 */
function logFilter(tweetId, reason, details = null) {
    filterCounters.total++;
    
    // Comptage par type de filtre
    if (reason.includes('replied_to')) filterCounters.replies++;
    else if (reason.includes('retweeted')) filterCounters.retweets++;
    else if (reason.includes('quoted')) filterCounters.quotes++;
    else filterCounters.other++;
    
    // Log détaillé seulement si activé
    if (LOG_CONFIG.filterDetails && shouldLog('DEBUG')) {
        log('DEBUG', 'FILTER', `Tweet ${tweetId} - ${reason}`, details);
    }
}

/**
 * Résumé des filtres à la fin du scan
 */
function logFilterSummary(validTweets) {
    if (filterCounters.total > 0) {
        const summary = `${filterCounters.total} tweets filtrés → ${validTweets} valides (${filterCounters.replies} replies, ${filterCounters.retweets} retweets, ${filterCounters.quotes} quotes, ${filterCounters.other} autres)`;
        log('INFO', 'SCAN', summary);
    }
    
    // Reset des compteurs
    filterCounters = { total: 0, replies: 0, retweets: 0, quotes: 0, other: 0 };
}

/**
 * Gestion optimisée des logs de batch
 */
function logBatch(batchNumber, tweetsInBatch, totalBatches = null) {
    batchCounters.current = batchNumber;
    batchCounters.tweetsFound += tweetsInBatch;
    
    if (totalBatches) batchCounters.total = totalBatches;
    
    // Log détaillé seulement en DEBUG
    if (shouldLog('DEBUG')) {
        log('DEBUG', 'BATCH', `Batch ${batchNumber}: ${tweetsInBatch} tweets`);
    }
}

/**
 * Résumé des batches à la fin du scan
 */
function logBatchSummary() {
    if (LOG_CONFIG.batchSummary && batchCounters.tweetsFound > 0) {
        log('INFO', 'SCAN', `${batchCounters.current} batches traités → ${batchCounters.tweetsFound} tweets trouvés`);
    }
    
    // Reset des compteurs
    batchCounters = { current: 0, total: 0, tweetsFound: 0 };
}

/**
 * Logs d'actions avec niveau approprié
 */
function logAction(level, account, action, tweetId, result = null) {
    const message = `${account} → ${action} sur tweet ${tweetId}`;
    log(level, 'ACTION', message, result);
}

/**
 * Logs d'erreurs avec contexte
 */
function logError(category, message, error = null, context = null) {
    const errorData = {
        error: error ? error.message : null,
        stack: error && LOG_CONFIG.level === 'DEBUG' ? error.stack : null,
        context
    };
    log('ERROR', category, message, errorData);
}

/**
 * Logs de rate limiting
 */
function logRateLimit(account, action, retryAfter = null) {
    const message = `Rate limit atteint pour ${account} (${action})`;
    const data = retryAfter ? { retryAfter } : null;
    log('WARN', 'RATE_LIMIT', message, data);
}

/**
 * Logs de démarrage/arrêt système
 */
function logSystem(message, data = null) {
    log('INFO', 'SYSTEM', message, data);
}

module.exports = {
    log,
    logFilter,
    logFilterSummary,
    logBatch,
    logBatchSummary,
    logAction,
    logError,
    logRateLimit,
    logSystem,
    LOG_CONFIG,
    shouldLog
};
