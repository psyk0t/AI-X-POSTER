const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

// EventEmitter for real-time logs
const logEmitter = new EventEmitter();

// Optimized cache with metadata
let logsCache = {
    logs: [],
    lastFileSize: 0,
    lastModified: 0,
    totalLogs: 0
};

const LOG_FILE_PATH = path.join(__dirname, '..', 'auto-actions.log');
const LEGACY_LOG_FILE_PATH = path.join(__dirname, '..', 'auto-actions-legacy.log');
const MAX_CACHE_SIZE = 1000;

/**
 * Log management service - Optimized version
 * Responsibilities:
 * - Structured JSON format for new logs
 * - Optimized incremental reading
 * - Real-time push via EventEmitter
 * - Smart cache with metadata
 * - Backward compatibility with old logs
 */

/**
 * Standardized JSON log structure
 * @typedef {Object} LogEntry
 * @property {string} timestamp - ISO timestamp
 * @property {string} type - Action type (like, retweet, reply, system, error)
 * @property {string} level - Level (info, warning, error, debug)
 * @property {string} account - Account performing the action
 * @property {string} tweetId - ID of the concerned tweet
 * @property {string} targetUser - Target user
 * @property {string} message - Descriptive message
 * @property {Object} metadata - Additional data
 */

/**
 * Writes a structured log to the file
 * @param {string|Object} data - String message (legacy) or structured object
 * @param {string} type - Action type
 * @param {string} level - Log level
 * @param {Object} metadata - Additional metadata
 */
function logToFile(data, type = 'system', level = 'info', metadata = {}) {
    const timestamp = new Date().toISOString();
    
    let logEntry;
    
    // Legacy support: if data is a string, convert it
    if (typeof data === 'string') {
        logEntry = {
            timestamp,
            type: extractTypeFromLegacyMessage(data) || type,
            level,
            message: data,
            metadata
        };
        
        // Parse info from legacy message if possible
        const parsed = parseLegacyMessage(data);
        if (parsed) {
            Object.assign(logEntry, parsed);
        }
    } else {
        // Structured format
        logEntry = {
            timestamp,
            type,
            level,
            ...data,
            metadata: { ...metadata, ...data.metadata }
        };
    }
    
    try {
        // Write in JSON Lines (JSONL) format
        const jsonLine = JSON.stringify(logEntry) + '\n';
        fs.appendFileSync(LOG_FILE_PATH, jsonLine);
        
        // Emit event for real-time
        logEmitter.emit('newLog', logEntry);
        
        // Update cache
        addToCache(logEntry);
        
    } catch (error) {
        console.error('[LOG SERVICE] Error writing log:', error);
        // Fallback to old format in case of error
        try {
            const legacyMessage = `[${timestamp}] ${typeof data === 'string' ? data : data.message || JSON.stringify(data)}\n`;
            fs.appendFileSync(LEGACY_LOG_FILE_PATH, legacyMessage);
        } catch (fallbackError) {
            console.error('[LOG SERVICE] Fallback error:', fallbackError);
        }
    }
}

/**
 * Extracts action type from a legacy message
 * @param {string} message - Legacy message
 * @returns {string} Detected type
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
 * Parses a legacy message to extract structured information
 * @param {string} message - Legacy message
 * @returns {Object|null} Extracted information
 */
function parseLegacyMessage(message) {
    // Pattern for likes
    const likeMatch = message.match(/\[([^\]]+)\] (?:like sur tweet|Like tweet) (\d+) .*?@([^)\s]+)/i);
    if (likeMatch) {
        return {
            account: likeMatch[1],
            tweetId: likeMatch[2],
            targetUser: likeMatch[3],
            type: 'like'
        };
    }
    
    // Pattern for retweets
    const retweetMatch = message.match(/\[([^\]]+)\] (?:retweet sur tweet|Retweet) (\d+) .*?@([^)\s]+)/i);
    if (retweetMatch) {
        return {
            account: retweetMatch[1],
            tweetId: retweetMatch[2],
            targetUser: retweetMatch[3],
            type: 'retweet'
        };
    }
    
    // Pattern for replies
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
 * Adds a log to cache
 * @param {Object} logEntry - Log entry
 */
function addToCache(logEntry) {
    logsCache.logs.unshift(logEntry);
    if (logsCache.logs.length > MAX_CACHE_SIZE) {
        logsCache.logs.pop();
    }
    logsCache.totalLogs++;
}

/**
 * Optimized incremental log reading
 * @param {number} limit - Maximum number of logs to return
 * @param {number} offset - Offset for pagination
 * @returns {Object} Result with logs and metadata
 */
function getLogsIncremental(limit = 50, offset = 0) {
    try {
        // Check if file has changed
        const stats = fs.statSync(LOG_FILE_PATH);
        const fileSize = stats.size;
        const lastModified = stats.mtime.getTime();
        
        // If file hasn't changed, use cache
        if (fileSize === logsCache.lastFileSize && lastModified === logsCache.lastModified) {
            const paginatedLogs = logsCache.logs.slice(offset, offset + limit);
            return {
                logs: paginatedLogs,
                total: logsCache.totalLogs,
                hasMore: offset + limit < logsCache.logs.length,
                fromCache: true
            };
        }
        
        // Incremental reading if file has grown
        if (fileSize > logsCache.lastFileSize && logsCache.lastFileSize > 0) {
            const newData = fs.readFileSync(LOG_FILE_PATH, {
                encoding: 'utf-8',
                start: logsCache.lastFileSize
            });
            
            const newLines = newData.trim().split('\n').filter(line => line.trim());
            const newLogs = [];
            
            for (const line of newLines) {
                try {
                    const logEntry = JSON.parse(line);
                    newLogs.push(logEntry);
                    addToCache(logEntry);
                } catch (parseError) {
                    // Legacy line, parse it
                    const legacyLog = parseLegacyLine(line);
                    if (legacyLog) {
                        newLogs.push(legacyLog);
                        addToCache(legacyLog);
                    }
                }
            }
        } else {
            // Complete reading (first time or file reduced)
            reloadCompleteCache();
        }
        
        // Update metadata
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
        console.error('[LOG SERVICE] Incremental reading error:', error);
        return {
            logs: [],
            total: 0,
            hasMore: false,
            error: error.message
        };
    }
}

/**
 * Completely reloads the cache
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
                const logEntry = JSON.parse(line);
                addToCache(logEntry);
            } catch (parseError) {
                // Legacy line
                const legacyLog = parseLegacyLine(line);
                if (legacyLog) {
                    addToCache(legacyLog);
                }
            }
        }
        
    } catch (error) {
        console.error('[LOG SERVICE] Cache reload error:', error);
    }
}

/**
 * Parses a legacy line into structured format
 * @param {string} line - Legacy line
 * @returns {Object|null} Structured log
 */
function parseLegacyLine(line) {
    if (!line || line.trim() === '') return null;
    
    // Extraire le timestamp
    const timeMatch = line.match(/^\[([^\]]+)\]/);
    const timestamp = timeMatch ? timeMatch[1] : new Date().toISOString();
    
    // Filter noise
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
 * Extracts and filters logs with pagination
 * @param {number} limit - Log limit
 * @param {number} offset - Offset
 * @returns {Object} Paginated result
 */
function getFilteredLogsFromFile(limit = 50, offset = 0) {
    const result = getLogsIncremental(limit, offset);
    
    // Filter debug logs if necessary
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
 * Legacy version for compatibility
 * @returns {Array} List of filtered logs
 */
function getFilteredLogsFromFileLegacy() {
    try {
        if (!fs.existsSync(LOG_FILE_PATH)) return [];
        
        const data = fs.readFileSync(LOG_FILE_PATH, 'utf-8');
        const lines = data.trim().split('\n');
        
        // Read more lines to have enough important events after filtering
        const recentLines = lines.slice(-200); // Last 200 lines for filtering
        
        const filteredLogs = [];
        
        for (const line of recentLines) {
            try {
                const parsedLog = parseLegacyLine(line);
                if (parsedLog) {
                    filteredLogs.push(parsedLog);
                }
            } catch (error) {
                console.error('[LOG SERVICE] Legacy line parsing error:', error);
            }
        }
        
        return filteredLogs;
        
    } catch (error) {
        console.error('[LOG SERVICE] Legacy file reading error:', error);
        return [];
    }
}

/**
 * Génère le contenu complet des logs pour téléchargement
 * @returns {string} Contenu formaté des logs
 */
function generateDownloadableLogsContent() {
    try {
        const result = getLogsIncremental(1000, 0); // Récupérer plus de logs pour le téléchargement
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
    getFilteredLogsFromFileLegacy,
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

/**
 * Parse une ligne de log et extrait UNIQUEMENT les informations importantes pour l'utilisateur
 * @param {string} line - Ligne de log brute
 * @returns {Object|null} Objet log formaté ou null si ignoré
 */
function parseLogLine(line) {
    let extractedTime = null;
    if (!line || line.trim() === '') return null;
    
    // Extraire le timestamp si présent
    const timeMatch = line.match(/^\[([^\]]+)\]/);
    if (timeMatch) {
        try {
            extractedTime = new Date(timeMatch[1]).toLocaleString('fr-FR');
        } catch (e) {
            extractedTime = timeMatch[1]; // Garder le format original si parsing échoue
        }
    }
    
    // Patterns à IGNORER (trop de bruit)
    const ignoredPatterns = [
        /^\[RETWEET RARE\].*?ignoré/i,
        /^\[DEBUG\]/i, // Ignore tous les messages de débogage
        /^\[INFO\].*?(Checking|Vérification)/i, // Ignore les vérifications de statut
        /^\[WAIT\]/i // Ignore les messages d'attente génériques
    ];

    // Vérifier si la ligne doit être ignorée
    for (const pattern of ignoredPatterns) {
        if (pattern.test(line)) {
            return null; // Ignorer cette ligne
        }
    }

    // Pattern pour les likes classiques (nouveau format sans balise explicite)
    const likeClassicMatch = line.match(/\[([^\]]+)\] like sur tweet (\d+) \(@([^)]+)\)/i);
    if (likeClassicMatch) {
        return {
            timestamp: extractedTime,
            type: 'like',
            account: likeClassicMatch[1],
            tweetId: likeClassicMatch[2],
            targetUser: likeClassicMatch[3],
            text: `Like sur le tweet de @${likeClassicMatch[3]}`,
            status: 'success'
        };
    }
    // Pattern pour les likes (ancien format)
    const likeMatch = line.match(/\[([^\]]+)\] Like tweet (\d+) de @([^)]+)/i);
    if (likeMatch) {
        return {
            timestamp: extractedTime,
            type: 'like',
            account: likeMatch[1],
            tweetId: likeMatch[2],
            targetUser: likeMatch[3],
            text: `Like sur le tweet de @${likeMatch[3]}`,
            status: 'success'
        };
    }
    // Pattern pour les retweets classiques
    const retweetClassicMatch = line.match(/\[([^\]]+)\] retweet sur tweet (\d+) \(@([^)]+)\)/i);
    if (retweetClassicMatch) {
        return {
            timestamp: extractedTime,
            type: 'retweet',
            account: retweetClassicMatch[1],
            tweetId: retweetClassicMatch[2],
            targetUser: retweetClassicMatch[3],
            text: `Retweet du tweet de @${retweetClassicMatch[3]}`,
            status: 'success'
        };
    }
    // Pattern pour les retweets (ancien format)
    const retweetMatch = line.match(/\[([^\]]+)\] RT tweet (\d+) de @([^)]+)/i);
    if (retweetMatch) {
        return {
            timestamp: extractedTime,
            type: 'retweet',
            account: retweetMatch[1],
            tweetId: retweetMatch[2],
            targetUser: retweetMatch[3],
            text: `Retweet du tweet de @${retweetMatch[3]}`,
            status: 'success'
        };
    }
    // Pattern pour les replies classiques (nouveau format sans balise explicite)
    const replyClassicMatch = line.match(/\[([^\]]+)\] reply sur tweet (\d+) \(@([^)]+)\)/i);
    if (replyClassicMatch) {
        return {
            timestamp: extractedTime,
            type: 'reply',
            account: replyClassicMatch[1],
            tweetId: replyClassicMatch[2],
            targetUser: replyClassicMatch[3],
            text: `Reply sur le tweet de @${replyClassicMatch[3]}`,
            status: 'success'
        };
    }
    // Pattern pour les replies/commentaires (ancien format complet)
    const replyMatch = line.match(/\[REPLY\]\[([^\]]+)\] Reply to tweet (\d+) de @([^:]+): (.+)/i);
    if (replyMatch) {
        return {
            timestamp: extractedTime,
            type: 'reply',
            account: replyMatch[1],
            tweetId: replyMatch[2],
            targetUser: replyMatch[3],
            text: `Commentaire sur le tweet de @${replyMatch[3]}: "${replyMatch[4].substring(0, 50)}..."`,
            status: 'success'
        };
    }
    // Pattern pour les logs IA
    const iaMatch = line.match(/\[IA\]\[([^\]]+)\] (.+)/i);
    if (iaMatch) {
        return {
            timestamp: extractedTime,
            type: 'ai',
            account: iaMatch[1],
            text: iaMatch[2],
            status: 'info'
        };
    }
    // Pattern pour les logs TWEET TROUVÉ
    const tweetFoundMatch = line.match(/\[TWEET TROUVÉ\]\[@([^\]]+)\] ID: (\d+) - (.+)/i);
    if (tweetFoundMatch) {
        return {
            timestamp: extractedTime,
            type: 'found',
            account: tweetFoundMatch[1],
            tweetId: tweetFoundMatch[2],
            text: tweetFoundMatch[3],
            status: 'info'
        };
    }
    // Pattern pour les logs de sourdine
    const muteMatch = line.match(/Le compte ([^ ]+) est en "sourdine"/i);
    if (muteMatch) {
        return {
            timestamp: extractedTime,
            type: 'mute',
            account: muteMatch[1],
            text: `Compte @${muteMatch[1]} en sourdine pour éviter le shadowban`,
            status: 'warning'
        };
    }
    // Pattern pour les logs d'action ignorée pour cause de sourdine
    const muteActionMatch = line.match(/\[SOURDINE\]\[([^\]]+)\] Compte en pause jusqu'à ([^,]+), action ignorée\./i);
    if (muteActionMatch) {
        return {
            timestamp: extractedTime,
            type: 'mute',
            account: muteActionMatch[1],
            text: `Compte @${muteActionMatch[1]} en pause jusqu'à ${muteActionMatch[2]}`,
            status: 'warning'
        };
    }

    // Pattern pour les erreurs
    const errorMatch = line.match(/\[ERREUR\](?:\[([^\]]+)\])?\s*(.+)/i);
    if (errorMatch) {
        return {
            timestamp: extractedTime,
            type: 'error',
            account: errorMatch[1] || 'Système',
            text: errorMatch[2],
            status: 'error'
        };
    }

    // Pattern pour les démarrages/arrêts d'automatisation
    const automationMatch = line.match(/\[AUTO\].*?(Démarrage|Arrêt|démarrage|arrêt|activé|désactivé)/i);
    if (automationMatch) {
        return {
            timestamp: extractedTime,
            type: 'automation',
            text: line.substring(line.indexOf(']') + 1).trim(),
            status: 'info'
        };
    }

    // Pattern pour les quotas
    const quotaMatch = line.match(/\[QUOTA\]/i);
    if (quotaMatch) {
        return {
            timestamp: extractedTime,
            type: 'quota',
            text: line.substring(line.indexOf(']') + 1).trim(),
            status: 'warning'
        };
    }

    // Pattern pour le nombre de tweets trouvés
    const tweetsFoundMatch = line.match(/(\d+) nouveaux? tweets? trouvés?/i);
    if (tweetsFoundMatch) {
        return {
            timestamp: extractedTime,
            type: 'scan',
            text: `${tweetsFoundMatch[1]} nouveaux tweets détectés`,
            status: 'info'
        };
    }

    // Pattern pour le nombre d'actions générées
    const actionsGeneratedMatch = line.match(/(\d+) actions? générées?/i);
    if (actionsGeneratedMatch) {
        return {
            timestamp: extractedTime,
            type: 'scan',
            text: `${actionsGeneratedMatch[1]} actions planifiées`,
            status: 'info'
        };
    }
    
    // Ignorer tout le reste (pas d'entrée générique)
    return null;
}

/**
 * Génère le contenu complet des logs pour téléchargement
 * @returns {string} Contenu formaté des logs
 */
function generateDownloadableLogsContent() {
    const logs = getFilteredLogsFromFile();
    const header = `=== X-AutoRaider - Journal des Actions ===
Généré le: ${new Date().toLocaleString('fr-FR')}
Nombre d'entrées: ${logs.length}
=====================================

`;
    
    const content = logs.map(log => {
        const timestamp = log.timestamp || 'N/A';
        const type = log.type ? log.type.toUpperCase() : 'SYSTEM';
        const account = log.account ? `[${log.account}]` : '';
        return `[${timestamp}] ${type} ${account} ${log.text}`;
    }).join('\n');
    
    return header + content;
}

module.exports = {
    logToFile,
    getFilteredLogsFromFile,
    parseLogLine,
    generateDownloadableLogsContent
};
