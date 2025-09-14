const fs = require('fs');
const path = require('path');

// Chemin vers le fichier JSON des actions effectuées
const PERFORMED_ACTIONS_FILE = path.join(__dirname, '..', 'performed-actions.json');

/**
 * Marque une action comme effectuée dans le fichier JSON
 * @param {string} tweetId - ID du tweet
 * @param {string} accountId - ID du compte
 * @param {string} actionType - Type d'action (like, retweet, reply)
 */
function markActionAsPerformed(tweetId, accountId, actionType) {
    try {
        let performedActions = {};
        
        // Lire le fichier existant s'il existe
        if (fs.existsSync(PERFORMED_ACTIONS_FILE)) {
            const data = fs.readFileSync(PERFORMED_ACTIONS_FILE, 'utf8');
            performedActions = JSON.parse(data);
        }
        
        // Créer la structure si elle n'existe pas
        if (!performedActions[tweetId]) {
            performedActions[tweetId] = {};
        }
        
        if (!performedActions[tweetId][accountId]) {
            performedActions[tweetId][accountId] = [];
        }
        
        // Ajouter l'action si elle n'existe pas déjà
        if (!performedActions[tweetId][accountId].includes(actionType)) {
            performedActions[tweetId][accountId].push(actionType);
            
            // Sauvegarder le fichier
            fs.writeFileSync(PERFORMED_ACTIONS_FILE, JSON.stringify(performedActions, null, 2));
        }
        
    } catch (error) {
        console.error(`[PERFORMED-ACTIONS] Erreur lors de la sauvegarde: ${error.message}`);
    }
}

/**
 * Vérifie si une action a déjà été effectuée
 * @param {string} tweetId - ID du tweet
 * @param {string} accountId - ID du compte
 * @param {string} actionType - Type d'action (like, retweet, reply)
 * @returns {boolean} - True si l'action a déjà été effectuée
 */
function isActionPerformed(tweetId, accountId, actionType) {
    try {
        if (!fs.existsSync(PERFORMED_ACTIONS_FILE)) {
            return false;
        }
        
        const data = fs.readFileSync(PERFORMED_ACTIONS_FILE, 'utf8');
        const performedActions = JSON.parse(data);
        
        return performedActions[tweetId] && 
               performedActions[tweetId][accountId] && 
               performedActions[tweetId][accountId].includes(actionType);
               
    } catch (error) {
        console.error(`[PERFORMED-ACTIONS] Erreur lors de la lecture: ${error.message}`);
        return false;
    }
}

/**
 * Nettoie les actions anciennes (plus de 7 jours)
 */
function cleanupOldActions() {
    try {
        if (!fs.existsSync(PERFORMED_ACTIONS_FILE)) {
            return;
        }
        
        const data = fs.readFileSync(PERFORMED_ACTIONS_FILE, 'utf8');
        const performedActions = JSON.parse(data);
        
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        let cleaned = false;
        
        for (const tweetId in performedActions) {
            // Extraire le timestamp du tweet ID (approximatif)
            const tweetTimestamp = parseInt(tweetId) >> 22;
            const tweetDate = tweetTimestamp + 1288834974657; // Epoch Twitter
            
            if (tweetDate < sevenDaysAgo) {
                delete performedActions[tweetId];
                cleaned = true;
            }
        }
        
        if (cleaned) {
            fs.writeFileSync(PERFORMED_ACTIONS_FILE, JSON.stringify(performedActions, null, 2));
            console.log(`[PERFORMED-ACTIONS] Actions anciennes nettoyées`);
        }
        
    } catch (error) {
        console.error(`[PERFORMED-ACTIONS] Erreur lors du nettoyage: ${error.message}`);
    }
}

module.exports = {
    markActionAsPerformed,
    isActionPerformed,
    cleanupOldActions
};
