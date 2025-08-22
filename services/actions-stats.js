const fs = require('fs');
const path = require('path');

/**
 * Service de cache persistant pour les statistiques d'actions
 * Sauvegarde et charge les métriques d'actions pour résister aux redémarrages
 */

const STATS_FILE = path.join(__dirname, '..', 'actions-stats.json');

/**
 * Structure par défaut des statistiques
 */
const defaultStats = {
    today: { likes: 0, retweets: 0, replies: 0, total: 0 },
    thisHour: { likes: 0, retweets: 0, replies: 0, total: 0 },
    allTime: { likes: 0, retweets: 0, replies: 0, total: 0 },
    lastUpdate: null,
    lastHourUpdate: null,
    currentDate: null,
    currentHour: null
};

/**
 * Cache en mémoire
 */
let statsCache = { ...defaultStats };

/**
 * Charge les statistiques depuis le fichier
 */
function loadStats() {
    try {
        if (fs.existsSync(STATS_FILE)) {
            const data = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
            statsCache = { ...defaultStats, ...data };
            console.log('[ACTIONS-STATS] Statistiques chargées:', statsCache);
        } else {
            console.log('[ACTIONS-STATS] Aucun fichier de stats trouvé, utilisation des valeurs par défaut');
            statsCache = { ...defaultStats };
        }
        
        // Vérifier si on a changé de jour/heure
        const now = new Date();
        const currentDate = now.toISOString().split('T')[0];
        const currentHour = now.getHours();
        
        // Reset des stats du jour si on a changé de date
        if (statsCache.currentDate !== currentDate) {
            console.log('[ACTIONS-STATS] Nouveau jour détecté, reset des stats today');
            statsCache.today = { likes: 0, retweets: 0, replies: 0, total: 0 };
            statsCache.currentDate = currentDate;
        }
        
        // Reset des stats de l'heure si on a changé d'heure
        if (statsCache.currentHour !== currentHour) {
            console.log('[ACTIONS-STATS] Nouvelle heure détectée, reset des stats thisHour');
            statsCache.thisHour = { likes: 0, retweets: 0, replies: 0, total: 0 };
            statsCache.currentHour = currentHour;
        }
        
    } catch (error) {
        console.error('[ACTIONS-STATS] Erreur lors du chargement:', error);
        statsCache = { ...defaultStats };
    }
}

/**
 * Sauvegarde les statistiques dans le fichier
 */
function saveStats() {
    try {
        const now = new Date();
        statsCache.lastUpdate = now.toISOString();
        statsCache.currentDate = now.toISOString().split('T')[0];
        statsCache.currentHour = now.getHours();
        
        fs.writeFileSync(STATS_FILE, JSON.stringify(statsCache, null, 2));
        console.log('[ACTIONS-STATS] Statistiques sauvegardées');
    } catch (error) {
        console.error('[ACTIONS-STATS] Erreur lors de la sauvegarde:', error);
    }
}

/**
 * Ajoute une action aux statistiques
 * @param {string} actionType - Type d'action (like, retweet, reply)
 */
function addAction(actionType) {
    if (!['like', 'retweet', 'reply'].includes(actionType)) {
        console.warn('[ACTIONS-STATS] Type d\'action invalide:', actionType);
        return;
    }
    
    const pluralType = actionType === 'like' ? 'likes' : 
                      actionType === 'retweet' ? 'retweets' : 'replies';
    
    // Incrémenter all-time
    statsCache.allTime[pluralType]++;
    statsCache.allTime.total++;
    
    // Incrémenter today
    statsCache.today[pluralType]++;
    statsCache.today.total++;
    
    // Incrémenter this hour
    statsCache.thisHour[pluralType]++;
    statsCache.thisHour.total++;
    
    console.log(`[ACTIONS-STATS] Action ${actionType} ajoutée. Total: ${statsCache.allTime.total}`);
    
    // Sauvegarder automatiquement
    saveStats();
}

/**
 * Obtient les statistiques actuelles
 * @returns {Object} Statistiques complètes
 */
function getStats() {
    return {
        today: { ...statsCache.today },
        thisHour: { ...statsCache.thisHour },
        allTime: { ...statsCache.allTime },
        lastUpdate: statsCache.lastUpdate
    };
}

/**
 * Recalcule les statistiques depuis les logs (migration/correction)
 * @param {Array} logs - Logs à analyser
 */
function recalculateFromLogs(logs) {
    console.log('[ACTIONS-STATS] Recalcul depuis les logs...');
    
    // Reset des compteurs
    statsCache.today = { likes: 0, retweets: 0, replies: 0, total: 0 };
    statsCache.thisHour = { likes: 0, retweets: 0, replies: 0, total: 0 };
    statsCache.allTime = { likes: 0, retweets: 0, replies: 0, total: 0 };
    
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentHour = now.getHours();
    
    if (logs && logs.logs && Array.isArray(logs.logs)) {
        logs.logs.forEach(log => {
            if (log.type && ['like', 'retweet', 'reply'].includes(log.type)) {
                const logDate = new Date(log.metadata?.actionTime || log.timestamp);
                const logDateStr = logDate.toISOString().split('T')[0];
                const logHour = logDate.getHours();
                
                const pluralType = log.type === 'like' ? 'likes' : 
                                 log.type === 'retweet' ? 'retweets' : 'replies';
                
                // All-time
                statsCache.allTime[pluralType]++;
                statsCache.allTime.total++;
                
                // Today
                if (logDateStr === today) {
                    statsCache.today[pluralType]++;
                    statsCache.today.total++;
                    
                    // This hour
                    if (logHour === currentHour) {
                        statsCache.thisHour[pluralType]++;
                        statsCache.thisHour.total++;
                    }
                }
            }
        });
    }
    
    console.log('[ACTIONS-STATS] Recalcul terminé:', {
        allTime: statsCache.allTime.total,
        today: statsCache.today.total,
        thisHour: statsCache.thisHour.total
    });
    
    saveStats();
}

/**
 * Reset complet des statistiques
 */
function resetStats() {
    console.log('[ACTIONS-STATS] Reset complet des statistiques');
    statsCache = { ...defaultStats };
    saveStats();
}

// Charger les stats au démarrage du module
loadStats();

module.exports = {
    loadStats,
    saveStats,
    addAction,
    getStats,
    recalculateFromLogs,
    resetStats
};
