const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

// EventEmitter pour les logs temps réel
const logEmitter = new EventEmitter();

// Cache optimisé avec métadonnées
let logsCache = {
    logs: [],
    lastFileSize: 0,
    lastModified: 0,
    totalLogs: 0
};

const LOG_FILE_PATH = path.join(__dirname, '..', 'auto-actions.log');
const MAX_CACHE_SIZE = 1000;

/**
 * Service de gestion des logs - Version optimisée
 * Responsabilités :
 * - Format JSON structuré pour nouveaux logs
 * - Lecture incrémentale optimisée
 * - Push temps réel via EventEmitter
 * - Cache intelligent avec métadonnées
 * - Rétrocompatibilité avec anciens logs
 */

/**
 * Structure d'un log JSON standardisé
 * @typedef {Object} LogEntry
 * @property {string} timestamp - ISO timestamp
 * @property {string} type - Type d'action (like, retweet, reply, system, error)
 * @property {string} level - Niveau (info, warning, error, debug)
 * @property {string} account - Compte qui effectue l'action
 * @property {string} tweetId - ID du tweet concerné
 * @property {string} targetUser - Utilisateur cible
 * @property {string} message - Message descriptif
 * @property {Object} metadata - Données supplémentaires
 */

/**
 * Écrit un log structuré dans le fichier
 * @param {string|Object} data - Message string (legacy) ou objet structuré
 * @param {string} type - Type d'action
 * @param {string} level - Niveau de log
 * @param {Object} metadata - Métadonnées supplémentaires
 */
function logToFile(data, type = 'system', level = 'info', metadata = {}) {
    const timestamp = new Date().toISOString();
    
    let logEntry;
    
    // Support legacy : si data est une string, on la convertit
    if (typeof data === 'string') {
        logEntry = {
            timestamp,
            type: extractTypeFromLegacyMessage(data) || type,
            level,
            message: data,
            metadata: { legacy: true, ...metadata }
        };
        
        // Parse les infos depuis le message legacy si possible
        const parsed = parseLegacyMessage(data);
        if (parsed) {
            Object.assign(logEntry, parsed);
        }
    } else {
        // Format structuré
        logEntry = {
            timestamp,
            type,
            level,
            ...data,
            metadata: { ...metadata, ...data.metadata }
        };
    }
    
    try {
        // Écriture en format JSON Lines (JSONL)
        const jsonLine = JSON.stringify(logEntry) + '\n';
        fs.appendFileSync(LOG_FILE_PATH, jsonLine);
        
        // Émettre l'événement pour le temps réel
        logEmitter.emit('newLog', logEntry);
        
        // Mettre à jour le cache
        addToCache(logEntry);
        
    } catch (error) {
        console.error('[LOG SERVICE] Erreur lors de l\'écriture du log:', error);
        // Fallback vers l'ancien format en cas d'erreur
        try {
            const legacyMessage = `[${timestamp}] ${typeof data === 'string' ? data : data.message || JSON.stringify(data)}\n`;
            fs.appendFileSync(LOG_FILE_PATH, legacyMessage);
        } catch (fallbackError) {
            console.error('[LOG SERVICE] Erreur fallback:', fallbackError);
        }
    }
}

/**
 * Extrait le type d'action depuis un message legacy
 * @param {string} message - Message legacy
 * @returns {string} Type détecté
 */
function extractTypeFromLegacyMessage(message) {
    if (message.includes('[LIKE]') || message.includes('like sur tweet')) return 'like';
    if (message.includes('[RETWEET]') || message.includes('retweet sur tweet')) return 'retweet';
    if (message.includes('[REPLY]') || message.includes('Reply to tweet')) return 'reply';
    if (message.includes('[SYSTEM]')) return 'system';
    if (message.includes('[ERROR]')) return 'error';
    if (message.includes('[WATCH]')) return 'watch';
    if (message.includes('[DEBUG]')) return 'debug';
    return 'system';
}

/**
 * Parse un message legacy pour extraire les informations structurées
 * @param {string} message - Message legacy
 * @returns {Object|null} Informations extraites
 */
function parseLegacyMessage(message) {
    // Pattern pour les likes
    const likeMatch = message.match(/\[([^\]]+)\] (?:like sur tweet|Like tweet) (\d+) .*?@([^)\s]+)/i);
    if (likeMatch) {
        return {
            account: likeMatch[1],
            tweetId: likeMatch[2],
            targetUser: likeMatch[3],
            type: 'like'
        };
    }
    
    // Pattern pour les retweets
    const retweetMatch = message.match(/\[([^\]]+)\] (?:retweet sur tweet|Retweet) (\d+) .*?@([^)\s]+)/i);
    if (retweetMatch) {
        return {
            account: retweetMatch[1],
            tweetId: retweetMatch[2],
            targetUser: retweetMatch[3],
            type: 'retweet'
        };
    }
    
    // Pattern pour les replies
    const replyMatch = message.match(/\[REPLY\]\[([^\]]+)\] Reply to tweet (\d+) de @([^:]+): (.+)/i);
    if (replyMatch) {
        return {
            account: replyMatch[1],
            tweetId: replyMatch[2],
            targetUser: replyMatch[3],
            type: 'reply',
            replyText: replyMatch[4]
        };
    }
    
    return null;
}

/**
 * Ajoute un log au cache
 * @param {Object} logEntry - Entrée de log
 */
function addToCache(logEntry) {
    logsCache.logs.unshift(logEntry);
    if (logsCache.logs.length > MAX_CACHE_SIZE) {
        logsCache.logs.pop();
    }
    logsCache.totalLogs++;
}

/**
 * Parse une ligne legacy en format structuré
 * @param {string} line - Ligne legacy
 * @returns {Object|null} Log structuré
 */
function parseLegacyLine(line) {
    if (!line || line.trim() === '') return null;
    
    // Extraire le timestamp
    const timeMatch = line.match(/^\[([^\]]+)\]/);
    const timestamp = timeMatch ? timeMatch[1] : new Date().toISOString();
    
    // Filtrer le bruit
    const ignoredPatterns = [
        /^\[RETWEET RARE\].*?ignoré/i,
        /^\[DEBUG\]/i,
        /^\[INFO\].*?(Checking|Vérification)/i,
        /^\[WAIT\]/i
    ];
    
    for (const pattern of ignoredPatterns) {
        if (pattern.test(line)) {
            return null;
        }
    }
    
    const type = extractTypeFromLegacyMessage(line);
    const parsed = parseLegacyMessage(line);
    
    return {
        timestamp,
        type,
        level: type === 'error' ? 'error' : 'info',
        message: line.replace(/^\[[^\]]+\]\s*/, ''),
        ...parsed,
        metadata: { legacy: true }
    };
}

/**
 * Lecture incrémentale optimisée des logs
 * @param {number} limit - Nombre maximum de logs à retourner
 * @param {number} offset - Décalage pour pagination
 * @returns {Object} Résultat avec logs et métadonnées
 */
function getLogsIncremental(limit = 50, offset = 0) {
    try {
        if (!fs.existsSync(LOG_FILE_PATH)) {
            return { logs: [], total: 0, hasMore: false, fromCache: true };
        }

        // Vérifier si le fichier a changé
        const stats = fs.statSync(LOG_FILE_PATH);
        const fileSize = stats.size;
        const lastModified = stats.mtime.getTime();
        
        // Si le fichier n'a pas changé, utiliser le cache
        if (fileSize === logsCache.lastFileSize && lastModified === logsCache.lastModified) {
            const paginatedLogs = logsCache.logs.slice(offset, offset + limit);
            return {
                logs: paginatedLogs,
                total: logsCache.totalLogs,
                hasMore: offset + limit < logsCache.logs.length,
                fromCache: true
            };
        }
        
        // Lecture complète si nécessaire
        reloadCompleteCache();
        
        // Mettre à jour les métadonnées
        logsCache.lastFileSize = fileSize;
        logsCache.lastModified = lastModified;
        
        const paginatedLogs = logsCache.logs.slice(offset, offset + limit);
        return {
            logs: paginatedLogs,
            total: logsCache.totalLogs,
            hasMore: offset + limit < logsCache.logs.length,
            fromCache: false
        };
        
    } catch (error) {
        console.error('[LOG SERVICE] Erreur lecture incrémentale:', error);
        return {
            logs: [],
            total: 0,
            hasMore: false,
            error: error.message
        };
    }
}

/**
 * Recharge complètement le cache
 */
function reloadCompleteCache() {
    try {
        if (!fs.existsSync(LOG_FILE_PATH)) {
            logsCache = { logs: [], lastFileSize: 0, lastModified: 0, totalLogs: 0 };
            return;
        }
        
        const data = fs.readFileSync(LOG_FILE_PATH, 'utf-8');
        const lines = data.trim().split('\n').filter(line => line.trim());
        
        logsCache.logs = [];
        logsCache.totalLogs = 0;
        
        for (const line of lines) {
            try {
                // Essayer de parser en JSON d'abord
                const logEntry = JSON.parse(line);
                addToCache(logEntry);
            } catch (parseError) {
                // Ligne legacy
                const legacyLog = parseLegacyLine(line);
                if (legacyLog) {
                    addToCache(legacyLog);
                }
            }
        }
        
    } catch (error) {
        console.error('[LOG SERVICE] Erreur rechargement cache:', error);
    }
}

/**
 * Extrait et filtre les logs avec pagination
 * @param {number} limit - Limite de logs
 * @param {number} offset - Décalage
 * @returns {Object} Résultat paginé
 */
function getFilteredLogsFromFile(limit = 50, offset = 0) {
    const result = getLogsIncremental(limit, offset);
    
    // Filtrer les logs de débogage si nécessaire
    const filteredLogs = result.logs.filter(log => {
        if (log.level === 'debug') return false;
        if (log.type === 'system' && log.message && log.message.includes('Checking')) return false;
        return true;
    });
    
    return {
        ...result,
        logs: filteredLogs
    };
}

/**
 * Génère le contenu complet des logs pour téléchargement
 * @returns {string} Contenu formaté des logs
 */
function generateDownloadableLogsContent() {
    try {
        const result = getLogsIncremental(1000, 0);
        const logs = result.logs;
        
        let content = `X-AutoRaider - Export des logs\n`;
        content += `Généré le: ${new Date().toLocaleString('fr-FR')}\n`;
        content += `Total des logs: ${result.total}\n`;
        content += `Logs exportés: ${logs.length}\n`;
        content += `${'='.repeat(50)}\n\n`;
        
        for (const log of logs) {
            const timestamp = new Date(log.timestamp).toLocaleString('fr-FR');
            const typeUpper = log.type.toUpperCase();
            const level = log.level ? `[${log.level.toUpperCase()}]` : '';
            
            content += `[${timestamp}] ${level}[${typeUpper}]`;
            
            if (log.account && log.account !== 'Compte automatique') {
                content += `[${log.account}]`;
            }
            
            content += ` ${log.message}`;
            
            if (log.tweetId) {
                content += ` (Tweet: ${log.tweetId})`;
            }
            
            if (log.targetUser) {
                content += ` (@${log.targetUser})`;
            }
            
            content += '\n';
        }
        
        return content;
        
    } catch (error) {
        console.error('[LOG SERVICE] Erreur génération contenu téléchargement:', error);
        return `Erreur lors de la génération du fichier de logs: ${error.message}`;
    }
}

/**
 * Initialise le service de logs
 */
function initializeLogService() {
    try {
        // Créer le fichier de logs s'il n'existe pas
        if (!fs.existsSync(LOG_FILE_PATH)) {
            fs.writeFileSync(LOG_FILE_PATH, '');
        }
        
        // Charger le cache initial
        reloadCompleteCache();
        
        console.log('[LOG SERVICE] Service initialisé avec succès');
        console.log(`[LOG SERVICE] Cache: ${logsCache.logs.length} logs, Total: ${logsCache.totalLogs}`);
        
    } catch (error) {
        console.error('[LOG SERVICE] Erreur initialisation:', error);
    }
}

// Initialiser le service au chargement
initializeLogService();

module.exports = {
    logToFile,
    getFilteredLogsFromFile,
    generateDownloadableLogsContent,
    getLogsIncremental,
    logEmitter,
    // Fonctions utilitaires
    extractTypeFromLegacyMessage,
    parseLegacyMessage,
    parseLegacyLine,
    // Gestion du cache
    reloadCompleteCache,
    addToCache
};
