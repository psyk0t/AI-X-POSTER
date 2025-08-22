/**
 * Service de planification intelligente pour optimiser les actions Twitter
 * Analyse les patterns d'engagement et planifie les actions aux moments optimaux
 */

const fs = require('fs');
const path = require('path');

class SmartScheduler {
    constructor() {
        this.schedulerDataFile = path.join(__dirname, '..', 'scheduler-data.json');
        this.performedActionsFile = path.join(__dirname, '..', 'performed-actions.json');
        this.scheduledActionsQueue = [];
        this.engagementPatterns = {};
        this.isInitialized = false;
        
        // Configuration par défaut
        this.config = {
            enableSmartScheduling: false, // Mode immédiat par défaut
            optimizationLevel: 'medium', // low, medium, high
            maxDelayHours: 24, // Délai maximum pour une action
            minActionInterval: 5, // Minutes minimum entre actions
            peakHoursWeight: 2.0, // Multiplicateur pour heures de pointe
            weekendWeight: 0.8, // Multiplicateur pour weekend
        };
    }

    /**
     * Initialise le service de planification intelligente
     */
    async initialize() {
        try {
            await this.loadSchedulerData();
            await this.analyzeEngagementPatterns();
            this.startSchedulerLoop();
            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error('[SMART-SCHEDULER] Erreur d\'initialisation:', error);
            return false;
        }
    }

    /**
     * Charge les données de configuration du scheduler
     */
    async loadSchedulerData() {
        try {
            if (fs.existsSync(this.schedulerDataFile)) {
                const data = JSON.parse(fs.readFileSync(this.schedulerDataFile, 'utf8'));
                this.config = { ...this.config, ...data.config };
                this.scheduledActionsQueue = data.scheduledActionsQueue || [];
                this.engagementPatterns = data.engagementPatterns || {};
            } else {
                await this.saveSchedulerData();
            }
        } catch (error) {
            console.error('[SMART-SCHEDULER] Erreur lors du chargement des données:', error);
        }
    }

    /**
     * Sauvegarde les données du scheduler
     */
    async saveSchedulerData() {
        try {
            const data = {
                config: this.config,
                scheduledActionsQueue: this.scheduledActionsQueue,
                engagementPatterns: this.engagementPatterns,
                lastUpdated: new Date().toISOString()
            };
            fs.writeFileSync(this.schedulerDataFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('[SMART-SCHEDULER] Erreur lors de la sauvegarde:', error);
        }
    }

    /**
     * Analyse les patterns d'engagement à partir de l'historique des actions
     */
    async analyzeEngagementPatterns() {
        try {
            if (!fs.existsSync(this.performedActionsFile)) {
                return;
            }

            const performedActions = JSON.parse(fs.readFileSync(this.performedActionsFile, 'utf8'));
            const patterns = {
                hourly: Array(24).fill(0), // Score par heure (0-23)
                daily: Array(7).fill(0),   // Score par jour de la semaine (0-6)
                actionTypes: {
                    like: { hourly: Array(24).fill(0), daily: Array(7).fill(0) },
                    retweet: { hourly: Array(24).fill(0), daily: Array(7).fill(0) },
                    reply: { hourly: Array(24).fill(0), daily: Array(7).fill(0) }
                }
            };

            let totalActions = 0;

            // Analyser chaque action historique
            for (const tweetId in performedActions) {
                for (const accountId in performedActions[tweetId]) {
                    for (const actionType in performedActions[tweetId][accountId]) {
                        const timestamp = performedActions[tweetId][accountId][actionType];
                        
                        // Ignorer les anciens timestamps booléens
                        if (timestamp === true || timestamp === false) continue;
                        
                        try {
                            const date = new Date(timestamp);
                            const hour = date.getHours();
                            const dayOfWeek = date.getDay();
                            
                            // Incrémenter les compteurs globaux
                            patterns.hourly[hour]++;
                            patterns.daily[dayOfWeek]++;
                            
                            // Incrémenter les compteurs par type d'action
                            if (patterns.actionTypes[actionType]) {
                                patterns.actionTypes[actionType].hourly[hour]++;
                                patterns.actionTypes[actionType].daily[dayOfWeek]++;
                            }
                            
                            totalActions++;
                        } catch (dateError) {
                            // Ignorer les timestamps invalides
                            continue;
                        }
                    }
                }
            }

            // Normaliser les scores (convertir en pourcentages)
            if (totalActions > 0) {
                for (let i = 0; i < 24; i++) {
                    patterns.hourly[i] = (patterns.hourly[i] / totalActions) * 100;
                }
                for (let i = 0; i < 7; i++) {
                    patterns.daily[i] = (patterns.daily[i] / totalActions) * 100;
                }

                // Normaliser par type d'action
                for (const actionType in patterns.actionTypes) {
                    const typeTotal = patterns.actionTypes[actionType].hourly.reduce((a, b) => a + b, 0);
                    if (typeTotal > 0) {
                        for (let i = 0; i < 24; i++) {
                            patterns.actionTypes[actionType].hourly[i] = (patterns.actionTypes[actionType].hourly[i] / typeTotal) * 100;
                        }
                        for (let i = 0; i < 7; i++) {
                            patterns.actionTypes[actionType].daily[i] = (patterns.actionTypes[actionType].daily[i] / typeTotal) * 100;
                        }
                    }
                }
            }

            this.engagementPatterns = patterns;
            this.engagementPatterns.totalActionsAnalyzed = totalActions;
            this.engagementPatterns.lastAnalysis = new Date().toISOString();
            
            await this.saveSchedulerData();
            
            console.log(`[SMART-SCHEDULER] Analyse terminée: ${totalActions} actions analysées`);
            
        } catch (error) {
            console.error('[SMART-SCHEDULER] Erreur lors de l\'analyse des patterns:', error);
        }
    }

    /**
     * Calcule le score d'efficacité pour un créneau donné
     */
    calculateEfficiencyScore(date, actionType = null) {
        const hour = date.getHours();
        const dayOfWeek = date.getDay();
        
        let hourScore = this.engagementPatterns.hourly[hour] || 1;
        let dayScore = this.engagementPatterns.daily[dayOfWeek] || 1;
        
        // Utiliser les patterns spécifiques au type d'action si disponible
        if (actionType && this.engagementPatterns.actionTypes[actionType]) {
            hourScore = this.engagementPatterns.actionTypes[actionType].hourly[hour] || hourScore;
            dayScore = this.engagementPatterns.actionTypes[actionType].daily[dayOfWeek] || dayScore;
        }
        
        // Appliquer les multiplicateurs de configuration
        if (hour >= 9 && hour <= 17) { // Heures de bureau
            hourScore *= this.config.peakHoursWeight;
        }
        
        if (dayOfWeek === 0 || dayOfWeek === 6) { // Weekend
            dayScore *= this.config.weekendWeight;
        }
        
        return (hourScore + dayScore) / 2;
    }

    /**
     * Trouve le meilleur créneau pour exécuter une action
     */
    findOptimalTimeSlot(actionType, maxDelayHours = null) {
        const now = new Date();
        const maxDelay = maxDelayHours || this.config.maxDelayHours;
        const endTime = new Date(now.getTime() + (maxDelay * 60 * 60 * 1000));
        
        let bestScore = 0;
        let bestTime = now;
        
        // Tester chaque heure dans la fenêtre de délai
        for (let hours = 0; hours <= maxDelay; hours++) {
            const testTime = new Date(now.getTime() + (hours * 60 * 60 * 1000));
            const score = this.calculateEfficiencyScore(testTime, actionType);
            
            if (score > bestScore) {
                bestScore = score;
                bestTime = testTime;
            }
        }
        
        return {
            scheduledTime: bestTime,
            efficiencyScore: bestScore,
            delayHours: (bestTime.getTime() - now.getTime()) / (1000 * 60 * 60)
        };
    }

    /**
     * Planifie une action de manière intelligente
     */
    async scheduleAction(action) {
        if (!this.config.enableSmartScheduling) {
            // Mode immédiat - exécuter maintenant
            return {
                scheduledTime: new Date(),
                immediate: true,
                efficiencyScore: 1
            };
        }

        const optimal = this.findOptimalTimeSlot(action.actionType);
        
        // Ajouter l'action à la queue
        const scheduledAction = {
            id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            ...action,
            scheduledTime: optimal.scheduledTime,
            efficiencyScore: optimal.efficiencyScore,
            createdAt: new Date().toISOString()
        };
        
        this.scheduledActionsQueue.push(scheduledAction);
        await this.saveSchedulerData();
        
        return optimal;
    }

    /**
     * Récupère les actions prêtes à être exécutées
     */
    getActionsReadyForExecution() {
        const now = new Date();
        const readyActions = this.scheduledActionsQueue.filter(action => 
            new Date(action.scheduledTime) <= now
        );
        
        // Retirer les actions prêtes de la queue
        this.scheduledActionsQueue = this.scheduledActionsQueue.filter(action => 
            new Date(action.scheduledTime) > now
        );
        
        if (readyActions.length > 0) {
            this.saveSchedulerData();
        }
        
        return readyActions;
    }

    /**
     * Boucle principale du scheduler
     */
    startSchedulerLoop() {
        setInterval(async () => {
            try {
                const readyActions = this.getActionsReadyForExecution();
                
                if (readyActions.length > 0) {
                    console.log(`[SMART-SCHEDULER] ${readyActions.length} actions prêtes à être exécutées`);
                    
                    // Ici, on pourrait déclencher l'exécution des actions
                    // Pour l'instant, on log juste les actions prêtes
                    for (const action of readyActions) {
                        console.log(`[SMART-SCHEDULER] Action prête: ${action.actionType} sur tweet ${action.tweetId}`);
                    }
                }
            } catch (error) {
                console.error('[SMART-SCHEDULER] Erreur dans la boucle du scheduler:', error);
            }
        }, 60000); // Vérifier toutes les minutes
    }

    /**
     * Met à jour la configuration du scheduler
     */
    async updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        await this.saveSchedulerData();
        
        // Re-analyser les patterns si nécessaire
        if (newConfig.enableSmartScheduling && !this.engagementPatterns.lastAnalysis) {
            await this.analyzeEngagementPatterns();
        }
    }

    /**
     * Vérifie si le Smart Scheduling peut être activé (minimum 12h de données)
     */
    canEnableSmartScheduling() {
        try {
            // Charger les actions effectuées
            if (!fs.existsSync(this.performedActionsFile)) {
                return {
                    canEnable: false,
                    reason: 'no_data',
                    message: 'No action data available yet',
                    hoursCollected: 0,
                    hoursNeeded: 12,
                    actionsCount: 0
                };
            }

            const performedActions = JSON.parse(fs.readFileSync(this.performedActionsFile, 'utf8'));
            
            // Collecter toutes les actions avec timestamps
            const allActions = [];
            Object.keys(performedActions).forEach(tweetId => {
                Object.keys(performedActions[tweetId]).forEach(accountId => {
                    Object.keys(performedActions[tweetId][accountId]).forEach(actionType => {
                        const timestamp = performedActions[tweetId][accountId][actionType];
                        if (timestamp && timestamp !== true) {
                            allActions.push({
                                timestamp: new Date(timestamp),
                                actionType
                            });
                        }
                    });
                });
            });

            if (allActions.length === 0) {
                return {
                    canEnable: false,
                    reason: 'no_valid_data',
                    message: 'No valid timestamped actions found',
                    hoursCollected: 0,
                    hoursNeeded: 12,
                    actionsCount: 0
                };
            }

            // Calculer la période de collecte
            const sortedActions = allActions.sort((a, b) => a.timestamp - b.timestamp);
            const firstAction = sortedActions[0].timestamp;
            const lastAction = sortedActions[sortedActions.length - 1].timestamp;
            const now = new Date();
            
            const hoursCollected = Math.max(
                (now.getTime() - firstAction.getTime()) / (1000 * 60 * 60),
                (lastAction.getTime() - firstAction.getTime()) / (1000 * 60 * 60)
            );

            const minHours = 12;
            const recommendedHours = 24;
            const canEnable = hoursCollected >= minHours && allActions.length >= 8;

            return {
                canEnable,
                reason: canEnable ? 'sufficient_data' : 'insufficient_data',
                message: canEnable 
                    ? `Smart Scheduling ready! ${Math.round(hoursCollected)}h of data collected` 
                    : `Need ${Math.round(minHours - hoursCollected)}h more data collection`,
                hoursCollected: Math.round(hoursCollected * 10) / 10,
                hoursNeeded: minHours,
                hoursRecommended: recommendedHours,
                actionsCount: allActions.length,
                firstActionTime: firstAction.toISOString(),
                lastActionTime: lastAction.toISOString(),
                isRecommendedTime: hoursCollected >= recommendedHours
            };
        } catch (error) {
            console.error('[SMART-SCHEDULER] Erreur lors de la validation:', error);
            return {
                canEnable: false,
                reason: 'error',
                message: 'Error checking data availability',
                hoursCollected: 0,
                hoursNeeded: 12,
                actionsCount: 0
            };
        }
    }

    /**
     * Obtient les statistiques du scheduler
     */
    getStats() {
        const validation = this.canEnableSmartScheduling();
        
        return {
            config: this.config,
            queueLength: this.scheduledActionsQueue.length,
            engagementPatterns: this.engagementPatterns,
            isInitialized: this.isInitialized,
            validation,
            nextExecution: this.scheduledActionsQueue.length > 0 ? 
                Math.min(...this.scheduledActionsQueue.map(a => new Date(a.scheduledTime).getTime())) : null
        };
    }

    /**
     * Obtient les créneaux recommandés pour les prochaines 24h
     */
    getRecommendedTimeSlots(actionType = null) {
        const now = new Date();
        const slots = [];
        
        for (let hours = 0; hours < 24; hours++) {
            const time = new Date(now.getTime() + (hours * 60 * 60 * 1000));
            const score = this.calculateEfficiencyScore(time, actionType);
            
            slots.push({
                time: time.toISOString(),
                hour: time.getHours(),
                score: Math.round(score * 100) / 100,
                recommendation: score > 5 ? 'optimal' : score > 2 ? 'good' : 'poor'
            });
        }
        
        return slots.sort((a, b) => b.score - a.score);
    }
}

module.exports = new SmartScheduler();
