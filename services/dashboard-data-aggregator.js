const fs = require('fs').promises;
const path = require('path');

class DashboardDataAggregator {
    constructor() {
        this.dataPath = process.cwd();
    }

    async loadJsonFile(filename) {
        try {
            const filePath = path.join(this.dataPath, filename);
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error(`[DASHBOARD] Erreur chargement ${filename}:`, error.message);
            return null;
        }
    }

    async getQuotasData() {
        const { getMasterQuotaManager } = require('./master-quota-manager');
        const masterQuota = getMasterQuotaManager();
        const sharedStats = masterQuota.getStats();

        return {
            global: {
                total: sharedStats.globalPack.totalActions,
                used: sharedStats.globalPack.usedActions,
                remaining: sharedStats.globalPack.remainingActions,
                dailyLimit: sharedStats.dailyQuotas.dailyLimit,
                dailyUsed: sharedStats.dailyQuotas.usedToday,
                dailyRemaining: sharedStats.dailyQuotas.dailyLimit - sharedStats.dailyQuotas.usedToday
            },
            accounts: sharedStats.activeAccounts || []
        };
    }

    async getConnectedAccounts() {
        try {
            // Utiliser le gestionnaire OAuth2 qui sait déchiffrer les données
            const { getOAuth2Manager } = require('./oauth2-manager');
            const oauth2Manager = getOAuth2Manager();
            const oauth2Users = oauth2Manager.getAllUsers();
            
            const accounts = [];
            
            if (oauth2Users && Array.isArray(oauth2Users)) {
                for (const userData of oauth2Users) {
                    // Déterminer si le compte est actif basé sur l'expiration du token
                    let isActive = true;
                    if (userData.expiresAt) {
                        const expirationTime = new Date(userData.expiresAt);
                        const now = new Date();
                        isActive = expirationTime > now; // Actif si le token n'est pas expiré
                    }
                    
                    accounts.push({
                        id: userData.id,
                        username: userData.username,
                        name: userData.name,
                        connectedAt: userData.connectedAt,
                        expiresAt: userData.expiresAt,
                        isActive: isActive,
                        authMethod: userData.authMethod || 'oauth2',
                        scopes: userData.scopes,
                        scopesGranted: userData.scopesGranted,
                        accessToken: userData.accessToken
                    });
                }
            }
            
            return accounts;
        } catch (error) {
            console.error('[DASHBOARD] Erreur chargement comptes OAuth2:', error.message);
            return [];
        }
    }

    async getActionsHistory() {
        const performedActions = await this.loadJsonFile('performed-actions.json');
        if (!performedActions) return { total: 0, byAccount: {}, byType: {}, today: {} };

        const today = new Date().toISOString().split('T')[0];
        const stats = {
            total: 0,
            byAccount: {},
            byType: { like: 0, reply: 0, retweet: 0 },
            today: { total: 0, byAccount: {}, byType: { like: 0, reply: 0, retweet: 0 } }
        };

        for (const [tweetId, accounts] of Object.entries(performedActions)) {
            for (const [accountId, actions] of Object.entries(accounts)) {
                if (!stats.byAccount[accountId]) {
                    stats.byAccount[accountId] = { like: 0, reply: 0, retweet: 0, total: 0 };
                }
                if (!stats.today.byAccount[accountId]) {
                    stats.today.byAccount[accountId] = { like: 0, reply: 0, retweet: 0, total: 0 };
                }

                for (const [actionType, timestamp] of Object.entries(actions)) {
                    if (typeof timestamp === 'string' && timestamp.includes('T')) {
                        const actionDate = timestamp.split('T')[0];
                        
                        // Total stats
                        stats.total++;
                        stats.byAccount[accountId][actionType]++;
                        stats.byAccount[accountId].total++;
                        stats.byType[actionType]++;

                        // Today stats
                        if (actionDate === today) {
                            stats.today.total++;
                            stats.today.byAccount[accountId][actionType]++;
                            stats.today.byAccount[accountId].total++;
                            stats.today.byType[actionType]++;
                        }
                    } else if (timestamp === true) {
                        // Actions sans timestamp (anciennes)
                        stats.total++;
                        stats.byAccount[accountId][actionType]++;
                        stats.byAccount[accountId].total++;
                        stats.byType[actionType]++;
                    }
                }
            }
        }

        return stats;
    }

    async getScheduledActions() {
        const schedulerData = await this.loadJsonFile('scheduler-data.json');
        
        return {
            queue: schedulerData?.scheduledActionsQueue || [],
            queueLength: schedulerData?.scheduledActionsQueue?.length || 0,
            config: schedulerData?.config || {},
            patterns: schedulerData?.engagementPatterns || {}
        };
    }

    async getDashboardData() {
        try {
            const [quotas, accounts, actions, scheduled] = await Promise.all([
                this.getQuotasData(),
                this.getConnectedAccounts(),
                this.getActionsHistory(),
                this.getScheduledActions()
            ]);

            return {
                success: true,
                timestamp: new Date().toISOString(),
                data: {
                    quotas,
                    accounts,
                    actions,
                    scheduled,
                    summary: {
                        totalAccounts: accounts.length,
                        activeAccounts: accounts.filter(a => a.isActive).length,
                        totalActionsPerformed: actions.total,
                        actionsToday: actions.today.total,
                        scheduledActions: scheduled.queueLength
                    }
                }
            };
        } catch (error) {
            console.error('[DASHBOARD] Erreur agrégation données:', error);
            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = new DashboardDataAggregator();
