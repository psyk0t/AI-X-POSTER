const fs = require('fs');
const path = require('path');
const { logToFile } = require('./logs');

/**
 * 🎯 MASTER QUOTA MANAGER - SYSTÈME UNIFIÉ
 * 
 * Gère TOUT en un seul fichier :
 * - Configuration des quotas
 * - Probabilités d'actions
 * - Comptes connectés
 * - Allocation dynamique
 * - Statistiques d'usage
 */

const MASTER_QUOTA_FILE = path.join(__dirname, '..', 'master-quota-config.json');

class MasterQuotaManager {
    constructor() {
        this.data = this.loadData();
    }

    /**
     * Load master quota data
     */
    loadData() {
        try {
            if (fs.existsSync(MASTER_QUOTA_FILE)) {
                const data = JSON.parse(fs.readFileSync(MASTER_QUOTA_FILE, 'utf8'));
                
                // Check if daily reset is needed
                const today = new Date().toISOString().split('T')[0];
                if (data.dailyQuotas && data.dailyQuotas.lastReset !== today) {
                    logToFile(`[MASTER-QUOTA] Daily reset detected: ${data.dailyQuotas.lastReset} → ${today}`);
                    this.resetDailyQuotas(data);
                }
                
                // Auto-cleanup disconnected accounts
                this.cleanupDisconnectedAccounts(data);
                
                return data;
            }
        } catch (error) {
            logToFile(`[MASTER-QUOTA] Error loading data: ${error.message}`);
        }
        
        return this.createDefaultData();
    }

    /**
     * Save master quota data
     */
    saveData() {
        try {
            fs.writeFileSync(MASTER_QUOTA_FILE, JSON.stringify(this.data, null, 2));
            return true;
        } catch (error) {
            logToFile(`[MASTER-QUOTA] Error saving data: ${error.message}`);
            return false;
        }
    }

    /**
     * Create default data structure
     */
    createDefaultData() {
        return {
            version: "2.0.0",
            deployedBy: "Developer",
            deployedAt: new Date().toISOString(),
            clientId: "psyk0t-raid-client",
            
            globalPack: {
                totalActions: 1000,
                usedActions: 0,
                remainingActions: 1000,
                purchaseDate: new Date().toISOString().split('T')[0],
                expiryDate: null,
                packType: "premium"
            },
            
            dailyQuotas: {
                dailyLimit: 300,
                usedToday: 0,
                lastReset: new Date().toISOString().split('T')[0],
                distribution: {
                    like: 0,
                    retweet: 0,
                    reply: 0
                }
            },
            
            actionProbabilities: {
                reply: 1.0,
                like: 0.3,
                retweet: 0.05
            },
            
            connectedAccounts: {},
            
            allocation: {
                perAccountQuota: 0,
                perAccountDaily: 0,
                lastRecalculation: new Date().toISOString()
            },
            
            restrictions: {
                clientCanModify: true,
                adminCanModify: true,
                onlyDeveloperCanModify: false
            }
        };
    }

    /**
     * Reset daily quotas
     */
    resetDailyQuotas(data = null) {
        const targetData = data || this.data;
        const today = new Date().toISOString().split('T')[0];
        
        targetData.dailyQuotas.usedToday = 0;
        targetData.dailyQuotas.lastReset = today;
        targetData.dailyQuotas.distribution = {
            like: 0,
            retweet: 0,
            reply: 0
        };
        
        // Reset daily usage for all accounts
        Object.keys(targetData.connectedAccounts).forEach(accountId => {
            targetData.connectedAccounts[accountId].dailyUsed = {
                like: 0,
                retweet: 0,
                reply: 0
            };
        });
        
        this.saveData();
        logToFile(`[MASTER-QUOTA] Daily quotas reset for ${today}`);
    }

    /**
     * Add or update connected account
     */
    addAccount(accountId, username, authMethod = 'oauth2') {
        if (!this.data.connectedAccounts[accountId]) {
            this.data.connectedAccounts[accountId] = {
                username: username,
                authMethod: authMethod,
                connectedAt: new Date().toISOString(),
                actionsUsed: 0,
                dailyUsed: {
                    like: 0,
                    retweet: 0,
                    reply: 0
                },
                isActive: true,
                lastReset: new Date().toISOString().split('T')[0]
            };
            
            logToFile(`[MASTER-QUOTA] New account added: ${username} (${accountId})`);
        } else {
            this.data.connectedAccounts[accountId].isActive = true;
            this.data.connectedAccounts[accountId].username = username;
            logToFile(`[MASTER-QUOTA] Account reactivated: ${username} (${accountId})`);
        }
        
        this.recalculateAllocation();
        this.saveData();
        
        return this.data.connectedAccounts[accountId];
    }

    /**
     * Deactivate account
     */
    deactivateAccount(accountId) {
        if (this.data.connectedAccounts[accountId]) {
            this.data.connectedAccounts[accountId].isActive = false;
            this.data.connectedAccounts[accountId].disconnectedAt = new Date().toISOString();
            
            logToFile(`[MASTER-QUOTA] Account deactivated: ${accountId}`);
            
            this.recalculateAllocation();
            this.saveData();
            
            return true;
        }
        
        return false;
    }

    /**
     * Recalculate allocation between active accounts
     */
    recalculateAllocation() {
        const activeAccounts = Object.values(this.data.connectedAccounts).filter(acc => acc.isActive);
        const activeCount = activeAccounts.length;
        
        if (activeCount === 0) {
            this.data.allocation = {
                perAccountQuota: 0,
                perAccountDaily: 0,
                lastRecalculation: new Date().toISOString()
            };
        } else {
            const globalRemaining = this.data.globalPack.remainingActions;
            const perAccountQuota = Math.floor(globalRemaining / activeCount);
            const perAccountDaily = Math.floor(this.data.dailyQuotas.dailyLimit / activeCount);
            
            this.data.allocation = {
                perAccountQuota: perAccountQuota,
                perAccountDaily: perAccountDaily,
                lastRecalculation: new Date().toISOString()
            };
            
            logToFile(`[MASTER-QUOTA] Allocation recalculated: ${activeCount} active accounts`);
            logToFile(`[MASTER-QUOTA] Per account quota: ${perAccountQuota} actions`);
            logToFile(`[MASTER-QUOTA] Per account daily: ${perAccountDaily} actions`);
        }
        
        return this.data.allocation;
    }

    /**
     * Check if account can perform action
     */
    canPerformAction(accountId) {
        // Recharger les données pour avoir les dernières modifications
        this.data = this.loadData();
        
        const account = this.data.connectedAccounts[accountId];
        if (!account || !account.isActive) {
            return {
                allowed: false,
                reason: 'Account not found or inactive',
                globalRemaining: 0,
                dailyRemaining: 0
            };
        }
        
        // Check global quota
        if (this.data.globalPack.remainingActions <= 0) {
            return {
                allowed: false,
                reason: 'Global quota exhausted',
                globalRemaining: 0,
                dailyRemaining: this.data.allocation.perAccountDaily - Object.values(account.dailyUsed).reduce((sum, val) => sum + val, 0)
            };
        }
        
        // Check daily quota
        const accountDailyUsed = Object.values(account.dailyUsed).reduce((sum, val) => sum + val, 0);
        if (this.data.dailyQuotas.usedToday >= this.data.dailyQuotas.dailyLimit) {
            return {
                allowed: false,
                reason: 'Daily quota exhausted',
                globalRemaining: this.data.allocation.perAccountQuota - account.actionsUsed,
                dailyRemaining: 0
            };
        }
        
        if (accountDailyUsed >= this.data.allocation.perAccountDaily) {
            return {
                allowed: false,
                reason: 'Account daily quota exhausted',
                globalRemaining: this.data.allocation.perAccountQuota - account.actionsUsed,
                dailyRemaining: 0
            };
        }
        
        return {
            allowed: true,
            reason: 'Action allowed',
            globalRemaining: this.data.allocation.perAccountQuota - account.actionsUsed,
            dailyRemaining: this.data.allocation.perAccountDaily - accountDailyUsed
        };
    }

    /**
     * Consume action for account
     */
    consumeAction(accountId, actionType = 'unknown') {
        const check = this.canPerformAction(accountId);
        if (!check.allowed) {
            logToFile(`[MASTER-QUOTA] Action refused for ${accountId}: ${check.reason}`);
            return {
                success: false,
                reason: check.reason,
                remaining: check
            };
        }
        
        const account = this.data.connectedAccounts[accountId];
        const now = new Date().toISOString();
        
        // Update counters
        this.data.globalPack.usedActions += 1;
        this.data.globalPack.remainingActions -= 1;
        
        this.data.dailyQuotas.usedToday += 1;
        this.data.dailyQuotas.distribution[actionType] = (this.data.dailyQuotas.distribution[actionType] || 0) + 1;
        
        account.actionsUsed += 1;
        account.dailyUsed[actionType] = (account.dailyUsed[actionType] || 0) + 1;
        account.lastAction = now;
        
        this.saveData();
        
        logToFile(`[MASTER-QUOTA] Action consumed: ${actionType} by ${account.username} (${accountId})`);
        logToFile(`[MASTER-QUOTA] Global remaining: ${this.data.globalPack.remainingActions}`);
        logToFile(`[MASTER-QUOTA] Daily remaining: ${this.data.dailyQuotas.dailyLimit - this.data.dailyQuotas.usedToday}`);
        
        return {
            success: true,
            reason: 'Action consumed successfully',
            remaining: {
                globalRemaining: this.data.allocation.perAccountQuota - account.actionsUsed,
                dailyRemaining: this.data.allocation.perAccountDaily - Object.values(account.dailyUsed).reduce((sum, val) => sum + val, 0)
            }
        };
    }

    /**
     * Determine actions for tweet based on probabilities
     */
    determineActionsForTweet(accountId, tweetId) {
        const check = this.canPerformAction(accountId);
        if (!check.allowed) {
            return {
                actions: [],
                reason: check.reason
            };
        }
        
        const actions = [];
        const probabilities = this.data.actionProbabilities;
        
        // Reply: based on probability
        if (Math.random() <= probabilities.reply) {
            actions.push('reply');
        }
        
        // Like: based on probability
        if (Math.random() <= probabilities.like) {
            actions.push('like');
        }
        
        // Retweet: based on probability
        if (Math.random() <= probabilities.retweet) {
            actions.push('retweet');
        }
        
        // Limit actions based on remaining quotas
        const maxActions = Math.min(actions.length, check.dailyRemaining);
        const finalActions = actions.slice(0, maxActions);
        
        logToFile(`[MASTER-QUOTA] Actions determined for tweet ${tweetId}: ${finalActions.join(', ')}`);
        
        return {
            actions: finalActions,
            reason: 'Actions determined by probabilities',
            quotaCheck: check
        };
    }

    /**
     * Get current stats
     */
    getStats() {
        // Recharger les données pour avoir les dernières modifications
        this.data = this.loadData();
        return {
            config: {
                version: this.data.version,
                clientId: this.data.clientId,
                actionProbabilities: this.data.actionProbabilities
            },
            globalPack: this.data.globalPack,
            dailyQuotas: this.data.dailyQuotas,
            allocation: this.data.allocation,
            activeAccounts: Object.entries(this.data.connectedAccounts)
                .filter(([id, acc]) => acc.isActive)
                .map(([id, acc]) => ({
                    id: id,
                    username: acc.username,
                    authMethod: acc.authMethod,
                    actionsUsed: acc.actionsUsed,
                    dailyUsed: acc.dailyUsed,
                    globalRemaining: this.data.allocation.perAccountQuota - acc.actionsUsed,
                    dailyRemaining: this.data.allocation.perAccountDaily - Object.values(acc.dailyUsed).reduce((sum, val) => sum + val, 0),
                    lastAction: acc.lastAction,
                    connectedAt: acc.connectedAt
                }))
        };
    }

    /**
     * Update global pack
     */
    updateGlobalPack(totalActions, packType = 'premium', expiryDate = null) {
        const usedActions = this.data.globalPack.usedActions;
        
        this.data.globalPack = {
            totalActions: totalActions,
            usedActions: usedActions,
            remainingActions: totalActions - usedActions,
            purchaseDate: new Date().toISOString().split('T')[0],
            expiryDate: expiryDate,
            packType: packType
        };
        
        this.recalculateAllocation();
        this.saveData();
        
        logToFile(`[MASTER-QUOTA] Global pack updated: ${totalActions} actions (${packType})`);
        
        return this.data.globalPack;
    }

    /**
     * Update action probabilities
     */
    updateActionProbabilities(reply = null, like = null, retweet = null) {
        if (reply !== null) this.data.actionProbabilities.reply = reply;
        if (like !== null) this.data.actionProbabilities.like = like;
        if (retweet !== null) this.data.actionProbabilities.retweet = retweet;
        
        this.saveData();
        
        logToFile(`[MASTER-QUOTA] Action probabilities updated: reply=${this.data.actionProbabilities.reply}, like=${this.data.actionProbabilities.like}, retweet=${this.data.actionProbabilities.retweet}`);
        
        return this.data.actionProbabilities;
    }

    /**
     * Update daily limit
     */
    updateDailyLimit(newLimit) {
        this.data.dailyQuotas.dailyLimit = newLimit;
        this.recalculateAllocation();
        this.saveData();
        
        logToFile(`[MASTER-QUOTA] Daily limit updated: ${newLimit} actions/day`);
        
        return this.data.dailyQuotas;
    }

    /**
     * Cleanup disconnected accounts automatically
     */
    cleanupDisconnectedAccounts(data = null) {
        const targetData = data || this.data;
        let hasChanges = false;
        
        try {
            // Get currently connected accounts by checking OAuth files directly
            const connectedAccountsList = this.getActiveConnectedAccounts();
            const activeAccountIds = new Set(connectedAccountsList.map(acc => acc.id));
            
            logToFile(`[MASTER-QUOTA] Checking ${connectedAccountsList.length} actually connected accounts`);
            
            // Check each account in quota config
            Object.keys(targetData.connectedAccounts).forEach(accountId => {
                const account = targetData.connectedAccounts[accountId];
                
                // If account was active but is no longer connected
                if (account.isActive && !activeAccountIds.has(accountId)) {
                    account.isActive = false;
                    account.disconnectedAt = new Date().toISOString();
                    hasChanges = true;
                    logToFile(`[MASTER-QUOTA] Account @${account.username} auto-deactivated (disconnected)`);
                }
                // If account was inactive but is now reconnected
                else if (!account.isActive && activeAccountIds.has(accountId)) {
                    account.isActive = true;
                    account.reconnectedAt = new Date().toISOString();
                    hasChanges = true;
                    logToFile(`[MASTER-QUOTA] Account @${account.username} auto-reactivated (reconnected)`);
                }
            });
            
            if (hasChanges) {
                this.recalculateAllocation();
                this.saveData();
                logToFile(`[MASTER-QUOTA] Auto-cleanup completed - ${Object.values(targetData.connectedAccounts).filter(acc => acc.isActive).length} active accounts`);
            }
            
        } catch (error) {
            logToFile(`[MASTER-QUOTA] Auto-cleanup error: ${error.message}`);
        }
    }

    /**
     * Get actually connected accounts by checking OAuth files directly
     */
    getActiveConnectedAccounts() {
        const connectedAccounts = [];
        
        try {
            // Check OAuth 2.0 users file
            const oauth2UsersPath = path.join(__dirname, '..', 'oauth2-users.json');
            if (fs.existsSync(oauth2UsersPath)) {
                const oauth2Users = JSON.parse(fs.readFileSync(oauth2UsersPath, 'utf8'));
                
                // Handle both array and object formats
                if (Array.isArray(oauth2Users)) {
                    oauth2Users.forEach(userEntry => {
                        if (Array.isArray(userEntry) && userEntry.length === 2) {
                            const [userId, user] = userEntry;
                            // Only count users with valid tokens and not requiring reconnection
                            if (user.accessToken && !user.requiresReconnection && user.isActive !== false) {
                                connectedAccounts.push({
                                    id: userId,
                                    username: user.username,
                                    authMethod: 'oauth2'
                                });
                            }
                        }
                    });
                } else {
                    // Object format
                    Object.entries(oauth2Users).forEach(([userId, user]) => {
                        if (user.accessToken && !user.requiresReconnection && user.isActive !== false) {
                            connectedAccounts.push({
                                id: userId,
                                username: user.username,
                                authMethod: 'oauth2'
                            });
                        }
                    });
                }
            }
            
            // Check OAuth 1.0a accounts (watch-accounts.json) - but these are just watched accounts, not connected ones
            // Skip this for now as watch-accounts.json contains accounts to watch, not connected accounts
            
            logToFile(`[MASTER-QUOTA] Found ${connectedAccounts.length} actually connected accounts`);
            connectedAccounts.forEach(acc => {
                logToFile(`[MASTER-QUOTA]   - @${acc.username} (${acc.authMethod})`);
            });
            
        } catch (error) {
            logToFile(`[MASTER-QUOTA] Error reading connected accounts: ${error.message}`);
        }
        
        return connectedAccounts;
    }
}

// Singleton instance
let masterQuotaInstance = null;

function getMasterQuotaManager() {
    if (!masterQuotaInstance) {
        masterQuotaInstance = new MasterQuotaManager();
    }
    return masterQuotaInstance;
}

module.exports = {
    MasterQuotaManager,
    getMasterQuotaManager
};
