const fs = require('fs');
const path = require('path');

/**
 * SHARED GLOBAL QUOTA SERVICE
 * Manages a global action pack dynamically distributed among all connected accounts
 * 
 * Business Model:
 * - Client purchases a global pack (e.g.: 10,000 actions)
 * - This quota is automatically shared among all connected accounts
 * - Dynamic distribution: 1 account = 100%, 2 accounts = 50% each, etc.
 * - Automatic readjustment when adding/removing accounts
 */

const SHARED_QUOTA_FILE = path.join(__dirname, '..', 'master-quota-config.json');

/**
 * Structure of shared-quota-data.json file:
 * {
 *   "globalPack": {
 *     "totalActions": 10000,           // Pack purchased by client
 *     "usedActions": 150,              // Total actions consumed
 *     "remainingActions": 9850,        // Remaining actions
 *     "purchaseDate": "2025-08-06",
 *     "expiryDate": "2025-09-06",      // Optional: pack expiration
 *     "packType": "premium"            // Pack type (basic, premium, enterprise)
 *   },
 *   "dailyQuotas": {
 *     "dailyLimit": 300,               // Global daily limit
 *     "usedToday": 45,                 // Actions used today
 *     "lastReset": "2025-08-06",       // Last reset
 *     "distribution": {                // Distribution by action type
 *       "like": 45,                    // 45%
 *       "retweet": 10,                 // 10%
 *       "reply": 45                    // 45%
 *     }
 *   },
 *   "connectedAccounts": {
 *     "153720161": {                   // Account ID
 *       "username": "waruinekotan_4",
 *       "authMethod": "oauth2",
 *       "connectedAt": "2025-08-06T09:00:00.000Z",
 *       "actionsUsed": 25,             // Actions used by this account
 *       "dailyUsed": {                 // Actions used today
 *         "like": 10,
 *         "retweet": 2,
 *         "reply": 8
 *       },
 *       "isActive": true               // Account active or not
 *     }
 *   },
 *   "allocation": {
 *     "perAccountQuota": 3333,         // Quota per account (calculated dynamically)
 *     "perAccountDaily": 100,          // Daily limit per account
 *     "lastRecalculation": "2025-08-06T09:00:00.000Z"
 *   }
 * }
 */

/**
 * Load shared quota data
 */
function loadSharedQuotaData() {
    try {
        if (fs.existsSync(SHARED_QUOTA_FILE)) {
            const data = JSON.parse(fs.readFileSync(SHARED_QUOTA_FILE, 'utf8'));
            
            // Check and reset daily quotas if needed
            checkAndResetDailyQuotas(data);
            
            return data;
        } else {
            // DON'T create file automatically - let it be created manually
            console.log('[SHARED-QUOTA] master-quota-config.json not found - using fallback data');
            return createDefaultSharedQuotaData();
        }
    } catch (error) {
        console.error('[SHARED-QUOTA] Loading error:', error);
        return createDefaultSharedQuotaData();
    }
}

/**
 * Save shared quota data - ONLY save runtime data, preserve custom config values
 */
function saveSharedQuotaData(data) {
    try {
        // Load existing master config to preserve custom values
        let existingConfig = {};
        if (fs.existsSync(SHARED_QUOTA_FILE)) {
            try {
                existingConfig = JSON.parse(fs.readFileSync(SHARED_QUOTA_FILE, 'utf8'));
            } catch (e) {
                console.log('[SHARED-QUOTA] Could not read existing config, creating new one');
            }
        }
        
        // Merge: preserve custom config values, update only runtime data
        const mergedData = {
            ...existingConfig,
            // Update only runtime fields that change during automation
            globalPack: {
                ...existingConfig.globalPack,
                usedActions: data.globalPack.usedActions,
                remainingActions: data.globalPack.remainingActions
            },
            dailyQuotas: {
                ...existingConfig.dailyQuotas,
                usedToday: data.dailyQuotas.usedToday,
                lastReset: data.dailyQuotas.lastReset,
                distribution: data.dailyQuotas.distribution
            },
            connectedAccounts: data.connectedAccounts, // This needs to be updated
            allocation: data.allocation // This needs to be updated
        };
        
        fs.writeFileSync(SHARED_QUOTA_FILE, JSON.stringify(mergedData, null, 2));
        console.log('[SHARED-QUOTA] Data saved while preserving custom config values');
    } catch (error) {
        console.error('[SHARED-QUOTA] Save error:', error);
    }
}

/**
 * Create default data
 */
function createDefaultSharedQuotaData() {
    // Try to preserve existing values from master-quota-config.json if it exists
    const masterFile = path.join(__dirname, '..', 'master-quota-config.json');
    try {
        if (fs.existsSync(masterFile)) {
            const masterData = JSON.parse(fs.readFileSync(masterFile, 'utf8'));
            return {
                globalPack: masterData.globalPack || {
                    totalActions: 10000,
                    usedActions: 0,
                    remainingActions: 10000,
                    purchaseDate: new Date().toISOString().split('T')[0],
                    expiryDate: null,
                    packType: "premium"
                },
                dailyQuotas: masterData.dailyQuotas || {
                    dailyLimit: 300,
                    usedToday: 0,
                    lastReset: new Date().toISOString().split('T')[0],
                    distribution: {
                        like: 45,
                        retweet: 10,
                        reply: 45
                    }
                },
                connectedAccounts: masterData.connectedAccounts || {},
                allocation: masterData.allocation || {
                    perAccountQuota: 0,
                    perAccountDaily: 0,
                    lastRecalculation: new Date().toISOString()
                }
            };
        }
    } catch (error) {
        console.error('[SHARED-QUOTA] Error reading master config:', error);
    }
    
    // Fallback to hardcoded defaults
    return {
        globalPack: {
            totalActions: 10000,
            usedActions: 0,
            remainingActions: 10000,
            purchaseDate: new Date().toISOString().split('T')[0],
            expiryDate: null,
            packType: "premium"
        },
        dailyQuotas: {
            dailyLimit: 300,
            usedToday: 0,
            lastReset: new Date().toISOString().split('T')[0],
            distribution: {
                like: 45,
                retweet: 10,
                reply: 45
            }
        },
        connectedAccounts: {},
        allocation: {
            perAccountQuota: 0,
            perAccountDaily: 0,
            lastRecalculation: new Date().toISOString()
        }
    };
}

/**
 * Recalculate quota distribution among all connected accounts
 */
function recalculateQuotaAllocation() {
    const data = loadSharedQuotaData();
    const activeAccounts = Object.values(data.connectedAccounts).filter(acc => acc.isActive);
    const accountCount = activeAccounts.length;
    
    if (accountCount === 0) {
        data.allocation.perAccountQuota = 0;
        data.allocation.perAccountDaily = 0;
    } else {
        // Distribute remaining global quota among all active accounts
        data.allocation.perAccountQuota = Math.floor(data.globalPack.remainingActions / accountCount);
        
        // Distribute daily limit among all active accounts
        data.allocation.perAccountDaily = Math.floor(data.dailyQuotas.dailyLimit / accountCount);
    }
    
    data.allocation.lastRecalculation = new Date().toISOString();
    saveSharedQuotaData(data);
    
    console.log(`[SHARED-QUOTA] Recalculation completed: ${accountCount} active accounts`);
    console.log(`[SHARED-QUOTA] Quota per account: ${data.allocation.perAccountQuota} actions`);
    console.log(`[SHARED-QUOTA] Daily limit per account: ${data.allocation.perAccountDaily} actions`);
    
    return data.allocation;
}

/**
 * Add a new connected account
 */
function addConnectedAccount(accountId, username, authMethod = 'oauth2') {
    const data = loadSharedQuotaData();
    
    data.connectedAccounts[accountId] = {
        username,
        authMethod,
        connectedAt: new Date().toISOString(),
        actionsUsed: 0,
        dailyUsed: {
            like: 0,
            retweet: 0,
            reply: 0
        },
        isActive: true
    };
    
    saveSharedQuotaData(data);
    
    // Recalculate distribution with the new account
    const allocation = recalculateQuotaAllocation();
    
    console.log(`[SHARED-QUOTA] Account added: @${username} (${accountId})`);
    console.log(`[SHARED-QUOTA] New quota per account: ${allocation.perAccountQuota}`);
    
    return allocation;
}

/**
 * Remove a connected account
 */
function removeConnectedAccount(accountId) {
    const data = loadSharedQuotaData();
    
    if (data.connectedAccounts[accountId]) {
        const account = data.connectedAccounts[accountId];
        account.isActive = false; // Mark as inactive rather than delete (history)
        
        saveSharedQuotaData(data);
        
        // Recalculate distribution without this account
        const allocation = recalculateQuotaAllocation();
        
        console.log(`[SHARED-QUOTA] Account removed: @${account.username} (${accountId})`);
        console.log(`[SHARED-QUOTA] New quota per account: ${allocation.perAccountQuota}`);
        
        return allocation;
    }
    
    return null;
}

/**
 * Check if an action is allowed for an account
 */
function canPerformSharedAction(accountId, actionType) {
    const data = loadSharedQuotaData();
    const account = data.connectedAccounts[accountId];
    
    if (!account || !account.isActive) {
        return { allowed: false, reason: 'Account not connected or inactive' };
    }
    
    // Check remaining global quota
    if (data.globalPack.remainingActions <= 0) {
        return { allowed: false, reason: 'Global pack exhausted' };
    }
    
    // Check quota per account
    if (account.actionsUsed >= data.allocation.perAccountQuota) {
        return { allowed: false, reason: 'Individual quota exhausted for this account' };
    }
    
    // Check global daily limit
    checkAndResetDailyQuotas(data);
    if (data.dailyQuotas.usedToday >= data.dailyQuotas.dailyLimit) {
        return { allowed: false, reason: 'Global daily limit reached' };
    }
    
    // Check daily limit per account
    const dailyUsedByAccount = Object.values(account.dailyUsed).reduce((sum, val) => sum + val, 0);
    if (dailyUsedByAccount >= data.allocation.perAccountDaily) {
        return { allowed: false, reason: 'Individual daily limit reached' };
    }
    
    // Check distribution by action type
    const dailyQuotaForAction = Math.floor(data.allocation.perAccountDaily * data.dailyQuotas.distribution[actionType] / 100);
    if (account.dailyUsed[actionType] >= dailyQuotaForAction) {
        return { allowed: false, reason: `Daily quota exhausted for ${actionType}` };
    }
    
    return { allowed: true };
}

/**
 * Consume an action for an account
 */
function consumeSharedAction(accountId, actionType) {
    const check = canPerformSharedAction(accountId, actionType);
    if (!check.allowed) {
        return { success: false, reason: check.reason };
    }
    
    const data = loadSharedQuotaData();
    const account = data.connectedAccounts[accountId];
    
    // Increment counters
    data.globalPack.usedActions += 1;
    data.globalPack.remainingActions -= 1;
    data.dailyQuotas.usedToday += 1;
    account.actionsUsed += 1;
    account.dailyUsed[actionType] = (account.dailyUsed[actionType] || 0) + 1;
    
    saveSharedQuotaData(data);
    
    console.log(`[SHARED-QUOTA] Action ${actionType} consumed by @${account.username}`);
    console.log(`[SHARED-QUOTA] Global remaining: ${data.globalPack.remainingActions}/${data.globalPack.totalActions}`);
    
    return { success: true };
}

/**
 * Check and reset daily quotas if necessary
 */
function checkAndResetDailyQuotas(data) {
    const today = new Date().toISOString().split('T')[0];
    
    if (data.dailyQuotas.lastReset !== today) {
        // New day: reset
        data.dailyQuotas.usedToday = 0;
        data.dailyQuotas.lastReset = today;
        
        // Reset daily counters for all accounts
        Object.values(data.connectedAccounts).forEach(account => {
            account.dailyUsed = { like: 0, retweet: 0, reply: 0 };
        });
        
        saveSharedQuotaData(data);
        console.log('[SHARED-QUOTA] Daily quotas reset');
    }
}

/**
 * Clean up disconnected accounts from quota management
 * This function checks which accounts are still actually connected
 * and marks others as inactive
 */
function cleanupDisconnectedAccounts(connectedAccountsList) {
    const data = loadSharedQuotaData();
    let hasChanges = false;
    
    // Create a Set of actually connected account IDs for fast lookup
    const activeAccountIds = new Set(connectedAccountsList.map(acc => acc.id));
    
    // Go through all accounts in quota management
    Object.keys(data.connectedAccounts).forEach(accountId => {
        const account = data.connectedAccounts[accountId];
        
        // If account was active but is no longer in connected list
        if (account.isActive && !activeAccountIds.has(accountId)) {
            account.isActive = false;
            account.disconnectedAt = new Date().toISOString();
            hasChanges = true;
            console.log(`[SHARED-QUOTA] Account @${account.username} marked as disconnected`);
        }
        // If account was inactive but is now reconnected
        else if (!account.isActive && activeAccountIds.has(accountId)) {
            account.isActive = true;
            account.reconnectedAt = new Date().toISOString();
            hasChanges = true;
            console.log(`[SHARED-QUOTA] Account @${account.username} marked as reconnected`);
        }
    });
    
    if (hasChanges) {
        saveSharedQuotaData(data);
        
        // Recalculate quota distribution with active accounts only
        const allocation = recalculateQuotaAllocation();
        
        console.log(`[SHARED-QUOTA] Cleanup completed - ${Object.values(data.connectedAccounts).filter(acc => acc.isActive).length} active accounts`);
        
        return {
            success: true,
            changes: hasChanges,
            activeAccounts: Object.values(data.connectedAccounts).filter(acc => acc.isActive).length,
            allocation
        };
    }
    
    return {
        success: true,
        changes: false,
        activeAccounts: Object.values(data.connectedAccounts).filter(acc => acc.isActive).length
    };
}

/**
 * Recalculate action counters from performed-actions.json history
 * @param {string} accountId - Account ID
 * @returns {Object} - { actionsUsed: number, dailyUsed: { like: number, retweet: number, reply: number } }
 */
function recalculateActionsFromHistory(accountId) {
    try {
        const performedActionsPath = path.join(__dirname, '..', 'performed-actions.json');
        
        if (!fs.existsSync(performedActionsPath)) {
            console.log(`[QUOTA-RECALC] performed-actions.json file not found`);
            return { actionsUsed: 0, dailyUsed: { like: 0, retweet: 0, reply: 0 } };
        }
        
        const performedActions = JSON.parse(fs.readFileSync(performedActionsPath, 'utf8'));
        
        let totalActions = 0;
        let dailyActions = { like: 0, retweet: 0, reply: 0 };
        
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        
        // Go through all tweets in history
        for (const tweetId in performedActions) {
            const tweetActions = performedActions[tweetId];
            
            // Check if this account performed actions on this tweet
            if (tweetActions[accountId]) {
                const accountActions = tweetActions[accountId];
                
                // Count each action type
                for (const actionType in accountActions) {
                    const actionValue = accountActions[actionType];
                    
                    // If it's a timestamp (string) or true (old format)
                    if (actionValue === true || (typeof actionValue === 'string' && actionValue.includes('T'))) {
                        totalActions++;
                        
                        // Check if action is from today
                        if (typeof actionValue === 'string' && actionValue.includes('T')) {
                            const actionDate = actionValue.split('T')[0];
                            if (actionDate === today) {
                                dailyActions[actionType] = (dailyActions[actionType] || 0) + 1;
                            }
                        } else if (actionValue === true) {
                            // For old format without timestamp, consider as today
                            dailyActions[actionType] = (dailyActions[actionType] || 0) + 1;
                        }
                    }
                }
            }
        }
        
        console.log(`[QUOTA-RECALC] Account ${accountId}: ${totalActions} total actions, ${JSON.stringify(dailyActions)} today`);
        
        return {
            actionsUsed: totalActions,
            dailyUsed: dailyActions
        };
        
    } catch (error) {
        console.error(`[QUOTA-RECALC] Recalculation error for ${accountId}:`, error);
        return { actionsUsed: 0, dailyUsed: { like: 0, retweet: 0, reply: 0 } };
    }
}

/**
 * Get list of active accounts for display with all necessary properties
 */
function getActiveAccountsForDisplay() {
    const data = loadSharedQuotaData();
    checkAndResetDailyQuotas(data);
    
    const activeAccounts = Object.entries(data.connectedAccounts)
        .filter(([id, acc]) => acc.isActive)
        .map(([id, acc]) => {
            // Recalculer dynamiquement les actions depuis l'historique
            const recalculatedActions = recalculateActionsFromHistory(id);
            const actionsUsed = recalculatedActions.actionsUsed;
            const dailyUsed = recalculatedActions.dailyUsed;
            const dailyTotal = Object.values(dailyUsed).reduce((sum, val) => sum + (val || 0), 0);
            
            const perAccountQuota = data.allocation?.perAccountQuota || 1000; // Default value
            const perAccountDaily = data.allocation?.perAccountDaily || 150; // Default value
            
            return {
                id,
                username: acc.username,
                authMethod: acc.authMethod,
                actionsUsed: actionsUsed,
                dailyUsed: dailyUsed,
                quotaRemaining: Math.max(0, perAccountQuota - actionsUsed),
                dailyRemaining: Math.max(0, perAccountDaily - dailyTotal),
                connectedAt: acc.connectedAt,
                lastActionAt: acc.lastActionAt,
                quotaUsage: perAccountQuota > 0 ? Math.round((actionsUsed / perAccountQuota) * 100) : 0
            };
        });
    
    return activeAccounts;
}



/**
 * Get complete shared quota statistics
 */
function getSharedQuotaStats() {
    const data = loadSharedQuotaData();
    checkAndResetDailyQuotas(data);
    
    const activeAccounts = Object.entries(data.connectedAccounts)
        .filter(([id, acc]) => acc.isActive)
        .map(([id, acc]) => {
            // Recalculer dynamiquement les actions depuis l'historique
            const recalculatedActions = recalculateActionsFromHistory(id);
            const actionsUsed = recalculatedActions.actionsUsed;
            const dailyUsed = recalculatedActions.dailyUsed;
            
            return {
                id,
                username: acc.username,
                authMethod: acc.authMethod,
                actionsUsed: actionsUsed,
                dailyUsed: dailyUsed,
                quotaRemaining: data.allocation.perAccountQuota - actionsUsed,
                dailyRemaining: data.allocation.perAccountDaily - Object.values(dailyUsed).reduce((sum, val) => sum + val, 0)
            };
        });
    
    return {
        globalPack: data.globalPack,
        dailyQuotas: data.dailyQuotas,
        allocation: data.allocation,
        activeAccounts,
        summary: {
            totalActiveAccounts: activeAccounts.length,
            globalUsagePercent: Math.round((data.globalPack.usedActions / data.globalPack.totalActions) * 100),
            dailyUsagePercent: Math.round((data.dailyQuotas.usedToday / data.dailyQuotas.dailyLimit) * 100)
        }
    };
}

/**
 * Update global pack (purchase of a new pack)
 */
function updateGlobalPack(totalActions, packType = 'premium', expiryDate = null) {
    const data = loadSharedQuotaData();
    
    data.globalPack = {
        totalActions,
        usedActions: 0,
        remainingActions: totalActions,
        purchaseDate: new Date().toISOString().split('T')[0],
        expiryDate,
        packType
    };
    
    // Reset counters for all accounts
    Object.values(data.connectedAccounts).forEach(account => {
        account.actionsUsed = 0;
        account.dailyUsed = { like: 0, retweet: 0, reply: 0 };
    });
    
    saveSharedQuotaData(data);
    
    // Recalculate distribution with new pack
    const allocation = recalculateQuotaAllocation();
    
    console.log(`[SHARED-QUOTA] New pack configured: ${totalActions} actions (${packType})`);
    console.log(`[SHARED-QUOTA] Quota per account: ${allocation.perAccountQuota}`);
    
    return allocation;
}

/**
 * Determine actions to perform for a tweet based on probabilities and quotas
 */
function determineActionsForTweet(accountId, tweetId) {
    const check = canPerformSharedAction(accountId, 'like'); // General check
    if (!check.allowed) {
        return {
            actions: [],
            reason: check.reason
        };
    }
    
    const actions = [];
    
    // Reply: 100% (mandatory if quota available)
    if (canPerformSharedAction(accountId, 'reply').allowed) {
        actions.push('reply');
    }
    
    // Like: 50% (random if quota available)
    if (Math.random() <= 0.5 && canPerformSharedAction(accountId, 'like').allowed) {
        actions.push('like');
    }
    
    // Retweet: 10% (random if quota available)
    if (Math.random() <= 0.1 && canPerformSharedAction(accountId, 'retweet').allowed) {
        actions.push('retweet');
    }
    
    return {
        actions: actions,
        reason: 'Actions determined based on probabilities and available quotas'
    };
}

/**
 * Calculate remaining actions for an account (compatibility)
 */
function calculateActionsLeftForAccount(accountId) {
    const stats = getSharedQuotaStats();
    const account = stats.activeAccounts.find(acc => acc.id === accountId);
    
    if (!account) {
        return { like: 0, retweet: 0, reply: 0 };
    }
    
    return {
        like: Math.max(0, account.dailyRemaining),
        retweet: Math.max(0, account.dailyRemaining), 
        reply: Math.max(0, account.dailyRemaining)
    };
}

/**
 * Manually reset daily quotas
 */
function resetDailyQuotas() {
    const data = loadSharedQuotaData();
    
    // Reset daily quotas for all accounts
    Object.keys(data.connectedAccounts).forEach(accountId => {
        if (data.connectedAccounts[accountId]) {
            data.connectedAccounts[accountId].dailyUsed = { like: 0, retweet: 0, reply: 0 };
            data.connectedAccounts[accountId].lastReset = new Date().toISOString().split('T')[0];
        }
    });
    
    // Reset global daily quotas
    data.dailyQuotas.usedToday = 0;
    data.dailyQuotas.lastReset = new Date().toISOString().split('T')[0];
    
    saveSharedQuotaData(data);
    console.log('[SHARED-QUOTA] Daily quotas manually reset');
    
    return data;
}

module.exports = {
    loadSharedQuotaData,
    saveSharedQuotaData,
    recalculateQuotaAllocation,
    addConnectedAccount,
    removeConnectedAccount,
    canPerformSharedAction,
    consumeSharedAction,
    getSharedQuotaStats,
    updateGlobalPack,
    resetDailyQuotas,
    checkAndResetDailyQuotas,
    cleanupDisconnectedAccounts,
    getActiveAccountsForDisplay,
    determineActionsForTweet,
    calculateActionsLeftForAccount
};
