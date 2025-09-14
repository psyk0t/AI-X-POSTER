const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');
const { getLogRotator } = require('./log-rotator');

/**
 * 🚀 SERVICE UNIFIÉ DE GESTION DES LOGS
 * Remplace logs.js et logs-optimized.js pour une approche centralisée
 */
class UnifiedLogger extends EventEmitter {
    constructor() {
        super();
        this.logFile = path.join(process.cwd(), 'auto-actions.log');
        this.cache = {
            logs: [],
            totalLogs: 0,
            lastUpdate: null
        };
        this.bufferSize = 100;
        this.flushInterval = 5000; // 5 secondes
        this.buffer = [];
        this.initialized = false;
        
        // Patterns d'optimisation avancés
        this.ignoredPatterns = [
            /^\[DEBUG\]/i,
            /^\[WAIT\]/i,
            /heartbeat/i,
            /checking/i,
            /vérification/i,
            /still active/i,
            /scan in progress/i
        ];
        
        // Filtrage intelligent pour messages répétitifs
        this.messageCache = new Map(); // Cache pour détecter les doublons
        this.maxDuplicates = 3; // Max 3 messages identiques consécutifs
        this.isProduction = process.env.NODE_ENV === 'production';
        
        this.init();
    }

    async init() {
        try {
            await this.ensureLogFile();
            await this.loadCache();
            this.startFlushTimer();
            
            // Initialiser le rotateur de logs avec rotation agressive
            this.logRotator = getLogRotator({
                maxSize: 10 * 1024 * 1024, // 10MB max (réduit de 50MB)
                maxFiles: 8, // Plus d'archives pour compenser la taille réduite
                checkInterval: 60000, // 1 minute (réduit de 5 minutes)
                logFile: this.logFile,
                compress: true // Activer la compression
            });
            await this.logRotator.init();
            
            this.initialized = true;
            console.log('[UNIFIED-LOGGER] Service initialisé avec rotation automatique');
        } catch (error) {
            console.error('[UNIFIED-LOGGER] Erreur initialisation:', error);
        }
    }

    async ensureLogFile() {
        try {
            await fs.access(this.logFile);
        } catch {
            await fs.writeFile(this.logFile, '');
        }
    }

    /**
     * 📝 LOG PRINCIPAL - Interface unifiée
     */
    async log(level, message, metadata = {}) {
        // Filtrage intelligent des messages
        if (!this.shouldLog(level, message)) {
            return null;
        }

        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            message,
            metadata,
            raw: `[${timestamp}] [${level.toUpperCase()}] ${message}`
        };

        // Ajouter au buffer
        this.buffer.push(logEntry);
        
        // Ajouter au cache immédiatement pour les requêtes en temps réel
        this.cache.logs.unshift(logEntry);
        if (this.cache.logs.length > 1000) {
            this.cache.logs = this.cache.logs.slice(0, 1000);
        }
        this.cache.totalLogs++;
        this.cache.lastUpdate = timestamp;

        // Émettre l'événement pour les listeners
        this.emit('log', logEntry);

        // Flush si buffer plein
        if (this.buffer.length >= this.bufferSize) {
            await this.flush();
        }

        return logEntry;
    }

    /**
     * 🧠 FILTRAGE INTELLIGENT DES LOGS
     */
    shouldLog(level, message) {
        // En production, filtrer les DEBUG
        if (this.isProduction && level.toUpperCase() === 'DEBUG') {
            return false;
        }

        // Vérifier les patterns ignorés
        for (const pattern of this.ignoredPatterns) {
            if (pattern.test(message)) {
                return false;
            }
        }

        // Détecter les messages répétitifs
        const messageKey = `${level}:${message}`;
        const now = Date.now();
        
        if (this.messageCache.has(messageKey)) {
            const cached = this.messageCache.get(messageKey);
            
            // Si même message dans les 30 dernières secondes
            if (now - cached.lastSeen < 30000) {
                cached.count++;
                cached.lastSeen = now;
                
                // Bloquer après maxDuplicates
                if (cached.count > this.maxDuplicates) {
                    return false;
                }
            } else {
                // Reset du compteur après 30s
                cached.count = 1;
                cached.lastSeen = now;
            }
        } else {
            this.messageCache.set(messageKey, {
                count: 1,
                lastSeen: now
            });
        }

        // Nettoyer le cache périodiquement (garder seulement les 100 derniers)
        if (this.messageCache.size > 100) {
            const entries = Array.from(this.messageCache.entries());
            entries.sort((a, b) => b[1].lastSeen - a[1].lastSeen);
            this.messageCache.clear();
            entries.slice(0, 50).forEach(([key, value]) => {
                this.messageCache.set(key, value);
            });
        }

        return true;
    }

    /**
     * 🔄 MÉTHODES DE COMPATIBILITÉ
     */
    async logToFile(message) {
        return this.log('INFO', message);
    }

    async logError(message, error = null) {
        const metadata = error ? { error: error.message, stack: error.stack } : {};
        return this.log('ERROR', message, metadata);
    }

    async logWarning(message) {
        return this.log('WARN', message);
    }

    async logSuccess(message) {
        return this.log('SUCCESS', message);
    }

    /**
     * 💾 GESTION DU CACHE ET PERSISTANCE
     */
    async loadCache() {
        try {
            const data = await fs.readFile(this.logFile, 'utf8');
            const lines = data.trim().split('\n').filter(line => line.trim());
            
            this.cache.logs = [];
            this.cache.totalLogs = lines.length;
            
            // Charger les 500 dernières lignes dans le cache
            const recentLines = lines.slice(-500);
            
            for (const line of recentLines) {
                const parsed = this.parseLogLine(line);
                if (parsed) {
                    this.cache.logs.unshift(parsed);
                }
            }
            
            this.cache.lastUpdate = new Date().toISOString();
            console.log(`[UNIFIED-LOGGER] Cache chargé: ${this.cache.logs.length} logs`);
            
        } catch (error) {
            console.error('[UNIFIED-LOGGER] Erreur chargement cache:', error);
            this.cache = { logs: [], totalLogs: 0, lastUpdate: new Date().toISOString() };
        }
    }

    async flush() {
        if (this.buffer.length === 0) return;

        try {
            const logLines = this.buffer.map(entry => entry.raw).join('\n') + '\n';
            await fs.appendFile(this.logFile, logLines);
            
            console.log(`[UNIFIED-LOGGER] ${this.buffer.length} logs écrits sur disque`);
            this.buffer = [];
            
        } catch (error) {
            console.error('[UNIFIED-LOGGER] Erreur flush:', error);
        }
    }

    startFlushTimer() {
        setInterval(() => {
            if (this.buffer.length > 0) {
                this.flush();
            }
        }, this.flushInterval);
    }

    /**
     * 🔍 RÉCUPÉRATION DES LOGS
     */
    async getLogs(limit = 100, offset = 0, filters = {}) {
        let logs = [...this.cache.logs];
        
        // Appliquer les filtres
        if (filters.level) {
            logs = logs.filter(log => log.level === filters.level.toUpperCase());
        }
        
        if (filters.since) {
            const sinceDate = new Date(filters.since);
            logs = logs.filter(log => new Date(log.timestamp) >= sinceDate);
        }
        
        if (filters.search) {
            const searchTerm = filters.search.toLowerCase();
            logs = logs.filter(log => 
                log.message.toLowerCase().includes(searchTerm)
            );
        }

        // Pagination
        const total = logs.length;
        const paginatedLogs = logs.slice(offset, offset + limit);
        
        return {
            success: true,
            logs: paginatedLogs,
            total,
            limit,
            offset,
            hasMore: offset + limit < total
        };
    }

    /**
     * 📊 MÉTRIQUES ET STATISTIQUES
     */
    getStats() {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        const stats = {
            total: this.cache.totalLogs,
            cached: this.cache.logs.length,
            lastHour: 0,
            lastDay: 0,
            byLevel: { INFO: 0, ERROR: 0, WARN: 0, SUCCESS: 0 },
            buffer: this.buffer.length
        };
        
        for (const log of this.cache.logs) {
            const logDate = new Date(log.timestamp);
            
            if (logDate >= oneHourAgo) stats.lastHour++;
            if (logDate >= oneDayAgo) stats.lastDay++;
            
            stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
        }
        
        return stats;
    }

    /**
     * 🔧 PARSING ET UTILITAIRES
     */
    parseLogLine(line) {
        if (!line || line.trim() === '') return null;
        
        // Ignorer les patterns de bruit
        for (const pattern of this.ignoredPatterns) {
            if (pattern.test(line)) return null;
        }
        
        // Extraire timestamp
        const timeMatch = line.match(/^\[([^\]]+)\]/);
        const timestamp = timeMatch ? timeMatch[1] : new Date().toISOString();
        
        // Extraire level
        const levelMatch = line.match(/\[([A-Z]+)\]/);
        const level = levelMatch ? levelMatch[1] : 'INFO';
        
        // Extraire message
        const message = line.replace(/^\[[^\]]+\]\s*(\[[^\]]+\]\s*)?/, '');
        
        return {
            timestamp,
            level,
            message,
            raw: line,
            metadata: { parsed: true }
        };
    }

    /**
     * 📥 EXPORT ET TÉLÉCHARGEMENT
     */
    async generateExport(format = 'txt') {
        const logs = await this.getLogs(1000);
        
        if (format === 'json') {
            return JSON.stringify(logs, null, 2);
        }
        
        // Format texte par défaut
        let content = `X-AutoRaider - Export des logs\n`;
        content += `Généré le: ${new Date().toLocaleString('fr-FR')}\n`;
        content += `Total: ${logs.total} logs\n`;
        content += `${'='.repeat(50)}\n\n`;
        
        for (const log of logs.logs) {
            content += `[${new Date(log.timestamp).toLocaleString('fr-FR')}] `;
            content += `[${log.level}] ${log.message}\n`;
        }
        
        return content;
    }

    /**
     * 🧹 MAINTENANCE
     */
    async cleanup(daysToKeep = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
            
            const data = await fs.readFile(this.logFile, 'utf8');
            const lines = data.trim().split('\n');
            
            const filteredLines = lines.filter(line => {
                const timeMatch = line.match(/^\[([^\]]+)\]/);
                if (!timeMatch) return true;
                
                try {
                    const logDate = new Date(timeMatch[1]);
                    return logDate >= cutoffDate;
                } catch {
                    return true;
                }
            });
            
            await fs.writeFile(this.logFile, filteredLines.join('\n') + '\n');
            await this.loadCache(); // Recharger le cache
            
            console.log(`[UNIFIED-LOGGER] Nettoyage: ${lines.length - filteredLines.length} logs supprimés`);
            
        } catch (error) {
            console.error('[UNIFIED-LOGGER] Erreur nettoyage:', error);
        }
    }

    /**
     * 🔄 COMPATIBILITÉ LEGACY
     */
    getFilteredLogsFromFile(limit = 100, offset = 0) {
        return this.getLogs(limit, offset);
    }

    generateDownloadableLogsContent() {
        return this.generateExport('txt');
    }
}

// Instance singleton
let loggerInstance = null;

function getUnifiedLogger() {
    if (!loggerInstance) {
        loggerInstance = new UnifiedLogger();
    }
    return loggerInstance;
}

// Fonction de compatibilité globale
function logToFile(message) {
    return getUnifiedLogger().logToFile(message);
}

module.exports = {
    UnifiedLogger,
    getUnifiedLogger,
    logToFile, // Compatibilité
    // Exports pour compatibilité avec l'ancien système
    getFilteredLogsFromFile: (limit, offset) => getUnifiedLogger().getFilteredLogsFromFile(limit, offset),
    generateDownloadableLogsContent: () => getUnifiedLogger().generateDownloadableLogsContent()
};
