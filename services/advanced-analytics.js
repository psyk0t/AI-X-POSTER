const fs = require('fs').promises;
const path = require('path');

/**
 * Service Analytics Avancé pour X-AutoRaider
 * Calcule des métriques de performance, comportementales et prédictives
 */
class AdvancedAnalytics {
    constructor() {
        this.performedActionsFile = path.join(process.cwd(), 'performed-actions.json');
        this.persistentHistoryFile = path.join(process.cwd(), 'actions-history-persistent.json');
        this.masterQuotaFile = path.join(process.cwd(), 'master-quota-config.json');
        this.logsFile = path.join(process.cwd(), 'auto-actions.log');
        
        // Cache pour éviter les recalculs fréquents
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Charge toutes les données nécessaires
     */
    async loadAllData() {
        try {
            const [performedActions, persistentHistory, masterQuota] = await Promise.all([
                this.loadJSON(this.performedActionsFile, {}),
                this.loadJSON(this.persistentHistoryFile, { accounts: {}, actions: {} }),
                this.loadJSON(this.masterQuotaFile, { connectedAccounts: {}, dailyQuotas: {} })
            ]);

            return { performedActions, persistentHistory, masterQuota };
        } catch (error) {
            console.error('[ANALYTICS] Erreur chargement données:', error);
            return { performedActions: {}, persistentHistory: { accounts: {}, actions: {} }, masterQuota: { connectedAccounts: {}, dailyQuotas: {} } };
        }
    }

    async loadJSON(filePath, defaultValue) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            return defaultValue;
        }
    }

    /**
     * MÉTRIQUES DE PERFORMANCE
     */
    async getPerformanceMetrics() {
        const cacheKey = 'performance_metrics';
        if (this.isCached(cacheKey)) return this.cache.get(cacheKey).data;

        const { performedActions, persistentHistory, masterQuota } = await this.loadAllData();
        
        // Calculer les métriques avec valeurs par défaut
        const conversionRates = this.calculateConversionRates(performedActions, persistentHistory);
        const accountEfficiency = this.calculateAccountEfficiency(masterQuota, persistentHistory);
        const velocity = this.calculateVelocity(persistentHistory);
        const quotaROI = this.calculateQuotaROI(masterQuota, persistentHistory);
        
        const metrics = {
            // Métriques simples pour l'interface
            conversionRate: Number(conversionRates.overall) || 0,
            accountEfficiency: this.getAverageEfficiency(accountEfficiency),
            velocity: this.getAverageVelocity(velocity),
            quotaROI: Number(quotaROI.overall) || 0,
            
            // Données détaillées
            detailed: {
                conversionRates,
                accountEfficiency,
                velocity,
                quotaROI
            }
        };

        this.setCache(cacheKey, metrics);
        return metrics;
    }

    calculateConversionRates(performedActions, persistentHistory) {
        const totalTweets = Object.keys(performedActions || {}).length;
        const totalActions = Object.values(performedActions || {}).reduce((sum, tweet) => {
            return sum + Object.keys(tweet || {}).length;
        }, 0);

        const actionTypes = { like: 0, retweet: 0, reply: 0 };
        
        Object.values(performedActions || {}).forEach(tweet => {
            Object.values(tweet || {}).forEach(account => {
                Object.keys(account || {}).forEach(actionType => {
                    if (actionTypes.hasOwnProperty(actionType)) {
                        actionTypes[actionType]++;
                    }
                });
            });
        });

        return {
            overall: totalTweets > 0 ? Number((totalActions / totalTweets).toFixed(2)) : 0,
            byType: {
                like: totalTweets > 0 ? Number((actionTypes.like / totalTweets).toFixed(2)) : 0,
                retweet: totalTweets > 0 ? Number((actionTypes.retweet / totalTweets).toFixed(2)) : 0,
                reply: totalTweets > 0 ? Number((actionTypes.reply / totalTweets).toFixed(2)) : 0
            }
        };
    }

    calculateAccountEfficiency(masterQuota, persistentHistory) {
        const efficiency = {};
        
        Object.entries(masterQuota.connectedAccounts || {}).forEach(([accountId, account]) => {
            const totalQuota = account.actionsUsed || 0;
            const successfulActions = this.getAccountSuccessfulActions(accountId, persistentHistory);
            
            efficiency[account.username || accountId] = {
                quotaUsed: totalQuota,
                successfulActions,
                efficiency: totalQuota > 0 ? (successfulActions / totalQuota * 100).toFixed(1) : 0,
                dailyUsage: account.dailyUsed || { like: 0, retweet: 0, reply: 0 }
            };
        });

        return efficiency;
    }

    getAccountSuccessfulActions(accountId, persistentHistory) {
        return persistentHistory.accounts?.[accountId]?.totalActions || 0;
    }

    calculateVelocity(persistentHistory) {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

        const velocity = {};
        
        Object.entries(persistentHistory.accounts || {}).forEach(([accountId, account]) => {
            const recentActions = this.getActionsInTimeRange(accountId, persistentHistory, oneHourAgo, now);
            const dailyActions = this.getActionsInTimeRange(accountId, persistentHistory, oneDayAgo, now);
            
            velocity[account.username || accountId] = {
                actionsPerHour: Number(recentActions) || 0,
                actionsPerDay: Number(dailyActions) || 0,
                lastAction: account.lastSeen || null
            };
        });

        return velocity;
    }

    getActionsInTimeRange(accountId, persistentHistory, startTime, endTime) {
        // Approximation basée sur les données disponibles
        const account = persistentHistory.accounts?.[accountId];
        if (!account) return 0;
        
        // Estimation simple basée sur les actions totales et la période
        const totalActions = account.totalActions || 0;
        const timeRangeHours = (endTime - startTime) / (1000 * 60 * 60);
        
        // Estimation: répartition uniforme sur 24h
        return Math.round(totalActions * (timeRangeHours / 24)) || 0;
    }

    calculateSuccessRates(performedActions, persistentHistory) {
        const totalAttempts = Object.keys(performedActions).length;
        const successfulActions = Object.values(performedActions).reduce((sum, tweet) => {
            return sum + Object.keys(tweet).length;
        }, 0);

        return {
            overall: totalAttempts > 0 ? (successfulActions / totalAttempts * 100).toFixed(1) : 0,
            byHour: this.calculateHourlySuccessRates(performedActions),
            trend: this.calculateSuccessTrend(performedActions)
        };
    }

    calculateHourlySuccessRates(performedActions) {
        const hourlyStats = {};
        
        Object.values(performedActions).forEach(tweet => {
            Object.values(tweet).forEach(account => {
                Object.entries(account).forEach(([actionType, timestamp]) => {
                    const hour = new Date(timestamp).getHours();
                    if (!hourlyStats[hour]) hourlyStats[hour] = { attempts: 0, successes: 0 };
                    hourlyStats[hour].attempts++;
                    hourlyStats[hour].successes++;
                });
            });
        });

        const rates = {};
        Object.entries(hourlyStats).forEach(([hour, stats]) => {
            rates[hour] = stats.attempts > 0 ? (stats.successes / stats.attempts * 100).toFixed(1) : 0;
        });

        return rates;
    }

    calculateSuccessTrend(performedActions) {
        const dailyStats = {};
        
        Object.values(performedActions).forEach(tweet => {
            Object.values(tweet).forEach(account => {
                Object.entries(account).forEach(([actionType, timestamp]) => {
                    const date = new Date(timestamp).toISOString().split('T')[0];
                    if (!dailyStats[date]) dailyStats[date] = 0;
                    dailyStats[date]++;
                });
            });
        });

        const sortedDays = Object.keys(dailyStats).sort();
        if (sortedDays.length < 2) return 0;

        const recent = dailyStats[sortedDays[sortedDays.length - 1]] || 0;
        const previous = dailyStats[sortedDays[sortedDays.length - 2]] || 0;
        
        return previous > 0 ? ((recent - previous) / previous * 100).toFixed(1) : 0;
    }

    calculateQuotaROI(masterQuota, persistentHistory) {
        const globalQuota = masterQuota.globalPack || {};
        const usedActions = globalQuota.usedActions || 0;
        const totalActions = Object.values(persistentHistory.accounts || {}).reduce((sum, account) => {
            return sum + (account.totalActions || 0);
        }, 0);

        return {
            quotaUtilization: globalQuota.totalActions > 0 ? (usedActions / globalQuota.totalActions * 100).toFixed(1) : 0,
            actionsPerQuota: usedActions > 0 ? (totalActions / usedActions).toFixed(2) : 0,
            remainingActions: globalQuota.remainingActions || 0,
            efficiency: usedActions > 0 ? (totalActions / usedActions * 100).toFixed(1) : 0
        };
    }

    /**
     * ANALYTICS COMPORTEMENTALES
     */
    async getBehavioralAnalytics() {
        const cacheKey = 'behavioral_analytics';
        if (this.isCached(cacheKey)) return this.cache.get(cacheKey).data;

        const { performedActions, persistentHistory, masterQuota } = await this.loadAllData();
        
        const analytics = {
            // Patterns d'activité
            activityPatterns: this.analyzeActivityPatterns(performedActions),
            
            // Heures optimales
            optimalTiming: this.calculateOptimalTiming(performedActions),
            
            // Analyse de fatigue des comptes
            accountFatigue: this.analyzeAccountFatigue(masterQuota, persistentHistory),
            
            // Tendances saisonnières
            seasonalTrends: this.analyzeSeasonalTrends(performedActions)
        };

        this.setCache(cacheKey, analytics);
        return analytics;
    }

    analyzeActivityPatterns(performedActions) {
        const patterns = {
            hourly: Array(24).fill(0),
            daily: Array(7).fill(0),
            peakHours: [],
            quietHours: []
        };

        Object.values(performedActions).forEach(tweet => {
            Object.values(tweet).forEach(account => {
                Object.values(account).forEach(timestamp => {
                    const date = new Date(timestamp);
                    const hour = date.getHours();
                    const dayOfWeek = date.getDay();
                    
                    patterns.hourly[hour]++;
                    patterns.daily[dayOfWeek]++;
                });
            });
        });

        // Identifier les heures de pointe et calmes
        const avgHourly = patterns.hourly.reduce((sum, count) => sum + count, 0) / 24;
        patterns.peakHours = patterns.hourly
            .map((count, hour) => ({ hour, count }))
            .filter(item => item.count > avgHourly * 1.5)
            .map(item => item.hour);
            
        patterns.quietHours = patterns.hourly
            .map((count, hour) => ({ hour, count }))
            .filter(item => item.count < avgHourly * 0.5)
            .map(item => item.hour);

        return patterns;
    }

    calculateOptimalTiming(performedActions) {
        const timing = {};
        
        Object.values(performedActions).forEach(tweet => {
            Object.values(tweet).forEach(account => {
                Object.entries(account).forEach(([actionType, timestamp]) => {
                    const hour = new Date(timestamp).getHours();
                    if (!timing[actionType]) timing[actionType] = Array(24).fill(0);
                    timing[actionType][hour]++;
                });
            });
        });

        // Calculer les heures optimales pour chaque type d'action
        const optimal = {};
        Object.entries(timing).forEach(([actionType, hourlyData]) => {
            const maxCount = Math.max(...hourlyData);
            const optimalHours = hourlyData
                .map((count, hour) => ({ hour, count }))
                .filter(item => item.count === maxCount)
                .map(item => item.hour);
                
            optimal[actionType] = optimalHours;
        });

        return optimal;
    }

    analyzeAccountFatigue(masterQuota, persistentHistory) {
        const fatigue = {};
        
        Object.entries(masterQuota.connectedAccounts || {}).forEach(([accountId, account]) => {
            const dailyUsed = account.dailyUsed || { like: 0, retweet: 0, reply: 0 };
            const totalDaily = Object.values(dailyUsed).reduce((sum, count) => sum + count, 0);
            const dailyLimit = masterQuota.dailyQuotas?.dailyLimit || 200;
            
            const fatigueScore = totalDaily / dailyLimit;
            let status = 'healthy';
            if (fatigueScore > 0.8) status = 'high_fatigue';
            else if (fatigueScore > 0.6) status = 'moderate_fatigue';
            else if (fatigueScore > 0.4) status = 'low_fatigue';
            
            fatigue[account.username || accountId] = {
                fatigueScore: (fatigueScore * 100).toFixed(1),
                status,
                dailyUsage: totalDaily,
                dailyLimit,
                recommendation: this.getFatigueRecommendation(fatigueScore)
            };
        });

        return fatigue;
    }

    getFatigueRecommendation(fatigueScore) {
        if (fatigueScore > 0.8) return 'Réduire l\'activité, risque de limitation';
        if (fatigueScore > 0.6) return 'Surveiller l\'usage, approche des limites';
        if (fatigueScore > 0.4) return 'Usage modéré, continuer prudemment';
        return 'Usage faible, peut augmenter l\'activité';
    }

    analyzeSeasonalTrends(performedActions) {
        const trends = {
            weekly: {},
            monthly: {},
            growth: {}
        };

        Object.values(performedActions).forEach(tweet => {
            Object.values(tweet).forEach(account => {
                Object.values(account).forEach(timestamp => {
                    const date = new Date(timestamp);
                    const weekKey = this.getWeekKey(date);
                    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    
                    trends.weekly[weekKey] = (trends.weekly[weekKey] || 0) + 1;
                    trends.monthly[monthKey] = (trends.monthly[monthKey] || 0) + 1;
                });
            });
        });

        // Calculer la croissance
        const weekKeys = Object.keys(trends.weekly).sort();
        if (weekKeys.length >= 2) {
            const currentWeek = trends.weekly[weekKeys[weekKeys.length - 1]] || 0;
            const previousWeek = trends.weekly[weekKeys[weekKeys.length - 2]] || 0;
            trends.growth.weekly = previousWeek > 0 ? ((currentWeek - previousWeek) / previousWeek * 100).toFixed(1) : 0;
        }

        return trends;
    }

    getWeekKey(date) {
        const year = date.getFullYear();
        const week = Math.ceil((date.getTime() - new Date(year, 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
        return `${year}-W${String(week).padStart(2, '0')}`;
    }

    /**
     * MÉTRIQUES DE QUALITÉ
     */
    async getQualityMetrics() {
        const cacheKey = 'quality_metrics';
        if (this.isCached(cacheKey)) return this.cache.get(cacheKey).data;

        const logs = await this.analyzeLogs();
        const { performedActions, persistentHistory } = await this.loadAllData();
        
        const metrics = {
            // Santé du système
            systemHealth: this.calculateSystemHealth(logs),
            
            // Qualité des actions
            actionQuality: this.calculateActionQuality(performedActions, logs),
            
            // Détection d'anomalies
            anomalies: this.detectAnomalies(logs, performedActions)
        };

        this.setCache(cacheKey, metrics);
        return metrics;
    }

    async analyzeLogs() {
        try {
            const logContent = await fs.readFile(this.logsFile, 'utf8');
            const lines = logContent.split('\n').filter(line => line.trim());
            
            const analysis = {
                errors: [],
                successes: [],
                timeouts: [],
                rateLimits: []
            };

            lines.forEach(line => {
                if (line.includes('ERROR') || line.includes('error')) {
                    analysis.errors.push(this.parseLogLine(line));
                } else if (line.includes('SUCCESS') || line.includes('Action consumed')) {
                    analysis.successes.push(this.parseLogLine(line));
                } else if (line.includes('timeout') || line.includes('TIMEOUT')) {
                    analysis.timeouts.push(this.parseLogLine(line));
                } else if (line.includes('429') || line.includes('rate limit')) {
                    analysis.rateLimits.push(this.parseLogLine(line));
                }
            });

            return analysis;
        } catch (error) {
            return { errors: [], successes: [], timeouts: [], rateLimits: [] };
        }
    }

    parseLogLine(line) {
        try {
            if (line.startsWith('{')) {
                return JSON.parse(line);
            } else {
                const timestampMatch = line.match(/\[([\d-T:.Z]+)\]/);
                return {
                    timestamp: timestampMatch ? timestampMatch[1] : new Date().toISOString(),
                    message: line
                };
            }
        } catch (error) {
            return {
                timestamp: new Date().toISOString(),
                message: line
            };
        }
    }

    calculateSystemHealth(logs) {
        const total = logs.errors.length + logs.successes.length;
        const errorRate = total > 0 ? Number((logs.errors.length / total * 100).toFixed(1)) : 0;
        
        let healthStatus = 'excellent';
        if (errorRate > 10) healthStatus = 'poor';
        else if (errorRate > 5) healthStatus = 'fair';
        else if (errorRate > 2) healthStatus = 'good';

        return {
            errorRate,
            healthStatus,
            totalErrors: logs.errors.length,
            totalSuccesses: logs.successes.length,
            timeouts: logs.timeouts.length,
            rateLimits: logs.rateLimits.length,
            uptime: this.calculateUptime(logs)
        };
    }

    calculateUptime(logs) {
        // Estimation basée sur l'activité dans les logs
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        const recentActivity = [...logs.successes, ...logs.errors].filter(log => {
            const logTime = new Date(log.timestamp);
            return logTime >= oneDayAgo;
        });

        // Estimation simple: si activité récente, uptime élevé
        return recentActivity.length > 0 ? '99.5%' : '0%';
    }

    calculateActionQuality(performedActions, logs) {
        const duplicates = this.detectDuplicateActions(performedActions);
        const relevanceScore = this.calculateRelevanceScore(logs);
        
        return {
            duplicateRate: duplicates.rate,
            duplicateActions: duplicates.actions,
            relevanceScore,
            actionDistribution: this.calculateActionDistribution(performedActions)
        };
    }

    detectDuplicateActions(performedActions) {
        const duplicates = [];
        const seen = new Set();
        
        Object.entries(performedActions).forEach(([tweetId, accounts]) => {
            Object.entries(accounts).forEach(([accountId, actions]) => {
                Object.keys(actions).forEach(actionType => {
                    const key = `${accountId}-${actionType}-${tweetId}`;
                    if (seen.has(key)) {
                        duplicates.push({ tweetId, accountId, actionType });
                    }
                    seen.add(key);
                });
            });
        });

        const totalActions = Object.values(performedActions).reduce((sum, accounts) => {
            return sum + Object.values(accounts).reduce((accSum, actions) => {
                return accSum + Object.keys(actions).length;
            }, 0);
        }, 0);

        return {
            rate: totalActions > 0 ? (duplicates.length / totalActions * 100).toFixed(1) : 0,
            actions: duplicates
        };
    }

    calculateRelevanceScore(logs) {
        // Score basé sur le ratio succès/erreurs et la diversité des actions
        const successCount = logs.successes.length;
        const errorCount = logs.errors.length;
        const total = successCount + errorCount;
        
        if (total === 0) return 0;
        
        const successRate = successCount / total;
        return Number((successRate * 100).toFixed(1)) || 0;
    }

    calculateActionDistribution(performedActions) {
        const distribution = { like: 0, retweet: 0, reply: 0 };
        
        Object.values(performedActions).forEach(accounts => {
            Object.values(accounts).forEach(actions => {
                Object.keys(actions).forEach(actionType => {
                    if (distribution.hasOwnProperty(actionType)) {
                        distribution[actionType]++;
                    }
                });
            });
        });

        return distribution;
    }

    detectAnomalies(logs, performedActions) {
        const anomalies = [];
        
        // Détection de pics d'erreurs
        const errorSpikes = this.detectErrorSpikes(logs.errors);
        if (errorSpikes.length > 0) {
            anomalies.push({
                type: 'error_spike',
                severity: 'high',
                description: `Pic d'erreurs détecté: ${errorSpikes.length} erreurs en peu de temps`,
                data: errorSpikes
            });
        }

        // Détection d'inactivité anormale
        const inactivityPeriods = this.detectInactivityPeriods(performedActions);
        if (inactivityPeriods.length > 0) {
            anomalies.push({
                type: 'inactivity',
                severity: 'medium',
                description: `Périodes d'inactivité détectées: ${inactivityPeriods.length}`,
                data: inactivityPeriods
            });
        }

        return anomalies;
    }

    detectErrorSpikes(errors) {
        // Grouper les erreurs par heure
        const hourlyErrors = {};
        errors.forEach(error => {
            const hour = new Date(error.timestamp).toISOString().slice(0, 13);
            hourlyErrors[hour] = (hourlyErrors[hour] || 0) + 1;
        });

        // Détecter les pics (plus de 5 erreurs par heure)
        return Object.entries(hourlyErrors)
            .filter(([hour, count]) => count > 5)
            .map(([hour, count]) => ({ hour, count }));
    }

    detectInactivityPeriods(performedActions) {
        const timestamps = [];
        Object.values(performedActions).forEach(accounts => {
            Object.values(accounts).forEach(actions => {
                Object.values(actions).forEach(timestamp => {
                    timestamps.push(new Date(timestamp));
                });
            });
        });

        timestamps.sort((a, b) => a - b);
        
        const inactivityPeriods = [];
        for (let i = 1; i < timestamps.length; i++) {
            const gap = timestamps[i] - timestamps[i - 1];
            const gapHours = gap / (1000 * 60 * 60);
            
            if (gapHours > 4) { // Plus de 4h sans activité
                inactivityPeriods.push({
                    start: timestamps[i - 1].toISOString(),
                    end: timestamps[i].toISOString(),
                    duration: `${gapHours.toFixed(1)}h`
                });
            }
        }

        return inactivityPeriods;
    }

    /**
     * RECOMMANDATIONS INTELLIGENTES
     */
    async getRecommendations() {
        try {
            const [performance, behavioral, quality] = await Promise.all([
                this.getPerformanceMetrics(),
                this.getBehavioralAnalytics(),
                this.getQualityMetrics()
            ]);

            const recommendations = [];

            // Recommandations basées sur la performance
            const conversionRate = Number(performance.conversionRate) || 0;
            if (conversionRate < 0.8) {
                recommendations.push({
                    type: 'performance',
                    priority: 'high',
                    title: 'Améliorer le taux de conversion',
                    description: `Taux de conversion actuel: ${(conversionRate * 100).toFixed(1)}%. Optimisation nécessaire.`,
                    action: 'Optimiser les délais entre actions et vérifier les limites de rate limiting.'
                });
            }

            // Recommandations basées sur l'efficacité
            const efficiency = Number(performance.accountEfficiency) || 0;
            if (efficiency < 0.5) {
                recommendations.push({
                    type: 'efficiency',
                    priority: 'medium',
                    title: 'Améliorer l\'efficacité des comptes',
                    description: `Efficacité moyenne: ${(efficiency * 100).toFixed(1)}%. Potentiel d'amélioration.`,
                    action: 'Analyser les comptes les moins performants et ajuster leur configuration.'
                });
            }

            // Recommandations basées sur la vélocité
            const velocity = Number(performance.velocity) || 0;
            if (velocity < 1) {
                recommendations.push({
                    type: 'velocity',
                    priority: 'low',
                    title: 'Augmenter la vélocité',
                    description: `Vélocité actuelle: ${velocity.toFixed(1)} actions/heure. Activité faible.`,
                    action: 'Considérer l\'augmentation de la fréquence des actions si les quotas le permettent.'
                });
            }

            // Recommandation par défaut si aucun problème détecté
            if (recommendations.length === 0) {
                recommendations.push({
                    type: 'status',
                    priority: 'low',
                    title: 'Système optimisé',
                    description: 'Toutes les métriques sont dans les normes acceptables.',
                    action: 'Continuer le monitoring régulier des performances.'
                });
            }

            return recommendations;
        } catch (error) {
            console.error('[ANALYTICS] Erreur lors de la génération des recommandations:', error);
            return [{
                type: 'error',
                priority: 'high',
                title: 'Erreur de génération des recommandations',
                description: 'Impossible de générer les recommandations automatiques.',
                action: 'Vérifier les données analytics et les logs système.'
            }];
        }
    }

    /**
     * UTILITAIRES DE CACHE
     */
    isCached(key) {
        const cached = this.cache.get(key);
        if (!cached) return false;
        return (Date.now() - cached.timestamp) < this.cacheTimeout;
    }

    setCache(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    // Nouvelles méthodes utilitaires
    getAverageEfficiency(accountEfficiency) {
        const efficiencies = Object.values(accountEfficiency || {});
        if (efficiencies.length === 0) return 0;
        
        const total = efficiencies.reduce((sum, acc) => {
            return sum + (Number(acc.efficiency) || 0);
        }, 0);
        
        return Number((total / efficiencies.length / 100).toFixed(3)) || 0;
    }
    
    getAverageVelocity(velocity) {
        const velocities = Object.values(velocity || {});
        if (velocities.length === 0) return 0;
        
        const total = velocities.reduce((sum, vel) => {
            return sum + (Number(vel.actionsPerHour) || 0);
        }, 0);
        
        return Number((total / velocities.length).toFixed(1)) || 0;
    }
    
    calculateQuotaROI(masterQuota, persistentHistory) {
        const totalQuotaUsed = Object.values(masterQuota.connectedAccounts || {}).reduce((sum, account) => {
            return sum + (Number(account.actionsUsed) || 0);
        }, 0);
        
        const totalSuccessfulActions = Object.values(persistentHistory.accounts || {}).reduce((sum, account) => {
            return sum + (Number(account.totalActions) || 0);
        }, 0);
        
        return {
            overall: totalQuotaUsed > 0 ? Number((totalSuccessfulActions / totalQuotaUsed).toFixed(3)) : 0,
            quotaUsed: totalQuotaUsed,
            successfulActions: totalSuccessfulActions
        };
    }

    clearCache() {
        this.cache.clear();
    }
}

// Export d'une instance singleton
module.exports = new AdvancedAnalytics();
