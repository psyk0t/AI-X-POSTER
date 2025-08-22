const fs = require('fs').promises;
const path = require('path');

class AccountActivityTracker {
    constructor() {
        this.dataPath = process.cwd();
    }

    async loadJsonFile(filename) {
        try {
            const filePath = path.join(this.dataPath, filename);
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error(`[ACTIVITY_TRACKER] Erreur chargement ${filename}:`, error.message);
            return null;
        }
    }

    async getAccountPerformance(accountId) {
        const performedActions = await this.loadJsonFile('performed-actions.json');
        const quotasPerAccount = await this.loadJsonFile('quotas-per-account.json');
        
        if (!performedActions || !quotasPerAccount) return null;

        const accountQuotas = quotasPerAccount.accounts[accountId];
        const today = new Date().toISOString().split('T')[0];
        
        const performance = {
            accountId,
            quotas: accountQuotas,
            actions: {
                total: { like: 0, reply: 0, retweet: 0, count: 0 },
                today: { like: 0, reply: 0, retweet: 0, count: 0 },
                lastWeek: { like: 0, reply: 0, retweet: 0, count: 0 }
            },
            targets: new Set(),
            timeline: []
        };

        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoStr = weekAgo.toISOString().split('T')[0];

        for (const [tweetId, accounts] of Object.entries(performedActions)) {
            if (accounts[accountId]) {
                const actions = accounts[accountId];
                
                for (const [actionType, timestamp] of Object.entries(actions)) {
                    if (typeof timestamp === 'string' && timestamp.includes('T')) {
                        const actionDate = timestamp.split('T')[0];
                        
                        // Total
                        performance.actions.total[actionType]++;
                        performance.actions.total.count++;
                        
                        // Aujourd'hui
                        if (actionDate === today) {
                            performance.actions.today[actionType]++;
                            performance.actions.today.count++;
                        }
                        
                        // Semaine passée
                        if (actionDate >= weekAgoStr) {
                            performance.actions.lastWeek[actionType]++;
                            performance.actions.lastWeek.count++;
                        }
                        
                        // Timeline
                        performance.timeline.push({
                            tweetId,
                            actionType,
                            timestamp,
                            date: actionDate
                        });
                    } else if (timestamp === true) {
                        performance.actions.total[actionType]++;
                        performance.actions.total.count++;
                    }
                }
            }
        }

        // Trier timeline par timestamp
        performance.timeline.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        return performance;
    }

    async getAllAccountsActivity() {
        const oauth2Users = await this.loadJsonFile('oauth2-users.json');
        const activities = [];
        
        if (oauth2Users && Array.isArray(oauth2Users)) {
            for (const [accountId, userData] of oauth2Users) {
                const performance = await this.getAccountPerformance(accountId);
                if (performance) {
                    activities.push({
                        ...performance,
                        username: userData.username,
                        name: userData.name,
                        connectedAt: userData.connectedAt
                    });
                }
            }
        }
        
        return activities;
    }

    async getTopPerformers(limit = 5) {
        const activities = await this.getAllAccountsActivity();
        
        return activities
            .sort((a, b) => b.actions.total.count - a.actions.total.count)
            .slice(0, limit);
    }

    async getRecentActivity(hours = 24) {
        const performedActions = await this.loadJsonFile('performed-actions.json');
        const oauth2Users = await this.loadJsonFile('oauth2-users.json');
        
        if (!performedActions || !oauth2Users) return [];

        const usersMap = new Map();
        if (Array.isArray(oauth2Users)) {
            for (const [accountId, userData] of oauth2Users) {
                usersMap.set(accountId, userData);
            }
        }

        const cutoffTime = new Date();
        cutoffTime.setHours(cutoffTime.getHours() - hours);
        
        const recentActions = [];
        
        for (const [tweetId, accounts] of Object.entries(performedActions)) {
            for (const [accountId, actions] of Object.entries(accounts)) {
                for (const [actionType, timestamp] of Object.entries(actions)) {
                    if (typeof timestamp === 'string' && timestamp.includes('T')) {
                        const actionTime = new Date(timestamp);
                        if (actionTime >= cutoffTime) {
                            const userData = usersMap.get(accountId);
                            recentActions.push({
                                tweetId,
                                accountId,
                                username: userData?.username || 'Unknown',
                                actionType,
                                timestamp,
                                timeAgo: this.getTimeAgo(actionTime)
                            });
                        }
                    }
                }
            }
        }
        
        return recentActions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    getTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        
        if (diffMins < 60) {
            return `${diffMins}min`;
        } else if (diffHours < 24) {
            return `${diffHours}h`;
        } else {
            const diffDays = Math.floor(diffHours / 24);
            return `${diffDays}j`;
        }
    }
}

module.exports = new AccountActivityTracker();
