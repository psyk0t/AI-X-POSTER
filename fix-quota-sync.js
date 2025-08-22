const fs = require('fs');
const path = require('path');

/**
 * SCRIPT DE SYNCHRONISATION DES QUOTAS
 * Corrige automatiquement les désynchronisations entre oauth2-users.json et les systèmes de quotas
 */

const OAUTH2_USERS_FILE = path.join(__dirname, 'oauth2-users.json');
const MASTER_QUOTA_FILE = path.join(__dirname, 'master-quota-config.json');
const QUOTA_USAGE_FILE = path.join(__dirname, 'quota-usage.json');

/**
 * Charger les comptes OAuth2 actuellement connectés
 */
function loadConnectedAccounts() {
    try {
        if (fs.existsSync(OAUTH2_USERS_FILE)) {
            const oauth2Data = JSON.parse(fs.readFileSync(OAUTH2_USERS_FILE, 'utf8'));
            return oauth2Data.map(([id, userData]) => ({
                id,
                username: userData.username,
                name: userData.name,
                connectedAt: userData.connectedAt,
                authMethod: userData.authMethod || 'oauth2'
            }));
        }
    } catch (error) {
        console.error('[SYNC] Erreur lecture oauth2-users.json:', error.message);
    }
    return [];
}

/**
 * Synchroniser master-quota-config.json avec les comptes connectés
 */
function syncMasterQuotaConfig(connectedAccounts) {
    try {
        let masterConfig = {};
        
        // Charger la configuration existante
        if (fs.existsSync(MASTER_QUOTA_FILE)) {
            masterConfig = JSON.parse(fs.readFileSync(MASTER_QUOTA_FILE, 'utf8'));
        }
        
        // Créer la nouvelle structure connectedAccounts
        const newConnectedAccounts = {};
        connectedAccounts.forEach(account => {
            newConnectedAccounts[account.id] = {
                username: account.username,
                authMethod: account.authMethod,
                connectedAt: account.connectedAt,
                actionsUsed: 0,
                dailyUsed: {
                    like: 0,
                    retweet: 0,
                    reply: 0
                },
                isActive: true,
                lastReset: new Date().toISOString().split('T')[0],
                lastAction: null
            };
        });
        
        // Mettre à jour la configuration
        masterConfig.connectedAccounts = newConnectedAccounts;
        
        // Recalculer l'allocation
        const accountCount = connectedAccounts.length;
        if (accountCount > 0) {
            const globalQuota = masterConfig.globalPack?.totalActions || 10000;
            const dailyLimit = masterConfig.dailyQuotas?.dailyLimit || 100;
            
            masterConfig.allocation = {
                perAccountQuota: Math.floor(globalQuota / accountCount),
                perAccountDaily: Math.floor(dailyLimit / accountCount),
                lastRecalculation: new Date().toISOString()
            };
        }
        
        // Sauvegarder
        fs.writeFileSync(MASTER_QUOTA_FILE, JSON.stringify(masterConfig, null, 2));
        console.log(`[SYNC] master-quota-config.json synchronisé avec ${accountCount} comptes`);
        
        return masterConfig;
    } catch (error) {
        console.error('[SYNC] Erreur synchronisation master-quota-config.json:', error.message);
        return null;
    }
}

/**
 * Synchroniser quota-usage.json avec les comptes connectés
 */
function syncQuotaUsage(connectedAccounts) {
    try {
        let quotaUsage = {};
        
        // Charger les données existantes
        if (fs.existsSync(QUOTA_USAGE_FILE)) {
            quotaUsage = JSON.parse(fs.readFileSync(QUOTA_USAGE_FILE, 'utf8'));
        }
        
        // Créer la nouvelle structure accountsUsage
        const newAccountsUsage = {};
        connectedAccounts.forEach(account => {
            newAccountsUsage[account.id] = {
                username: account.username,
                globalUsed: 0,
                dailyUsed: 0,
                lastAction: null,
                connectedAt: account.connectedAt,
                isActive: true
            };
        });
        
        // Mettre à jour la structure
        quotaUsage.accountsUsage = newAccountsUsage;
        
        // Recalculer l'allocation
        const accountCount = connectedAccounts.length;
        const globalRemaining = quotaUsage.globalUsage?.remaining || 10000;
        const dailyLimit = quotaUsage.dailyUsage?.remaining || 100;
        
        quotaUsage.currentAllocation = {
            activeAccounts: accountCount,
            globalPerAccount: accountCount > 0 ? Math.floor(globalRemaining / accountCount) : 0,
            dailyPerAccount: accountCount > 0 ? Math.floor(dailyLimit / accountCount) : 0,
            lastRecalculation: new Date().toISOString()
        };
        
        // Sauvegarder
        fs.writeFileSync(QUOTA_USAGE_FILE, JSON.stringify(quotaUsage, null, 2));
        console.log(`[SYNC] quota-usage.json synchronisé avec ${accountCount} comptes`);
        
        return quotaUsage;
    } catch (error) {
        console.error('[SYNC] Erreur synchronisation quota-usage.json:', error.message);
        return null;
    }
}

/**
 * Fonction principale de synchronisation
 */
function synchronizeQuotaSystems() {
    console.log('[SYNC] Début de la synchronisation des systèmes de quotas...');
    
    // 1. Charger les comptes OAuth2 connectés (source de vérité)
    const connectedAccounts = loadConnectedAccounts();
    console.log(`[SYNC] ${connectedAccounts.length} comptes connectés détectés:`);
    connectedAccounts.forEach(acc => {
        console.log(`[SYNC]   - ${acc.username} (${acc.id})`);
    });
    
    // 2. Synchroniser master-quota-config.json
    const masterConfig = syncMasterQuotaConfig(connectedAccounts);
    
    // 3. Synchroniser quota-usage.json
    const quotaUsage = syncQuotaUsage(connectedAccounts);
    
    // 4. Afficher le résumé
    if (masterConfig && quotaUsage) {
        console.log('[SYNC] Synchronisation terminée avec succès !');
        console.log(`[SYNC] Quota global par compte: ${masterConfig.allocation?.perAccountQuota || 0}`);
        console.log(`[SYNC] Quota quotidien par compte: ${masterConfig.allocation?.perAccountDaily || 0}`);
        console.log(`[SYNC] Allocation actuelle: ${quotaUsage.currentAllocation?.activeAccounts || 0} comptes actifs`);
    } else {
        console.error('[SYNC] Échec de la synchronisation');
    }
}

// Exécuter la synchronisation si le script est appelé directement
if (require.main === module) {
    synchronizeQuotaSystems();
}

module.exports = {
    synchronizeQuotaSystems,
    loadConnectedAccounts,
    syncMasterQuotaConfig,
    syncQuotaUsage
};
