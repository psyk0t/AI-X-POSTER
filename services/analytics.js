const fs = require('fs').promises;
const path = require('path');
const { logToFile } = require('./logs-optimized');
const { getCacheInstance } = require('./cache');

/**
 * Service d'analytics avancé pour X-AutoRaider
 * Responsabilités :
 * - Collecte et agrégation des métriques
 * - Analyse des performances par compte Twitter
 * - Tendances temporelles et statistiques
 * - Génération de rapports détaillés
 * - Cache des données pour performance
 */
class AnalyticsService {
    constructor() {
        this.cache = getCacheInstance();
        this.initialized = false;
        this.dataFile = path.join(__dirname, '..', 'analytics-data.json');
        this.metricsBuffer = [];
        this.flushInterval = null;
        
        // Configuration des métriques
        this.metrics = {
            // Métriques d'actions
            actions: {
                likes: { total: 0, today: 0, thisHour: 0 },
                retweets: { total: 0, today: 0, thisHour: 0 },
                comments: { total: 0, today: 0, thisHour: 0 },
                total: { total: 0, today: 0, thisHour: 0 }
            },
            
            // Métriques par compte
            accounts: {},
            
            // Métriques temporelles
            hourly: {},
            daily: {},
            
            // Métriques de performance
            performance: {
                successRate: 0,
                averageResponseTime: 0,
                errorCount: 0,
                apiCalls: 0
            },
            
            // Métriques de quotas
            quotas: {
                usage: {},
                limits: {},
                efficiency: 0
            }
        };
    }

    /**
     * Initialise le service d'analytics
     */
    async initialize() {
        try {
            await this.loadData();
            this.startPeriodicFlush();
            this.initialized = true;
            logToFile('[ANALYTICS] Service d\'analytics initialisé avec succès');
            return true;
        } catch (error) {
            logToFile(`[ANALYTICS] Erreur d'initialisation: ${error.message}`);
            return false;
        }
    }

    /**
     * Enregistre une action effectuée
     * @param {object} actionData - Données de l'action
     */
    async recordAction(actionData) {
        if (!this.initialized) return;

        try {
            const { type, accountId, tweetId, timestamp, success, responseTime } = actionData;
            const now = new Date();
            const hour = now.getHours();
            const day = now.toISOString().split('T')[0];

            // Mise à jour des métriques d'actions
            if (success) {
                this.metrics.actions[type].total++;
                this.metrics.actions[type].today++;
                this.metrics.actions[type].thisHour++;
                this.metrics.actions.total.total++;
                this.metrics.actions.total.today++;
                this.metrics.actions.total.thisHour++;
            }

            // Mise à jour des métriques par compte
            if (!this.metrics.accounts[accountId]) {
                this.metrics.accounts[accountId] = {
                    likes: 0, retweets: 0, comments: 0, total: 0,
                    successRate: 0, lastAction: null, errors: 0
                };
            }
            
            if (success) {
                this.metrics.accounts[accountId][type]++;
                this.metrics.accounts[accountId].total++;
            } else {
                this.metrics.accounts[accountId].errors++;
            }
            this.metrics.accounts[accountId].lastAction = timestamp;

            // Mise à jour des métriques temporelles
            if (!this.metrics.hourly[hour]) {
                this.metrics.hourly[hour] = { likes: 0, retweets: 0, comments: 0, total: 0 };
            }
            if (!this.metrics.daily[day]) {
                this.metrics.daily[day] = { likes: 0, retweets: 0, comments: 0, total: 0 };
            }

            if (success) {
                this.metrics.hourly[hour][type]++;
                this.metrics.hourly[hour].total++;
                this.metrics.daily[day][type]++;
                this.metrics.daily[day].total++;
            }

            // Mise à jour des métriques de performance
            this.updatePerformanceMetrics(success, responseTime);

            // Ajout au buffer pour flush périodique
            this.metricsBuffer.push({
                timestamp: now.toISOString(),
                type,
                accountId,
                tweetId,
                success,
                responseTime
            });

            // Cache des métriques pour accès rapide
            await this.cacheMetrics();

            logToFile(`[ANALYTICS] Action enregistrée: ${type} par ${accountId} (${success ? 'succès' : 'échec'})`);

        } catch (error) {
            logToFile(`[ANALYTICS] Erreur enregistrement action: ${error.message}`);
        }
    }

    /**
     * Met à jour les métriques de performance
     */
    updatePerformanceMetrics(success, responseTime) {
        // Incrémenter le nombre total d'appels API
        this.metrics.performance.apiCalls++;
        
        // Compter les erreurs
        if (!success) {
            this.metrics.performance.errorCount++;
        }
        
        // Calculer le taux de succès
        const totalCalls = this.metrics.performance.apiCalls;
        const successfulCalls = totalCalls - this.metrics.performance.errorCount;
        this.metrics.performance.successRate = totalCalls > 0 ? (successfulCalls / totalCalls) : 0;
        
        // Calculer le temps de réponse moyen
        if (responseTime && responseTime > 0) {
            const currentAvg = this.metrics.performance.averageResponseTime;
            if (currentAvg === 0) {
                this.metrics.performance.averageResponseTime = responseTime;
            } else {
                // Moyenne mobile pondérée
                this.metrics.performance.averageResponseTime = 
                    Math.round((currentAvg * 0.8 + responseTime * 0.2));
            }
        }
        
        logToFile(`[ANALYTICS] Performance mise à jour: ${Math.round(this.metrics.performance.successRate * 100)}% succès, ${this.metrics.performance.averageResponseTime}ms avg, ${this.metrics.performance.errorCount} erreurs`);
    }

    /**
     * Récupère les métriques du dashboard
     */
    async getDashboardMetrics() {
        try {
            // Vérifier le cache d'abord
            const cached = await this.getCachedMetrics();
            if (cached) {
                return cached;
            }

            // Calculer les métriques en temps réel
            const now = new Date();
            const today = now.toISOString().split('T')[0];
            const hour = now.getHours();

            const dashboard = {
                summary: {
                    likes: this.metrics.actions.likes,
                    retweets: this.metrics.actions.retweets,
                    comments: this.metrics.actions.comments,
                    total: this.metrics.actions.total,
                    activeAccounts: Object.keys(this.metrics.accounts).length,
                    successRate: Math.round(this.metrics.performance.successRate * 100),
                    averageResponseTime: Math.round(this.metrics.performance.averageResponseTime)
                },

                actionBreakdown: {
                    likes: this.metrics.actions.likes,
                    retweets: this.metrics.actions.retweets,
                    comments: this.metrics.actions.comments
                },

                topAccounts: this.getTopAccounts(5),
                
                hourlyActivity: this.getHourlyActivity(),
                
                dailyTrends: this.getDailyTrends(7),
                
                performance: {
                    successRate: this.metrics.performance.successRate,
                    errorCount: this.metrics.performance.errorCount,
                    apiCalls: this.metrics.performance.apiCalls,
                    averageResponseTime: this.metrics.performance.averageResponseTime
                },

                quotaEfficiency: (await this.calculateQuotaEfficiency()).overall || 0,

                timestamp: now.toISOString()
            };

            // Mettre en cache pour 30 secondes
            await this.cacheMetrics(dashboard, 30);
            
            return dashboard;

        } catch (error) {
            logToFile(`[ANALYTICS] Erreur récupération métriques: ${error.message}`);
            return this.getEmptyDashboard();
        }
    }

    /**
     * Récupère les top comptes par activité
     */
    getTopAccounts(limit = 5) {
        return Object.entries(this.metrics.accounts)
            .map(([accountId, data]) => ({
                accountId,
                total: data.total,
                likes: data.likes,
                retweets: data.retweets,
                comments: data.comments,
                successRate: data.total > 0 ? Math.round(((data.total - data.errors) / data.total) * 100) : 0,
                lastAction: data.lastAction
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, limit);
    }

    /**
     * Récupère l'activité par heure (24h)
     */
    getHourlyActivity() {
        const activity = [];
        for (let i = 0; i < 24; i++) {
            const data = this.metrics.hourly[i] || { likes: 0, retweets: 0, comments: 0, total: 0 };
            activity.push({
                hour: i,
                ...data
            });
        }
        return activity;
    }

    /**
     * Récupère les tendances quotidiennes
     */
    getDailyTrends(days = 7) {
        const trends = [];
        const now = new Date();
        
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            const day = date.toISOString().split('T')[0];
            
            const data = this.metrics.daily[day] || { likes: 0, retweets: 0, comments: 0, total: 0 };
            trends.push({
                date: day,
                ...data
            });
        }
        
        return trends;
    }

    /**
     * Calcule l'efficacité des quotas
     */
    async calculateQuotaEfficiency() {
        try {
            // Récupérer les quotas depuis le fichier de configuration
            const quotasData = await this.loadQuotasData();
            if (!quotasData) return { efficiency: 0, details: {} };

            const efficiency = {};
            const totalUsed = this.metrics.actions.total.today;
            const totalAvailable = quotasData.like + quotasData.retweet + quotasData.reply;

            efficiency.overall = totalAvailable > 0 ? Math.round((totalUsed / totalAvailable) * 100) : 0;
            
            efficiency.byType = {
                likes: quotasData.like > 0 ? Math.round((this.metrics.actions.likes.today / quotasData.like) * 100) : 0,
                retweets: quotasData.retweet > 0 ? Math.round((this.metrics.actions.retweets.today / quotasData.retweet) * 100) : 0,
                comments: quotasData.reply > 0 ? Math.round((this.metrics.actions.comments.today / quotasData.reply) * 100) : 0
            };

            return efficiency;

        } catch (error) {
            logToFile(`[ANALYTICS] Erreur calcul efficacité quotas: ${error.message}`);
            return { efficiency: 0, details: {} };
        }
    }

    /**
     * Charge les données de quotas
     */
    async loadQuotasData() {
        try {
            const quotasFile = path.join(__dirname, '..', 'quotas-data.json');
            const data = await fs.readFile(quotasFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return null;
        }
    }

    /**
     * Met en cache les métriques
     */
    async cacheMetrics(data = null, ttl = 60) {
        if (!this.cache.isAvailable()) return;

        try {
            const cacheData = data || this.metrics;
            await this.cache.client.setex('analytics:dashboard', ttl, JSON.stringify(cacheData));
        } catch (error) {
            logToFile(`[ANALYTICS] Erreur mise en cache: ${error.message}`);
        }
    }

    /**
     * Récupère les métriques depuis le cache
     */
    async getCachedMetrics() {
        if (!this.cache.isAvailable()) return null;

        try {
            const cached = await this.cache.client.get('analytics:dashboard');
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Charge les données persistantes
     */
    async loadData() {
        try {
            const data = await fs.readFile(this.dataFile, 'utf8');
            const parsed = JSON.parse(data);
            
            // Fusionner avec les métriques par défaut
            this.metrics = { ...this.metrics, ...parsed };
            
            // Réinitialiser les compteurs journaliers et horaires si nécessaire
            this.resetDailyCounters();
            this.resetHourlyCounters();
            
            logToFile('[ANALYTICS] Données chargées depuis le fichier');
        } catch (error) {
            if (error.code !== 'ENOENT') {
                logToFile(`[ANALYTICS] Erreur chargement données: ${error.message}`);
            }
            // Fichier n'existe pas, utiliser les valeurs par défaut
        }
    }

    /**
     * Sauvegarde les données
     */
    async saveData() {
        try {
            await fs.writeFile(this.dataFile, JSON.stringify(this.metrics, null, 2));
            logToFile('[ANALYTICS] Données sauvegardées');
        } catch (error) {
            logToFile(`[ANALYTICS] Erreur sauvegarde: ${error.message}`);
        }
    }

    /**
     * Flush périodique des données
     */
    startPeriodicFlush() {
        // Sauvegarder toutes les 5 minutes
        this.flushInterval = setInterval(async () => {
            await this.saveData();
            this.metricsBuffer = []; // Vider le buffer
        }, 300000); // 5 minutes
    }

    /**
     * Réinitialise les compteurs journaliers si nouveau jour
     */
    resetDailyCounters() {
        const today = new Date().toISOString().split('T')[0];
        if (this.lastResetDay !== today) {
            Object.keys(this.metrics.actions).forEach(key => {
                this.metrics.actions[key].today = 0;
            });
            this.lastResetDay = today;
        }
    }

    /**
     * Réinitialise les compteurs horaires si nouvelle heure
     */
    resetHourlyCounters() {
        const currentHour = new Date().getHours();
        if (this.lastResetHour !== currentHour) {
            Object.keys(this.metrics.actions).forEach(key => {
                this.metrics.actions[key].thisHour = 0;
            });
            this.lastResetHour = currentHour;
        }
    }

    /**
     * Retourne un dashboard vide en cas d'erreur
     */
    getEmptyDashboard() {
        return {
            summary: {
                totalActions: 0, todayActions: 0, thisHourActions: 0,
                activeAccounts: 0, successRate: 0, averageResponseTime: 0
            },
            actionBreakdown: {
                likes: { total: 0, today: 0, thisHour: 0 },
                retweets: { total: 0, today: 0, thisHour: 0 },
                comments: { total: 0, today: 0, thisHour: 0 }
            },
            topAccounts: [],
            hourlyActivity: [],
            dailyTrends: [],
            performance: { successRate: 0, errorCount: 0, apiCalls: 0, averageResponseTime: 0 },
            quotaEfficiency: { efficiency: 0, details: {} },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Génère un rapport détaillé
     */
    async generateReport(period = 'daily') {
        try {
            const report = {
                period,
                generated: new Date().toISOString(),
                summary: await this.getDashboardMetrics(),
                details: {
                    accountPerformance: this.getDetailedAccountPerformance(),
                    timeAnalysis: this.getTimeAnalysis(),
                    recommendations: this.generateRecommendations()
                }
            };

            return report;
        } catch (error) {
            logToFile(`[ANALYTICS] Erreur génération rapport: ${error.message}`);
            return null;
        }
    }

    /**
     * Performance détaillée par compte
     */
    getDetailedAccountPerformance() {
        return Object.entries(this.metrics.accounts).map(([accountId, data]) => ({
            accountId,
            metrics: data,
            efficiency: data.total > 0 ? Math.round(((data.total - data.errors) / data.total) * 100) : 0,
            trend: 'stable' // À implémenter : analyse de tendance
        }));
    }

    /**
     * Analyse temporelle
     */
    getTimeAnalysis() {
        const hourlyData = this.getHourlyActivity();
        const peakHour = hourlyData.reduce((max, current) => 
            current.total > max.total ? current : max, { hour: 0, total: 0 });

        return {
            peakHour: peakHour.hour,
            peakActivity: peakHour.total,
            averageHourlyActivity: Math.round(hourlyData.reduce((sum, h) => sum + h.total, 0) / 24)
        };
    }

    /**
     * Génère des recommandations
     */
    generateRecommendations() {
        const recommendations = [];
        
        if (this.metrics.performance.successRate < 0.9) {
            recommendations.push({
                type: 'performance',
                message: 'Taux de succès faible - Vérifier la connectivité et les quotas',
                priority: 'high'
            });
        }

        if (this.metrics.actions.total.today < 10) {
            recommendations.push({
                type: 'activity',
                message: 'Activité faible aujourd\'hui - Considérer augmenter les quotas',
                priority: 'medium'
            });
        }

        return recommendations;
    }

    /**
     * Nettoyage et fermeture
     */
    async cleanup() {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
        }
        await this.saveData();
        logToFile('[ANALYTICS] Service d\'analytics nettoyé');
    }
}

// Export du service
const analyticsService = new AnalyticsService();
module.exports = analyticsService;
