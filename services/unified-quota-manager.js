const fs = require('fs');
const path = require('path');
const { logToFile } = require('./logs-optimized');

/**
 * 🎯 SYSTÈME DE QUOTAS UNIFIÉ - VERSION SIMPLIFIÉE
 * 
 * PRINCIPE :
 * 1. QUOTA GLOBAL : Payé par le client (ex: 10 000 actions), partagé dynamiquement entre comptes
 * 2. QUOTA QUOTIDIEN : Fixe à 600 actions/jour, partagé dynamiquement, reset toutes les 24h
 * 3. DISTRIBUTION AUTOMATIQUE : 100% reply, 50% like, 10% retweet (probabiliste)
 * 4. CONFIGURATION FIGÉE : Quota global non modifiable par le client
 */

const QUOTA_CONFIG_FILE = path.join(__dirname, '..', 'quota-config.json');
const QUOTA_USAGE_FILE = path.join(__dirname, '..', 'quota-usage.json');

// 🔒 CONFIGURATION FIGÉE (déployée par le développeur) - DÉSACTIVÉE
// Les valeurs sont maintenant lues depuis master-quota-config.json
const DEPLOYMENT_CONFIG = {
    globalQuota: null,         // Lire depuis master-quota-config.json
    dailyQuotaLimit: null,     // Lire depuis master-quota-config.json
    actionProbabilities: {
        reply: 1.0,            // 100% - Obligatoire sur chaque tweet
        like: 0.3,             // 30% - Aléatoire
        retweet: 0.05           // 5% - Aléatoire
    },
    version: "1.0.0",
    deployedAt: new Date().toISOString()
};

/**
 * Structure du fichier quota-usage.json :
 * {
 *   "globalUsage": {
 *     "totalUsed": 1250,                    // Actions consommées sur le quota global
 *     "remaining": 8750,                    // Actions restantes sur le quota global
 *     "firstUsage": "2025-08-14T10:00:00Z", // Première utilisation
 *     "lastUsage": "2025-08-14T12:00:00Z"   // Dernière utilisation
 *   },
 *   "dailyUsage": {
 *     "date": "2025-08-14",                 // Date actuelle
 *     "totalUsed": 45,                      // Actions utilisées aujourd'hui
 *     "remaining": 555,                     // Actions restantes aujourd'hui
 *     "resetAt": "2025-08-15T00:00:00Z"     // Prochaine remise à zéro
 *   },
 *   "accountsUsage": {
 *     "153720161": {                        // ID du compte
 *       "username": "psyk0t",
 *       "globalUsed": 420,                  // Actions consommées sur le quota global
 *       "dailyUsed": 15,                    // Actions utilisées aujourd'hui
 *       "lastAction": "2025-08-14T11:30:00Z",
 *       "connectedAt": "2025-08-14T09:00:00Z",
 *       "isActive": true
 *     }
 *   },
 *   "currentAllocation": {
 *     "activeAccounts": 6,                  // Nombre de comptes actifs
 *     "globalPerAccount": 1458,             // Quota global par compte (8750/6)
 *     "dailyPerAccount": 100,               // Quota quotidien par compte (600/6)
 *     "lastRecalculation": "2025-08-14T12:00:00Z"
 *   }
 * }
 */

/**
 * Charger la configuration de déploiement - LIT DEPUIS master-quota-config.json
 */
function getDeploymentConfig() {
    const masterConfigFile = path.join(__dirname, '..', 'master-quota-config.json');
    
    try {
        if (fs.existsSync(masterConfigFile)) {
            const masterConfig = JSON.parse(fs.readFileSync(masterConfigFile, 'utf8'));
            
            // Utiliser les valeurs du master-quota-config.json
            return {
                ...DEPLOYMENT_CONFIG,
                globalQuota: masterConfig.globalPack?.totalActions || 10000,
                dailyQuotaLimit: masterConfig.dailyQuotas?.dailyLimit || 600,
                version: masterConfig.version || "2.0.0",
                deployedAt: masterConfig.deployedAt || new Date().toISOString()
            };
        }
    } catch (error) {
        console.log(`[MASTER-QUOTA] Erreur lecture master-quota-config.json: ${error.message}`);
    }
    
    // Fallback vers les valeurs par défaut si le fichier n'existe pas
    return {
        ...DEPLOYMENT_CONFIG,
        globalQuota: 10000,
        dailyQuotaLimit: 600
    };
}

/**
 * Charger les données d'utilisation des quotas
 */
function loadQuotaUsage() {
    try {
        if (fs.existsSync(QUOTA_USAGE_FILE)) {
            const data = JSON.parse(fs.readFileSync(QUOTA_USAGE_FILE, 'utf8'));
            
            // Vérifier si on doit faire un reset quotidien
            const today = new Date().toISOString().split('T')[0];
            if (data.dailyUsage && data.dailyUsage.date !== today) {
                logToFile(`[MASTER-QUOTA] Reset quotidien détecté : ${data.dailyUsage.date} → ${today}`);
                data.dailyUsage = createDailyUsageStructure();
                
                // Reset des compteurs quotidiens par compte
                Object.keys(data.accountsUsage || {}).forEach(accountId => {
                    data.accountsUsage[accountId].dailyUsed = 0;
                });
                
                saveQuotaUsage(data);
            }
            
            return data;
        }
    } catch (error) {
        logToFile(`[MASTER-QUOTA] Erreur chargement usage: ${error.message}`);
    }
    
    // Créer la structure initiale
    const initialData = createInitialUsageStructure();
    saveQuotaUsage(initialData);
    return initialData;
}

/**
 * Sauvegarder les données d'utilisation des quotas
 */
function saveQuotaUsage(data) {
    try {
        fs.writeFileSync(QUOTA_USAGE_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        logToFile(`[MASTER-QUOTA] Erreur sauvegarde usage: ${error.message}`);
        return false;
    }
}

/**
 * Créer la structure initiale des données d'utilisation
 */
function createInitialUsageStructure() {
    const config = getDeploymentConfig();
    return {
        globalUsage: {
            totalUsed: 0,
            remaining: config.globalQuota,
            firstUsage: null,
            lastUsage: null
        },
        dailyUsage: createDailyUsageStructure(),
        accountsUsage: {},
        currentAllocation: {
            activeAccounts: 0,
            globalPerAccount: 0,
            dailyPerAccount: 0,
            lastRecalculation: new Date().toISOString()
        }
    };
}

/**
 * Créer la structure quotidienne
 */
function createDailyUsageStructure() {
    const config = getDeploymentConfig();
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    return {
        date: today,
        totalUsed: 0,
        remaining: config.dailyQuotaLimit,
        resetAt: tomorrow.toISOString()
    };
}

/**
 * Ajouter ou mettre à jour un compte connecté
 */
function addConnectedAccount(accountId, username) {
    const usage = loadQuotaUsage();
    
    if (!usage.accountsUsage[accountId]) {
        usage.accountsUsage[accountId] = {
            username: username,
            globalUsed: 0,
            dailyUsed: 0,
            lastAction: null,
            connectedAt: new Date().toISOString(),
            isActive: true
        };
        
        logToFile(`[MASTER-QUOTA] Nouveau compte ajouté: ${username} (${accountId})`);
    } else {
        // Réactiver le compte s'il était inactif
        usage.accountsUsage[accountId].isActive = true;
        usage.accountsUsage[accountId].username = username; // Mise à jour du nom
        logToFile(`[MASTER-QUOTA] Compte réactivé: ${username} (${accountId})`);
    }
    
    // Recalculer la répartition
    recalculateAllocation(usage);
    saveQuotaUsage(usage);
    
    return usage.accountsUsage[accountId];
}

/**
 * Désactiver un compte
 */
function deactivateAccount(accountId) {
    const usage = loadQuotaUsage();
    
    if (usage.accountsUsage[accountId]) {
        usage.accountsUsage[accountId].isActive = false;
        logToFile(`[MASTER-QUOTA] Compte désactivé: ${accountId})`);
        
        // Recalculer la répartition
        recalculateAllocation(usage);
        saveQuotaUsage(usage);
        
        return true;
    }
    
    return false;
}

/**
 * Recalculer la répartition des quotas entre comptes actifs
 */
function recalculateAllocation(usage) {
    const config = getDeploymentConfig();
    const activeAccounts = Object.values(usage.accountsUsage).filter(acc => acc.isActive);
    const activeCount = activeAccounts.length;
    
    if (activeCount === 0) {
        usage.currentAllocation = {
            activeAccounts: 0,
            globalPerAccount: 0,
            dailyPerAccount: 0,
            lastRecalculation: new Date().toISOString()
        };
    } else {
        // Répartition du quota global restant
        const globalRemaining = usage.globalUsage.remaining;
        const globalPerAccount = Math.floor(globalRemaining / activeCount);
        
        // Répartition du quota quotidien
        const dailyPerAccount = Math.floor(config.dailyQuotaLimit / activeCount);
        
        usage.currentAllocation = {
            activeAccounts: activeCount,
            globalPerAccount: globalPerAccount,
            dailyPerAccount: dailyPerAccount,
            lastRecalculation: new Date().toISOString()
        };
        
        logToFile(`[MASTER-QUOTA] Répartition recalculée: ${activeCount} comptes actifs`);
        logToFile(`[MASTER-QUOTA] Quota global par compte: ${globalPerAccount} actions`);
        logToFile(`[MASTER-QUOTA] Quota quotidien par compte: ${dailyPerAccount} actions`);
    }
    
    return usage.currentAllocation;
}

/**
 * Vérifier si un compte peut effectuer une action
 */
function canAccountPerformAction(accountId) {
    const usage = loadQuotaUsage();
    const config = getDeploymentConfig();
    
    // Vérifier si le compte existe et est actif
    const account = usage.accountsUsage[accountId];
    if (!account || !account.isActive) {
        return {
            allowed: false,
            reason: 'Compte non trouvé ou inactif',
            globalRemaining: 0,
            dailyRemaining: 0
        };
    }
    
    // Vérifier le quota global
    if (usage.globalUsage.remaining <= 0) {
        return {
            allowed: false,
            reason: 'Quota global épuisé',
            globalRemaining: 0,
            dailyRemaining: usage.currentAllocation.dailyPerAccount - account.dailyUsed
        };
    }
    
    // Vérifier le quota quotidien global
    if (usage.dailyUsage.remaining <= 0) {
        return {
            allowed: false,
            reason: 'Quota quotidien global épuisé',
            globalRemaining: usage.currentAllocation.globalPerAccount - account.globalUsed,
            dailyRemaining: 0
        };
    }
    
    // Vérifier le quota quotidien du compte
    const accountDailyRemaining = usage.currentAllocation.dailyPerAccount - account.dailyUsed;
    if (accountDailyRemaining <= 0) {
        return {
            allowed: false,
            reason: 'Quota quotidien du compte épuisé',
            globalRemaining: usage.currentAllocation.globalPerAccount - account.globalUsed,
            dailyRemaining: 0
        };
    }
    
    // Action autorisée
    return {
        allowed: true,
        reason: 'Action autorisée',
        globalRemaining: usage.currentAllocation.globalPerAccount - account.globalUsed,
        dailyRemaining: accountDailyRemaining
    };
}

/**
 * Consommer une action pour un compte
 */
function consumeAction(accountId, actionType = 'unknown') {
    const usage = loadQuotaUsage();
    const now = new Date().toISOString();
    
    // Vérifier si l'action est autorisée
    const check = canAccountPerformAction(accountId);
    if (!check.allowed) {
        logToFile(`[MASTER-QUOTA] Action refusée pour ${accountId}: ${check.reason}`);
        return {
            success: false,
            reason: check.reason,
            remaining: check
        };
    }
    
    // Consommer l'action
    const account = usage.accountsUsage[accountId];
    
    // Incrémenter les compteurs
    usage.globalUsage.totalUsed += 1;
    usage.globalUsage.remaining -= 1;
    usage.globalUsage.lastUsage = now;
    if (!usage.globalUsage.firstUsage) {
        usage.globalUsage.firstUsage = now;
    }
    
    usage.dailyUsage.totalUsed += 1;
    usage.dailyUsage.remaining -= 1;
    
    account.globalUsed += 1;
    account.dailyUsed += 1;
    account.lastAction = now;
    
    // Sauvegarder
    saveQuotaUsage(usage);
    
    logToFile(`[MASTER-QUOTA] Action consommée: ${actionType} par ${account.username} (${accountId})`);
    logToFile(`[MASTER-QUOTA] Quota global restant: ${usage.globalUsage.remaining}`);
    logToFile(`[MASTER-QUOTA] Quota quotidien restant: ${usage.dailyUsage.remaining}`);
    
    return {
        success: true,
        reason: 'Action consommée avec succès',
        remaining: {
            globalRemaining: usage.currentAllocation.globalPerAccount - account.globalUsed,
            dailyRemaining: usage.currentAllocation.dailyPerAccount - account.dailyUsed
        }
    };
}

/**
 * Obtenir les statistiques complètes des quotas
 */
function getQuotaStats() {
    const usage = loadQuotaUsage();
    const config = getDeploymentConfig();
    
    return {
        config: config,
        global: usage.globalUsage,
        daily: usage.dailyUsage,
        allocation: usage.currentAllocation,
        accounts: Object.entries(usage.accountsUsage)
            .filter(([id, acc]) => acc.isActive)
            .map(([id, acc]) => ({
                id: id,
                username: acc.username,
                globalUsed: acc.globalUsed,
                globalRemaining: usage.currentAllocation.globalPerAccount - acc.globalUsed,
                dailyUsed: acc.dailyUsed,
                dailyRemaining: usage.currentAllocation.dailyPerAccount - acc.dailyUsed,
                lastAction: acc.lastAction,
                connectedAt: acc.connectedAt
            }))
    };
}

/**
 * Déterminer les actions à effectuer pour un tweet selon les probabilités
 */
function determineActionsForTweet(accountId, tweetId) {
    const check = canAccountPerformAction(accountId);
    if (!check.allowed) {
        return {
            actions: [],
            reason: check.reason
        };
    }
    
    const config = getDeploymentConfig();
    const actions = [];
    
    // Reply : 100% (obligatoire)
    if (Math.random() <= config.actionProbabilities.reply) {
        actions.push('reply');
    }
    
    // Like : 50% (aléatoire)
    if (Math.random() <= config.actionProbabilities.like) {
        actions.push('like');
    }
    
    // Retweet : 10% (aléatoire)
    if (Math.random() <= config.actionProbabilities.retweet) {
        actions.push('retweet');
    }
    
    // Limiter le nombre d'actions selon les quotas restants
    const maxActions = Math.min(actions.length, check.dailyRemaining);
    const finalActions = actions.slice(0, maxActions);
    
    logToFile(`[MASTER-QUOTA] Actions déterminées pour tweet ${tweetId}: ${finalActions.join(', ')}`);
    
    return {
        actions: finalActions,
        reason: 'Actions déterminées selon probabilités',
        quotaCheck: check
    };
}

module.exports = {
    // Configuration
    getDeploymentConfig,
    
    // Gestion des comptes
    addConnectedAccount,
    deactivateAccount,
    
    // Vérification et consommation
    canAccountPerformAction,
    consumeAction,
    
    // Statistiques
    getQuotaStats,
    
    // Actions automatiques
    determineActionsForTweet,
    
    // Utilitaires internes (pour tests)
    loadQuotaUsage,
    saveQuotaUsage,
    recalculateAllocation
};
