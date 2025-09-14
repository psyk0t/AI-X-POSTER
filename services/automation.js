const { pushLiveLog } = require('./logs-optimized');
const { logFilter, logFilterSummary, logBatch, logBatchSummary, logAction, logError, logSystem } = require('./log-manager');
const path = require('path');

// Utiliser logSystem au lieu de logToFile pour éviter les erreurs d'initialisation
// const logToFile = logSystem; // SUPPRIMÉ - utiliser directement logSystem
const { getMasterQuotaManager } = require('./master-quota-manager');
// const { getActionScheduler } = require('./action-scheduler'); // Module non trouvé
const { TimerManager } = require('./timer-utils');
const { getRateLimitMonitor } = require('./rate-limit-monitor');
const rateLimiterService = require('./rate-limiter');
// const { getAlertManager } = require('./alert-manager'); // Module nodemailer manquant

// Cache pour les vérifications utilisateur (30 minutes)
const userVerificationCache = new Map();
const { addAction } = require('./actions-stats');

// Délai minimum entre replies sur le même tweet (30 minutes)
const REPLY_SPACING = 30 * 60 * 1000; // 30 minutes
const lastReplyTimes = new Map();

/**
 * Vérifie si on peut répondre à un tweet (délai de 30min entre replies)
 * @param {string} tweetId - ID du tweet
 * @returns {boolean} - True si on peut répondre
 */
function canReplyToTweet(tweetId) {
    const lastReply = lastReplyTimes.get(tweetId);
    if (lastReply && Date.now() - lastReply < REPLY_SPACING) {
        return false;
    }
    return true;
}

/**
 * Marque qu'un reply a été effectué sur un tweet
 * @param {string} tweetId - ID du tweet
 */
function markReplyToTweet(tweetId) {
    lastReplyTimes.set(tweetId, Date.now());
}

/**
 * Automation Service - Extracted from server.js
 * Responsibilities:
 * - Automatic tweet scanning
 * - Action execution (like, retweet, reply)
 * - Quota and rate limiting management
 * - AI comment generation
 * - Scheduled action execution
 */

/**
 * Clean expired muted accounts from the Map
 * @param {Map} mutedAccounts - Map of muted accounts
 */
function cleanExpiredMutedAccounts(mutedAccounts) {
    const now = Date.now();
    const expiredAccounts = [];
    
    for (const [accountId, muteUntil] of mutedAccounts.entries()) {
        if (muteUntil <= now) {
            expiredAccounts.push(accountId);
        }
    }
    
    // Remove expired accounts and log unmuting
    expiredAccounts.forEach(accountId => {
        mutedAccounts.delete(accountId);
        logSystem(`[UNMUTE] Account ${accountId} automatically unmuted (pause expired)`, 'automation', 'info');
    });
    
    if (expiredAccounts.length > 0) {
        logSystem(`[CLEANUP] Removed ${expiredAccounts.length} expired muted accounts from memory`, 'automation', 'info');
    }
    
    return expiredAccounts.length;
}

/**
 * Real-time log buffer to reassure the user
 */
let liveLogs = [];
const MAX_LIVE_LOGS = 100;

// Initialisation du système
pushLiveLog('System initialized - Automation service ready');

/**
 * 📊 MÉTRIQUES TEMPS RÉEL POUR DASHBOARD
 */
let dashboardMetrics = {
    rawTweetsDetected: 0,
    validTweetsAfterFilter: 0,
    plannedActionsByAccount: {},
    lastScanMetrics: {
        timestamp: null,
        tweetsProcessed: 0,
    }
};

/**
 * Fonction pour mettre à jour les métriques dashboard en temps réel
 */
function updateDashboardMetrics(type, data) {
    switch (type) {
        case 'tweets_detected':
            dashboardMetrics.rawTweetsDetected = data.count;
            break;
        case 'tweets_filtered':
            dashboardMetrics.validTweetsAfterFilter = data.count;
            break;
        case 'actions_planned':
            if (!dashboardMetrics.plannedActionsByAccount[data.account]) {
                dashboardMetrics.plannedActionsByAccount[data.account] = 0;
            }
            dashboardMetrics.plannedActionsByAccount[data.account] += data.count;
            break;
        case 'scan_complete':
            dashboardMetrics.lastScanMetrics = {
                timestamp: new Date().toISOString(),
                tweetsProcessed: data.tweetsProcessed,
                actionsGenerated: data.actionsGenerated
            };
            break;
    }
}

/**
 * Fonction pour récupérer les métriques dashboard
 */
function getDashboardMetrics() {
    const totalPlannedActions = Object.values(dashboardMetrics.plannedActionsByAccount).reduce((sum, count) => sum + count, 0);
    
    return {
        ...dashboardMetrics,
        totalPlannedActions,
        accountsWithActions: Object.keys(dashboardMetrics.plannedActionsByAccount).length
    };
}

/**
 * 🚦 ADVANCED RATE LIMITING MANAGEMENT SYSTEM
 * Smart handling of 429 errors with exponential backoff
 */
const rateLimitTracker = new Map(); // Track 429 errors per account
const RATE_LIMIT_CONFIG = {
    // Base delays (in minutes)
    baseDelay: 15,        // Initial delay: 15 minutes
    maxDelay: 240,        // Maximum delay: 4 hours
    exponentialFactor: 2, // Increase factor
    resetAfter: 24 * 60,  // Reset counter after 24h
    maxRetries: 5         // Maximum attempts before deactivation
};

/**
 * Calculate wait delay for an account in case of 429 error
 * @param {string} accountId - Account ID
 * @returns {Object} - Information about delay and state
 */
function calculateRateLimitDelay(accountId) {
    const now = Date.now();
    const tracker = rateLimitTracker.get(accountId) || {
        errorCount: 0,
        firstError: now,
        lastError: now
    };
    
    // Reset if more than 24h since first error
    if (now - tracker.firstError > RATE_LIMIT_CONFIG.resetAfter * 60 * 1000) {
        tracker.errorCount = 0;
        tracker.firstError = now;
    }
    
    // Increment error counter
    tracker.errorCount++;
    tracker.lastError = now;
    
    // Calculate delay with exponential backoff
    const delayMinutes = Math.min(
        RATE_LIMIT_CONFIG.baseDelay * Math.pow(RATE_LIMIT_CONFIG.exponentialFactor, tracker.errorCount - 1),
        RATE_LIMIT_CONFIG.maxDelay
    );
    
    const delayMs = delayMinutes * 60 * 1000;
    const shouldDisable = tracker.errorCount >= RATE_LIMIT_CONFIG.maxRetries;
    
    // Sauvegarder l'état
    rateLimitTracker.set(accountId, tracker);
    
    return {
        delayMs,
        delayMinutes: Math.round(delayMinutes),
        errorCount: tracker.errorCount,
        shouldDisable,
        nextRetryAt: now + delayMs
    };
}

/**
 * Handle a 429 error for a given account
 * @param {string} accountId - Account ID
 * @param {string} username - Username for logs
 * @param {string} action - Action type (like, retweet, reply)
 * @param {Map} mutedAccounts - Map of muted accounts
 */
function handleRateLimitError(accountId, username, action, mutedAccounts) {
    const rateLimitInfo = calculateRateLimitDelay(accountId);
    
    // Mute the account
    mutedAccounts.set(accountId, rateLimitInfo.nextRetryAt);
    
    // Detailed logs
    logSystem(`[429][${username}] Rate limit reached for ${action} - Error #${rateLimitInfo.errorCount}`, 'automation', 'warn');
    logSystem(`[429][${username}] Pause for ${rateLimitInfo.delayMinutes} minutes (exponential backoff)`, 'automation', 'warn');
    
    if (rateLimitInfo.shouldDisable) {
        logSystem(`[429][${username}] ⚠️  ACCOUNT DISABLED - Too many 429 errors (${rateLimitInfo.errorCount}/${RATE_LIMIT_CONFIG.maxRetries})`, 'automation', 'error');
        logSystem(`[429][${username}] Account will be automatically reactivated in 24h`, 'automation', 'error');
    }
    
    // Log for dashboard
    pushLiveLog(`[${username}] Rate limit - Pause ${rateLimitInfo.delayMinutes}min (attempt ${rateLimitInfo.errorCount})`);
    
    return rateLimitInfo;
}

/**
 * 🚫 403 ERROR MANAGEMENT SYSTEM (AUTHORIZATION)
 * Monitoring and smart handling of authorization errors
 */
const authErrorTracker = new Map(); // Track 403 errors per account
const AUTH_ERROR_CONFIG = {
    maxErrors: 3,           // Maximum number of 403 errors before alert
    pauseDuration: 15,      // Pause duration in minutes (15min au lieu de 60min)
    resetAfter: 12 * 60,    // Reset counter after 12h
    criticalThreshold: 5    // Critical threshold for deactivation
};

/**
 * Handle a 403 error for a given account
 * @param {string} accountId - Account ID
 * @param {string} username - Username for logs
 * @param {string} action - Action type (like, retweet, reply)
 * @param {Map} mutedAccounts - Map of muted accounts
 */
function handleAuthorizationError(accountId, username, action, mutedAccounts) {
    const now = Date.now();
    const tracker = authErrorTracker.get(accountId) || {
        errorCount: 0,
        firstError: now,
        lastError: now,
        actions: []
    };
    
    // Reset if more than 12h since first error
    if (now - tracker.firstError > AUTH_ERROR_CONFIG.resetAfter * 60 * 1000) {
        tracker.errorCount = 0;
        tracker.firstError = now;
        tracker.actions = [];
    }
    
    // Increment counter and record action
    tracker.errorCount++;
    tracker.lastError = now;
    tracker.actions.push({ action, timestamp: now });
    
    // Save state
    authErrorTracker.set(accountId, tracker);
    
    // Calculate pause duration
    const pauseMs = AUTH_ERROR_CONFIG.pauseDuration * 60 * 1000;
    mutedAccounts.set(accountId, now + pauseMs);
    
    // Detailed logs
    logSystem(`[403][${username}] Authorization error for ${action} - Error #${tracker.errorCount}`, 'automation', 'warn');
    logSystem(`[403][${username}] Pause for ${AUTH_ERROR_CONFIG.pauseDuration} minutes`, 'automation', 'warn');
    
    // Alerts based on severity level
    if (tracker.errorCount >= AUTH_ERROR_CONFIG.criticalThreshold) {
        logSystem(`[403][${username}] 🚨 CRITICAL ALERT - ${tracker.errorCount} 403 errors detected`, 'automation', 'error');
        logSystem(`[403][${username}] IMMEDIATELY check OAuth permissions and account status`, 'automation', 'error');
        logSystem(`[403][${username}] Affected actions: ${tracker.actions.map(a => a.action).join(', ')}`, 'automation', 'error');
        pushLiveLog(`[${username}] 🚨 ALERT - Too many 403 errors, check permissions`);
    } else if (tracker.errorCount >= AUTH_ERROR_CONFIG.maxErrors) {
        logSystem(`[403][${username}] ⚠️  WARNING - ${tracker.errorCount} recent 403 errors`, 'automation', 'warn');
        logSystem(`[403][${username}] Monitor this account, potential permissions issue`, 'automation', 'warn');
        pushLiveLog(`[${username}] ⚠️  Warning - Repeated 403 errors (${tracker.errorCount})`);
    } else {
        pushLiveLog(`[${username}] 403 error - Pause ${AUTH_ERROR_CONFIG.pauseDuration}min`);
    }
    
    return {
        errorCount: tracker.errorCount,
        pauseMinutes: AUTH_ERROR_CONFIG.pauseDuration,
        isCritical: tracker.errorCount >= AUTH_ERROR_CONFIG.criticalThreshold,
        needsAttention: tracker.errorCount >= AUTH_ERROR_CONFIG.maxErrors
    };
}


/**
 * Add a system entry to the actionLog for the dashboard
 * @param {string} detail - Action detail
 * @param {string} subtype - Action subtype
 */
function logSystemAction(detail, subtype = 'system') {
    logSystem(`[SYSTEM][${subtype.toUpperCase()}] ${detail}`, 'automation', 'info');
}

/**
 * 🚀 OPTIMIZED DELAYS - PHASE 8 - PERFECT FIT
 * Délais calculés pour utiliser parfaitement les 30min entre scans
 * 50 actions étalées sur 30min = 36s par action en moyenne
 */
const ULTRA_OPTIMIZED_DELAYS = {
    like: { min: 480, max: 960 },     // 🎯 8-16min - Augmenté de 20% pour éviter 429
    retweet: { min: 1080, max: 1440 },  // 🎯 18-24min - Augmenté de 20% pour sécurité
    reply: { min: 480, max: 960 },    // 🎯 8-16min - Augmenté de 20% pour stabilité
    betweenAccounts: { min: 6, max: 10 }, // 🎯 6-10s between accounts - Augmenté de 20%
    betweenBatches: { min: 4, max: 6 }   // 🎯 4-6s between batches - Augmenté de 20%
};

/**
 * 📅 SYSTÈME D'ÉTALEMENT 24H - PHASE 6
 * Répartition intelligente des actions sur 24h pour éviter les pics
 */
class ActionScheduler {
    constructor(dependencies = null) {
        this.accountSchedules = new Map();
        this.deferredActions = new Map(); // Queue des actions différées par compte
        this.processingInterval = null;
        this.dependencies = dependencies;
    }

    /**
     * Calcule les créneaux optimaux pour un compte
     */
    calculateOptimalSchedule(accountId, dailyLimits) {
        const schedule = {
            like: this.generateTimeSlots(dailyLimits.like, 'like'),
            retweet: this.generateTimeSlots(dailyLimits.retweet, 'retweet'),
            reply: this.generateTimeSlots(dailyLimits.reply, 'reply'),
            lastReset: new Date().toDateString()
        };
        
        this.accountSchedules.set(accountId, schedule);
        logSystem(`[SCHEDULER] Time slots calculated for account ${accountId}: ${dailyLimits.like} likes, ${dailyLimits.reply} replies`, 'automation', 'info');
        return schedule;
    }

    /**
     * Generate time slots distributed over 24h for optimal spreading
     */
    generateTimeSlots(dailyLimit, actionType) {
        const slots = [];
        // Répartir sur 24h pour un étalement optimal et éviter les pics d'activité
        const distributionHours = 24;
        const intervalMinutes = (distributionHours * 60) / dailyLimit;
        
        for (let i = 0; i < dailyLimit; i++) {
            const baseMinutes = i * intervalMinutes;
            // Réduire la randomisation pour plus de prévisibilité
            const randomOffset = (Math.random() - 0.5) * (intervalMinutes * 0.2); // 20% au lieu de 40%
            const finalMinutes = Math.max(0, Math.min(distributionHours * 60 - 1, baseMinutes + randomOffset));
            
            const hours = Math.floor(finalMinutes / 60);
            const minutes = Math.floor(finalMinutes % 60);
            
            // Programmer sur les prochaines 24h pour un étalement optimal
            const now = new Date();
            const scheduledTime = new Date(now.getTime() + finalMinutes * 60 * 1000);
            
            slots.push({
                hour: scheduledTime.getHours(),
                minute: scheduledTime.getMinutes(),
                timestamp: scheduledTime.getTime(),
                used: false
            });
        }
        
        return slots.sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Calcule le prochain timestamp pour une heure/minute donnée
     */
    getNextScheduledTime(hour, minute) {
        const now = new Date();
        const scheduled = new Date();
        scheduled.setHours(hour, minute, 0, 0);
        
        // Si l'heure est déjà passée aujourd'hui, programmer pour demain
        if (scheduled <= now) {
            scheduled.setDate(scheduled.getDate() + 1);
        }
        
        return scheduled.getTime();
    }

    /**
     * Vérifie si un compte peut effectuer une action maintenant
     */
    canPerformActionNow(accountId, actionType) {
        const schedule = this.accountSchedules.get(accountId);
        if (!schedule) return { allowed: true, reason: 'Pas de planning' };

        // Reset quotidien si nécessaire
        const today = new Date().toDateString();
        if (schedule.lastReset !== today) {
            this.calculateOptimalSchedule(accountId, {
                like: RUNTIME_CAPS.like.limit,
                retweet: RUNTIME_CAPS.retweet.limit,
                reply: RUNTIME_CAPS.reply.limit
            });
            return this.canPerformActionNow(accountId, actionType);
        }

        const slots = schedule[actionType] || [];
        const now = Date.now();
        
        // Trouver le prochain créneau disponible avec tolérance élargie
        const availableSlot = slots.find(slot => !slot.used && slot.timestamp <= now + (15 * 60 * 1000)); // ±15min de tolérance (was 5min)
        
        if (availableSlot) {
            availableSlot.used = true;
            const nextSlot = slots.find(slot => !slot.used);
            const waitTime = nextSlot ? Math.max(0, nextSlot.timestamp - now) : 0;
            
            logSystem(`[SCHEDULER][${accountId}] Action ${actionType} autorisée. Prochain créneau dans ${Math.round(waitTime/60000)}min`, 'automation', 'info');
            return { 
                allowed: true, 
                reason: 'Créneau disponible',
                nextSlotIn: waitTime
            };
        }

        const nextSlot = slots.find(slot => !slot.used);
        const waitTime = nextSlot ? Math.max(0, nextSlot.timestamp - now) : 24 * 60 * 60 * 1000;
        
        return { 
            allowed: false, 
            reason: `Prochain créneau dans ${Math.round(waitTime/60000)}min`,
            waitTime
        };
    }

    /**
     * Ajoute une action à la queue des actions différées
     */
    addDeferredAction(accountId, action, nextAvailableTime) {
        if (!this.deferredActions.has(accountId)) {
            this.deferredActions.set(accountId, []);
        }
        
        const deferredAction = {
            ...action,
            scheduledTime: nextAvailableTime,
            addedAt: Date.now()
        };
        
        this.deferredActions.get(accountId).push(deferredAction);
        logSystem(`[SCHEDULER][DEFERRED] Action ${action.type} ajoutée à la queue pour ${accountId} - exécution prévue: ${new Date(nextAvailableTime).toLocaleTimeString()}`, 'automation', 'info');
    }

    /**
     * Démarre le processus de vérification des actions différées
     */
    startDeferredActionsProcessor() {
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
        }

        this.processingInterval = setInterval(async () => {
            try {
                // Nettoyage automatique toutes les 10 minutes
                if (Date.now() % (10 * 60 * 1000) < 60 * 1000) {
                    this.cleanupCorruptedActions();
                }
                
                await this.processDeferredActions(this.dependencies);
            } catch (processingError) {
                logSystem(`[SCHEDULER] Erreur critique dans le processeur: ${processingError.message}`, 'automation', 'error');
                // Continuer le traitement malgré l'erreur pour éviter l'arrêt complet
            }
        }, 60 * 1000); // Vérification toutes les 60 secondes pour réduire la charge

        logSystem(`[SCHEDULER] Processeur d'actions différées démarré (vérification toutes les 60s)`, 'automation', 'info');
    }

    /**
     * Traite les actions différées prêtes à être exécutées
     */
    async processDeferredActions(dependencies) {
        const now = Date.now();
        let actionsProcessed = 0;

        for (const [accountId, actions] of this.deferredActions.entries()) {
            const readyActions = actions.filter(action => action.scheduledTime <= now);
            
            for (const action of readyActions) {
                try {
                    // Vérifier si le créneau est maintenant disponible
                    const scheduleCheck = this.canPerformActionNow(accountId, action.type);
                    if (scheduleCheck.allowed) {
                        logSystem(`[SCHEDULER][DEFERRED] Exécution de l'action différée: ${action.type} sur ${action.tweetId} pour ${accountId}`, 'automation', 'info');
                        
                        // Exécuter l'action via le système existant
                        await this.executeDeferredAction(action, dependencies);
                        
                        // Retirer l'action de la queue
                        const index = actions.indexOf(action);
                        actions.splice(index, 1);
                        actionsProcessed++;
                    } else {
                        // Reprogrammer l'action pour plus tard
                        action.scheduledTime = now + (scheduleCheck.waitTime || 10 * 60 * 1000);
                        logSystem(`[SCHEDULER][DEFERRED] Action reprogrammée pour ${new Date(action.scheduledTime).toLocaleTimeString()}: ${scheduleCheck.reason}`, 'automation', 'debug');
                    }
                } catch (error) {
                    logSystem(`[SCHEDULER] Erreur lors de l'exécution de l'action différée: ${error.message}`, 'automation', 'error');
                    
                    // PROTECTION ANTI-BOUCLE INFINIE
                    if (!action.retryCount) action.retryCount = 0;
                    
                    // Erreurs critiques qui ne doivent pas être retentées
                    const criticalErrors = [
                        'Cannot read properties of undefined',
                        'Twitter client not found',
                        'getRwClientById is not a function'
                    ];
                    
                    const isCriticalError = criticalErrors.some(errMsg => error.message.includes(errMsg));
                    
                    if (isCriticalError) {
                        logSystem(`[SCHEDULER] Erreur critique détectée - abandon immédiat: ${error.message}`, 'automation', 'error');
                        // Supprimer l'action défaillante immédiatement
                        const index = actions.indexOf(action);
                        if (index > -1) actions.splice(index, 1);
                    } else if (action.retryCount < 3) {
                        action.retryCount++;
                        action.scheduledTime = Date.now() + (20 * 60 * 1000); // +20min au lieu de 5min
                        logSystem(`[SCHEDULER] Action reprogrammée (tentative ${action.retryCount}/3)`, 'automation', 'warn');
                    } else {
                        logSystem(`[SCHEDULER] Action abandonnée après 3 tentatives`, 'automation', 'error');
                        // Supprimer seulement cette action, pas tout le compte
                        const index = actions.indexOf(action);
                        if (index > -1) actions.splice(index, 1);
                    }
                }
            }
        }

        if (actionsProcessed > 0) {
            logSystem(`[SCHEDULER][DEFERRED] ${actionsProcessed} actions différées exécutées`, 'automation', 'info');
        }
    }

    /**
     * Exécute une action différée en réutilisant la logique existante
     */
    async executeDeferredAction(action, dependencies) {
        // Exécution réelle de l'action différée
        try {
            logSystem(`[SCHEDULER][DEFERRED] Début exécution action ${action.type} sur ${action.tweetId}`, 'automation', 'info');
            
            // Utiliser getRwClientById depuis les dependencies
            const { getRwClientById } = dependencies;
            const cli = await getRwClientById(action.acc.id, true); // skipValidation=true
            
            if (!cli) {
                throw new Error(`Twitter client not found for account ${action.acc.id}`);
            }

            // Récupérer les informations utilisateur (cache) - PROTECTION ANTI-ERREUR
            let userObj = null;
            try {
                const { userVerificationCache } = require('./oauth2-manager');
                const cacheKey = `${action.acc.id}_userinfo`;
                userObj = userVerificationCache?.get?.(cacheKey)?.data;
            } catch (cacheError) {
                logSystem(`[SCHEDULER][DEFERRED] Cache utilisateur indisponible: ${cacheError.message}`, 'automation', 'warn');
            }
            
            if (!userObj) {
                if (action.acc.authMethod === 'oauth2') {
                    const me = await cli.v2.me();
                    userObj = {
                        screen_name: me.data.username,
                        id_str: me.data.id,
                        name: me.data.name || me.data.username
                    };
                } else {
                    userObj = await cli.currentUser();
                }
            }

            // Exécuter l'action selon son type
            if (action.type === 'like') {
                await cli.v2.like(userObj.id_str, action.tweetId);
                logSystem(`[SCHEDULER][DEFERRED] Like exécuté: ${action.tweetId} par ${action.acc.username}`, 'automation', 'info');
            } else if (action.type === 'retweet') {
                await cli.v2.retweet(userObj.id_str, action.tweetId);
                logSystem(`[SCHEDULER][DEFERRED] Retweet exécuté: ${action.tweetId} par ${action.acc.username}`, 'automation', 'info');
            } else if (action.type === 'reply') {
                // Générer le commentaire avec l'IA
                const aiService = require('./ai');
                const { loadTokenSettings } = require('./tokenSettings');
                const tokenSettings = loadTokenSettings();
                const comments = await aiService.generateUniqueAIComments([action.tweet], { tokenSettings });
                const comment = comments[0] || "Great post! 🚀";
                
                await cli.v2.reply(comment, action.tweetId);
                logSystem(`[SCHEDULER][DEFERRED] Reply exécuté: "${comment}" sur ${action.tweetId} par ${action.acc.username}`, 'automation', 'info');
                
                // Marquer le tweet comme ayant reçu un reply (délai de 30min)
                markReplyToTweet(action.tweetId);
            }

            // Marquer l'action comme effectuée
            const { markActionAsPerformed } = require('./performed-actions');
            markActionAsPerformed(action.tweetId, action.acc.id, action.type);
            
            // Ajouter aux statistiques
            const { addAction } = require('./actions-stats');
            addAction(action.type);
            
            return { success: true, message: `Action ${action.type} exécutée avec succès` };
            
        } catch (error) {
            logSystem(`[SCHEDULER][DEFERRED] Erreur exécution action différée: ${error.message}`, 'automation', 'error');
            
            // Gestion des erreurs spécifiques
            const errorCode = error.code || error.status || 'UNKNOWN';
            if (errorCode === 400) {
                // Tweet invalide/supprimé - marquer comme effectué pour éviter les répétitions
                const { markActionAsPerformed } = require('./performed-actions');
                markActionAsPerformed(action.tweetId, action.acc.id, action.type);
            }
            
            throw error;
        }
    }

    /**
     * Obtient les statistiques du planning pour un compte
     */
    getScheduleStats(accountId) {
        const schedule = this.accountSchedules.get(accountId);
        if (!schedule) return null;

        const stats = {};
        ['like', 'retweet', 'reply'].forEach(actionType => {
            const slots = schedule[actionType] || [];
            const used = slots.filter(s => s.used).length;
            const total = slots.length;
            const nextSlot = slots.find(s => !s.used);
            
            stats[actionType] = {
                used,
                total,
                remaining: total - used,
                nextSlot: nextSlot ? new Date(nextSlot.timestamp).toLocaleTimeString() : null
            };
        });

        // Ajouter les statistiques des actions différées
        const deferredActions = this.deferredActions.get(accountId) || [];
        stats.deferred = {
            total: deferredActions.length,
            nextExecution: deferredActions.length > 0 ? 
                new Date(Math.min(...deferredActions.map(a => a.scheduledTime))).toLocaleTimeString() : null
        };

        return stats;
    }

    /**
     * Ajoute une fonction de nettoyage automatique des actions corrompues
     */
    cleanupCorruptedActions() {
        let totalCleaned = 0;
        
        for (const [accountId, actions] of this.deferredActions.entries()) {
            const validActions = actions.filter(action => {
                // Supprimer les actions trop anciennes (plus de 24h)
                const isOld = (Date.now() - action.addedAt) > (24 * 60 * 60 * 1000);
                // Supprimer les actions avec trop de tentatives
                const tooManyRetries = (action.retryCount || 0) >= 5;
                
                if (isOld || tooManyRetries) {
                    totalCleaned++;
                    return false;
                }
                return true;
            });
            
            this.deferredActions.set(accountId, validActions);
        }
        
        if (totalCleaned > 0) {
            logSystem(`[SCHEDULER] Nettoyage automatique: ${totalCleaned} actions corrompues supprimées`, 'automation', 'info');
        }
        
        return totalCleaned;
    }

    /**
     * Force le nettoyage complet de toutes les actions différées
     */
    forceCleanupAllDeferredActions() {
        let totalActions = 0;
        for (const actions of this.deferredActions.values()) {
            totalActions += actions.length;
        }
        
        this.deferredActions.clear();
        logSystem(`[SCHEDULER] NETTOYAGE FORCÉ: ${totalActions} actions différées supprimées`, 'automation', 'warn');
        return totalActions;
    }
}

// Instance globale du scheduler (sera initialisée avec les dependencies)
let actionScheduler = null;

/**
 * 🧰 CAPS RUNTIME PAR COMPTE (politique ultra-stricte - Phase 5)
 * - likes: 100 / 24h (réduit de 170)
 * - replies: 50 / 24h (réduit de 80)
 * - retweets: 3 / 15min (réduit de 5)
 * Implémentation via rate-limiter avec multiplicateurs et fenêtres spécifiques.
 */
const ONE_MIN = 60 * 1000;
const ONE_HOUR = 60 * ONE_MIN;
const ONE_DAY = 24 * ONE_HOUR;

const RUNTIME_CAPS = {
    like: { limit: 80, windowMs: ONE_DAY, actionKey: 'likes' },      // 🛡️ Aligné avec le code actuel
    retweet: { limit: 3, windowMs: 15 * ONE_MIN, actionKey: 'retweets' }, // 🛡️ Réduit de 5 à 3/15min
    reply: { limit: 150, windowMs: ONE_DAY, actionKey: 'comments' }    // 🛡️ Aligné avec le code actuel
};

// Initialiser le rate-limiter (idempotent)
rateLimiterService.initialize().catch(err => {
    logSystem(`[RATE-LIMITER] Init error: ${err.message}`, 'automation', 'error');
});

/**
 * Vérifie le cap runtime pour l'action et le compte donnés.
 * Retourne { allowed, remaining, resetTime }
 */
async function checkRuntimeCap(accountId, actionType) {
    try {
        const cfg = RUNTIME_CAPS[actionType];
        if (!cfg) {
            return { allowed: true, remaining: -1, resetTime: null };
        }
        // Calculer un multiplicateur dynamique pour atteindre exactement la limite cible,
        // en tenant compte du multiplicateur horaire interne.
        const baseDefault = (rateLimiterService.defaultLimits && rateLimiterService.defaultLimits.twitterAccount
            ? (rateLimiterService.defaultLimits.twitterAccount[cfg.actionKey] || rateLimiterService.defaultLimits.twitterAccount.total)
            : cfg.limit);
        const timeMul = typeof rateLimiterService.getTimeMultiplier === 'function'
            ? rateLimiterService.getTimeMultiplier()
            : 1;
        const computedMultiplier = baseDefault > 0 ? (cfg.limit / (baseDefault * timeMul)) : 1;

        const res = await rateLimiterService.checkLimit(
            'twitterAccount',
            accountId,
            cfg.actionKey,
            { window: cfg.windowMs, multiplier: computedMultiplier }
        );
        return res;
    } catch (e) {
        logSystem(`[CAPS][ERROR] checkRuntimeCap failed for ${accountId}:${actionType} - ${e.message}`, 'automation', 'error');
        // Fail-open pour ne pas bloquer en cas d'erreur système
        return { allowed: true, remaining: -1, resetTime: null };
    }
}

/**
 * Délai adaptatif basé sur la pression des quotas (remaining vs limit cible)
 */
async function adaptiveDelay(actionType, remaining, limit) {
    const base = ULTRA_OPTIMIZED_DELAYS[actionType];
    if (!base) {
        return randomDelay(actionType);
    }
    let factor = 1;
    if (typeof remaining === 'number' && remaining >= 0 && typeof limit === 'number' && limit > 0) {
        const ratio = remaining / limit; // proportion restante
        if (actionType === 'retweet') {
            // Caps très stricts sur 15min
            if (remaining <= 1) factor = 3;
            else if (remaining <= 2) factor = 2;
            else if (ratio < 0.5) factor = 1.5;
        } else if (actionType === 'like') {
            if (ratio <= 0.05) factor = 2.5; // <=10 restants
            else if (ratio <= 0.1) factor = 2; // <=20 restants
            else if (ratio <= 0.2) factor = 1.5; // <=40 restants
        } else if (actionType === 'reply') {
            if (ratio <= 0.05) factor = 2.5; // <=5 restants
            else if (ratio <= 0.1) factor = 2; // <=10 restants
            else if (ratio <= 0.2) factor = 1.5; // <=20 restants
        }
    }
    const min = Math.round(base.min * factor);
    const max = Math.round(base.max * factor);
    const ctx = `Adaptive ${actionType} spacing (factor x${factor}${typeof remaining === 'number' && limit ? `, remaining ${remaining}/${limit}` : ''})`;
    return randomDelay(min, max, ctx);
}

/**
 * Simple delay function
 * @param {number} ms - Delay in milliseconds
 * @returns {Promise} Promise that resolves after delay
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Function to create a random delay optimized by action type
 * @param {number|string} minSecondsOrActionType - Minimum delay in seconds OR action type
 * @param {number} maxSeconds - Maximum delay in seconds (optional if actionType)
 * @param {string} context - Context for log
 * @returns {Promise} Promise that resolves after delay
 */
async function randomDelay(minSecondsOrActionType, maxSeconds, context = '') {
    let minSeconds, maxSecondsActual;
    
    // If first parameter is an action type, use ultra-optimized delays
    if (typeof minSecondsOrActionType === 'string' && ULTRA_OPTIMIZED_DELAYS[minSecondsOrActionType]) {
        const actionType = minSecondsOrActionType;
        minSeconds = ULTRA_OPTIMIZED_DELAYS[actionType].min;
        maxSecondsActual = ULTRA_OPTIMIZED_DELAYS[actionType].max;
        context = context || `Action ${actionType}`;
    } else {
        // Classic usage with min/max in seconds
        minSeconds = minSecondsOrActionType;
        maxSecondsActual = maxSeconds;
    }
    
    const delayMs = Math.floor(Math.random() * (maxSecondsActual - minSeconds + 1) + minSeconds) * 1000;
    const delaySeconds = Math.floor(delayMs / 1000);
    
    if (context) {
        logSystem(`[DELAY] ${context} - Waiting ${delaySeconds}s before next action`, 'automation', 'info');
    }
    
    return new Promise(resolve => setTimeout(resolve, delayMs));
}

// Cache global pour éviter le re-traitement des mêmes tweets
const processedTweetsCache = new Map(); // tweetId -> timestamp
const CACHE_DURATION = 1 * 60 * 60 * 1000; // 1 heure - Optimized for better tweet availability

/**
 * Nettoie le cache des tweets traités (expire après 1h)
 */
function cleanProcessedTweetsCache() {
    const now = Date.now();
    let cleaned = 0;
    for (const [tweetId, timestamp] of processedTweetsCache.entries()) {
        if (now - timestamp > CACHE_DURATION) {
            processedTweetsCache.delete(tweetId);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        logSystem(`[CACHE-CLEANUP] Removed ${cleaned} expired tweets from processed cache`, 'automation', 'info');
    }
}

/**
 * Main automation function - Modular version
 * This function will be called from server.js with injected dependencies
 * @param {Object} dependencies - Dependencies injected from server.js
 */
async function runAutomationScan(dependencies) {
    try {
        // Prevent concurrent scans - exit immediately if already running
        if (global.isAutomationScanning === true) {
            logSystem('[SCAN-GUARD] Scan already in progress, skipping duplicate scan request', 'automation', 'warn');
            return { automationActive: dependencies.automationActive, isAutomationEnabled: dependencies.isAutomationEnabled };
        }
        
        // Mark scan start for dynamic status
        global.isAutomationScanning = true;
        
        // Démarrer le monitoring de récupération
        const { getScanRecoveryService } = require('./scan-recovery');
        const scanRecoveryService = getScanRecoveryService();
        scanRecoveryService.markScanStart();
        
        // Nettoyer le cache des tweets traités
        cleanProcessedTweetsCache();
        
        // Dynamic retrieval of injected AI Token Settings
    const aiTokenSettings = dependencies.aiTokenSettings || { tokenSymbol: '', tokenName: '', tokenX: '', tokenChain: '' };

    let { enabledActions } = dependencies;
    if (!enabledActions || !Array.isArray(enabledActions)) enabledActions = ['like', 'retweet', 'reply'];
    
    const {
        getAllConnectedAccounts, watchAccounts, lastTweetId, isAutomationEnabled, automationActive,
        rateLimitState, performedActionsDB,
        getRwClientById, generateUniqueAIComments, markActionAsPerformed, hasActionBeenPerformed,
        logSystemAction, pushLiveLog, randomDelay
    } = dependencies;

    // 🔄 RÉCUPÉRATION DYNAMIQUE DES COMPTES À CHAQUE SCAN
    logSystem(`[DEBUG] getAllConnectedAccounts type: ${typeof getAllConnectedAccounts}`, 'automation', 'debug');
    logSystem(`[DEBUG] dependencies keys: ${Object.keys(dependencies).join(', ')}`, 'automation', 'debug');
    
    if (typeof getAllConnectedAccounts !== 'function') {
        throw new Error(`getAllConnectedAccounts is not a function, got: ${typeof getAllConnectedAccounts}`);
    }
    
    const accounts = getAllConnectedAccounts();
    logSystem(`[DYNAMIC] Récupération dynamique: ${accounts.length} comptes connectés`, 'automation', 'info');
    
    // 🔍 DEBUG: Lister tous les comptes récupérés
    accounts.forEach((account, index) => {
        logSystem(`[DEBUG][ACCOUNT-${index + 1}] ID: ${account.id}, Username: ${account.username}, AuthMethod: ${account.authMethod}`, 'automation', 'debug');
    });

    // CRITICAL FIX: Use the shared mutedAccounts reference from dependencies
    // DO NOT create a new Map - use the original reference to maintain state
    const { mutedAccounts } = dependencies;
    if (!mutedAccounts || typeof mutedAccounts !== 'object' || typeof mutedAccounts.has !== 'function') {
        logSystem('[ERROR] mutedAccounts is not a valid Map - automation may not work correctly', 'automation', 'error');
        return { automationActive, isAutomationEnabled };
    }

        // --- Clean expired muted accounts ---
        logSystem(`[DEBUG] Before cleanup: ${mutedAccounts.size} muted accounts in memory`, 'automation', 'debug');
        if (mutedAccounts.size > 0) {
            const now = Date.now();
            for (const [accountId, muteUntil] of mutedAccounts.entries()) {
                const timeLeft = muteUntil - now;
                const timeLeftMin = Math.round(timeLeft / 60000);
                logSystem(`[DEBUG] Account ${accountId} muted until ${new Date(muteUntil).toLocaleTimeString()} (${timeLeftMin}min remaining)`, 'automation', 'debug');
            }
        }
        
        const cleanedCount = cleanExpiredMutedAccounts(mutedAccounts);
        if (cleanedCount > 0) {
            logSystem(`[AUTOMATION] Cleaned ${cleanedCount} expired muted accounts before scan`, 'automation', 'info');
        }
        
        logSystem(`[DEBUG] After cleanup: ${mutedAccounts.size} muted accounts remaining`, 'automation', 'debug')

        // --- Heartbeat log avec timeout de sécurité ---
        let scanActive = true;
        let lastHeartbeat = Date.now();
        const heartbeatInterval = 300000; // 5 minutes
        const maxScanDuration = 600000; // 10 minutes timeout maximum
        
        function heartbeat() {
            if (!scanActive) return;
            const scanDuration = Date.now() - lastHeartbeat;
            
            // SÉCURITÉ: Forcer l'arrêt si le scan dure plus de 10 minutes
            if (scanDuration > maxScanDuration) {
                logSystem(`[TIMEOUT] Scan forcé à s'arrêter après ${Math.round(scanDuration/60000)}min - déblocage automatique`, 'automation', 'error');
                scanActive = false;
                global.isAutomationScanning = false;
                throw new Error(`Scan timeout after ${Math.round(scanDuration/60000)} minutes - auto-recovery triggered`);
            }
            
            // Log seulement si le scan dure plus de 2 minutes
            if (scanDuration > 120000) { // 2 minutes
                logSystem(`[HEARTBEAT] Long automation scan in progress (${Math.round(scanDuration/60000)}min)`, 'automation', 'info');
            }
            lastHeartbeat = Date.now();
            setTimeout(heartbeat, heartbeatInterval);
        }
        setTimeout(heartbeat, heartbeatInterval);

        pushLiveLog('[AUTO] Starting automation scan...');
        logSystem(`[DEBUG][SCAN] Connected X accounts: ${accounts.map(a => a.username).join(', ')}`, 'automation', 'debug');
        
        // Vérifier les quotas avec le système master unifié
        const { getMasterQuotaManager } = require('./master-quota-manager');
        const masterQuota = getMasterQuotaManager();
        
        // 📅 INITIALISER LES PLANNINGS 24H POUR TOUS LES COMPTES - PHASE 6
        // Initialiser le scheduler si pas encore fait
        if (!actionScheduler) {
            actionScheduler = new ActionScheduler(dependencies);
            actionScheduler.startDeferredActionsProcessor();
        }
        
        for (const account of accounts) {
            actionScheduler.calculateOptimalSchedule(account.id, {
                like: RUNTIME_CAPS.like.limit,
                retweet: RUNTIME_CAPS.retweet.limit,
                reply: RUNTIME_CAPS.reply.limit
            });
        }

        // Vérifier si au moins un compte peut effectuer des actions
        let hasAvailableQuota = false;
        for (const account of accounts) {
            const quotaCheck = masterQuota.canPerformAction(account.id);
            if (quotaCheck.allowed && quotaCheck.dailyRemaining > 0) {
                hasAvailableQuota = true;
                break;
            }
        }
        
        if (!hasAvailableQuota) {
            logSystem('[QUOTA][AUTO] Quota reached, complete automation stop.', 'automation', 'warn');
            pushLiveLog('[AUTO] Quota reached, complete automation stop.');
            if (automationActive || isAutomationEnabled) {
                logSystem('[QUOTA][AUTO] Quota reached, complete automation stop (API polling disabled).', 'automation', 'warn');
            }
            return { automationActive: false, isAutomationEnabled: false };
        }
        
        if (!isAutomationEnabled) {
            logSystemAction('Automation is paused (isAutomationEnabled=false)', 'system');
            pushLiveLog('[AUTO] Automation disabled (isAutomationEnabled=false), no action.');
            logSystem('[AUTO][DEBUG] Automation disabled (isAutomationEnabled=false), no action.', 'automation', 'debug');
            return { automationActive, isAutomationEnabled };
        }
        
        if (!accounts.length) {
            pushLiveLog('[AUTO] No Twitter account connected, automation impossible.');
            logSystem('[AUTO][DEBUG] No Twitter account connected, automation impossible.', 'automation', 'debug');
            return { automationActive, isAutomationEnabled };
        }
        
        if (!watchAccounts.length) {
            pushLiveLog('[AUTO] No accounts to monitor (watchAccounts empty), automation impossible.');
            logSystem('[AUTO][DEBUG] No accounts to monitor (watchAccounts empty), automation impossible.', 'automation', 'debug');
            return { automationActive, isAutomationEnabled };
        }

        pushLiveLog(`[AUTO] Searching for new tweets from: ${watchAccounts.join(', ')}`);
        logSystem(`[AUTO] Searching for new tweets from: ${watchAccounts.join(', ')}`, 'automation', 'info');

        if (!watchAccounts.length) {
            logSystem('[AUTO] No accounts to monitor, request not sent.', 'automation', 'debug');
            return { automationActive, isAutomationEnabled };
        }

        // Clean usernames: remove commas, spaces and unwanted characters
        const allPseudos = watchAccounts
            .filter(p => typeof p === 'string' && p.trim())
            .map(p => p.trim().replace(/[,\s]+/g, '').replace(/^@/, ''))
            .filter(p => p.length > 0);

        const MAX_FROM_PER_QUERY = 5; // Keep at 5 - fewer API calls is better than more calls
        let allTweets = [];
        let allUsers = [];
        let newestId = lastTweetId;
        let client;
        let searchAccountId = null;
        
        // Circuit breaker for 403 errors
        let consecutiveErrors = 0;
        const MAX_CONSECUTIVE_ERRORS = 3;
        
        // 🔄 ROTATION INTELLIGENTE DES COMPTES DE RECHERCHE
        const availableAccounts = accounts.filter(account => {
            // Ignorer les comptes mutés
            if (mutedAccounts.has(account.id)) {
                return false;
            }
            
            // Vérifier si ce compte est en rate limit
            if (rateLimitTracker.has(account.id)) {
                const tracker = rateLimitTracker.get(account.id);
                const now = Date.now();
                const timeSinceLastError = now - tracker.lastError;
                const delayInfo = calculateRateLimitDelay(account.id);
                
                if (timeSinceLastError < delayInfo.delayMs) {
                    return false;
                }
            }
            
            return true;
        });
        
        if (availableAccounts.length === 0) {
            logSystem(`[ERROR] No available account for Twitter search - all accounts may be rate limited`, 'automation', 'error');
            pushLiveLog(`[WARNING] Aucun compte disponible pour la recherche - tous en rate limit`);
            
            return { 
                automationActive, 
                isAutomationEnabled, 
                lastTweetId: newestId,
                foundTweets: [],
                warning: 'No accounts available for search'
            };
        }
        
        // Utiliser la rotation pour sélectionner le compte
        let { searchAccountIndex } = dependencies;
        if (typeof searchAccountIndex !== 'number') {
            searchAccountIndex = 0;
        }
        const selectedAccount = availableAccounts[searchAccountIndex % availableAccounts.length];
        
        // Incrémenter l'index pour la prochaine rotation et le sauvegarder globalement
        const nextIndex = (searchAccountIndex + 1) % availableAccounts.length;
        dependencies.searchAccountIndex = nextIndex;
        
        // Mettre à jour l'index global dans server.js
        if (dependencies.updateSearchAccountIndex) {
            dependencies.updateSearchAccountIndex(nextIndex);
        }
        
        try {
            // Utiliser skipValidation=true pour les recherches (cache + éviter v2.me())
            client = await getRwClientById(selectedAccount.id, true);
            searchAccountId = selectedAccount.id;
            logSystem(`[SUCCESS] Using account ${selectedAccount.username} (${selectedAccount.id}) for Twitter search [rotation: ${searchAccountIndex % availableAccounts.length}/${availableAccounts.length}]`, 'automation', 'info');
        } catch (error) {
            logSystem(`[ERROR] Cannot use account ${selectedAccount.username} for search: ${error.message}`, 'automation', 'error');
            
            // Si c'est une erreur 429, l'enregistrer dans le tracker
            if (error.message.includes('429') || error.message.includes('Rate limit')) {
                calculateRateLimitDelay(selectedAccount.id);
                logSystem(`[RATE-LIMIT] Account ${selectedAccount.username} added to rate limit tracker`, 'automation', 'warn');
            }
            
            // Fallback: essayer les autres comptes disponibles
            for (const account of availableAccounts) {
                if (account.id === selectedAccount.id) continue;
                
                try {
                    client = await getRwClientById(account.id, true);
                    searchAccountId = account.id;
                    logSystem(`[FALLBACK] Using account ${account.username} (${account.id}) for Twitter search`, 'automation', 'info');
                    break;
                } catch (fallbackError) {
                    logSystem(`[ERROR] Fallback account ${account.username} also failed: ${fallbackError.message}`, 'automation', 'error');
                    continue;
                }
            }
        }
        
        // Si aucun compte n'est disponible pour la recherche
        if (!client) {
            logSystem(`[ERROR] No available account for Twitter search - all accounts may be rate limited`, 'automation', 'error');
            pushLiveLog(`[WARNING] Aucun compte disponible pour la recherche - tous en rate limit`);
            
            // NE PAS ARRÊTER L'AUTOMATION - juste reporter le scan
            return { 
                automationActive, 
                isAutomationEnabled, 
                lastTweetId: newestId,
                foundTweets: [],
                warning: 'No accounts available for search'
            };
        }

        pushLiveLog(`[AUTO] Twitter search in progress for ${allPseudos.length} username(s)...`);
        
        for (let i = 0; i < allPseudos.length; i += MAX_FROM_PER_QUERY) {
            const batch = allPseudos.slice(i, i + MAX_FROM_PER_QUERY);
            logSystem(`[DEBUG] Username batch (${batch.length}/10): ${batch.join(', ')}`, 'automation', 'debug');

            if (batch.length === 0) continue;

            const queryBase = batch.map(p => `from:${p}`).join(' OR ');
            if (!queryBase) continue;

            // Enhanced filtering: exclude retweets, replies, quotes and old tweets
            const searchQuery = `${queryBase} -is:retweet -is:reply -is:quote`;
            logSystem('[AUTO] Query sent to Twitter: ' + searchQuery, 'automation', 'info');

            // Correct parameters for API v2
            const searchOptions = {
                'tweet.fields': ['created_at', 'author_id', 'public_metrics', 'referenced_tweets', 'in_reply_to_user_id'],
                'user.fields': ['username'],
                expansions: ['author_id'],
                max_results: 50,
            };

            // Validate and format since_id correctly
            if (lastTweetId && typeof lastTweetId === 'string' && lastTweetId.match(/^\d+$/)) {
                searchOptions.since_id = lastTweetId;
            }

            logSystem('[DEBUG] Twitter query: ' + searchQuery, 'automation', 'debug');
            logSystem('[DEBUG] Twitter options: ' + JSON.stringify(searchOptions), 'automation', 'debug');

            let searchResult;
            try {
                logSystem(`[AUTO][WAIT] Twitter API call in progress (may take several seconds)...`, 'automation', 'info');
                // Correct syntax for API v2: search(query, options)
                searchResult = await client.v2.search(searchQuery, searchOptions);
                logSystem('[DEBUG] Raw Twitter response: ' + JSON.stringify(searchResult, null, 2).substring(0, 500) + '...', 'automation', 'debug');
            } catch (searchError) {
                logSystem(`[ERROR] Error during Twitter search: ${searchError.message || JSON.stringify(searchError)}`, 'automation', 'error');
                pushLiveLog(`[ERROR] Twitter search failed: ${searchError.message}`);
                
                // Circuit breaker for 403 errors
                if (searchError.code === 403 || searchError.message?.includes('403')) {
                    consecutiveErrors++;
                    logSystem(`[CIRCUIT-BREAKER] 403 error detected (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})`, 'automation', 'warn');
                    
                    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                        logSystem(`[CIRCUIT-BREAKER] Too many 403 errors, waiting 5 minutes before continuing`, 'automation', 'error');
                        await delay(300000); // 5 minutes
                        consecutiveErrors = 0;
                    }
                } else {
                    consecutiveErrors = 0; // Reset on non-403 errors
                }
                
                continue;
            }

            const tweets = searchResult?._realData?.data || [];
            
            // Mettre à jour les métriques dashboard pour les tweets détectés
            updateDashboardMetrics('tweets_detected', { count: tweets.length });
            
            if (tweets.length) {
                allTweets.push(...tweets);
                if (searchResult._realData?.includes?.users) {
                    allUsers.push(...searchResult._realData.includes.users);
                }
                logBatch(Math.floor(i/MAX_FROM_PER_QUERY) + 1, tweets.length);
            } else {
                logBatch(Math.floor(i/MAX_FROM_PER_QUERY) + 1, 0);
            }

            // Adaptive delay between batches based on recent errors
            if (i + MAX_FROM_PER_QUERY < allPseudos.length) {
                const adaptiveDelayType = consecutiveErrors > 0 ? 'betweenAccounts' : 'betweenBatches';
                await randomDelay(adaptiveDelayType);
            }
            
            // Reset consecutive errors on successful batch
            consecutiveErrors = 0;
        }

        logBatchSummary();

        // Filter valid tweets (age, content, etc.) + déduplication
        const validTweets = [];
        let duplicatesSkipped = 0;
        
        for (const tweet of allTweets) {
            // Vérifier si le tweet a déjà été traité récemment
            if (processedTweetsCache.has(tweet.id)) {
                const processedTime = processedTweetsCache.get(tweet.id);
                const timeSinceProcessed = Date.now() - processedTime;
                if (timeSinceProcessed < CACHE_DURATION) {
                    duplicatesSkipped++;
                    continue; // Skip déjà traité
                }
            }
            
            // Age validation (24h max)
            const tweetAge = Date.now() - new Date(tweet.created_at).getTime();
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours
            
            if (tweetAge > maxAge) {
                const ageHours = Math.floor(tweetAge / (60 * 60 * 1000));
                logFilter(tweet.id, `too old (${ageHours}h)`);
                continue;
            }
            
            // Content validation (no replies, retweets - quotes are allowed)
            if (tweet.referenced_tweets && tweet.referenced_tweets.length > 0) {
                const refType = tweet.referenced_tweets[0].type;
                
                // Allow quotes, but filter out replies and retweets
                if (refType === 'replied_to' || refType === 'retweeted') {
                    logFilter(tweet.id, `with references (${refType})`);
                    continue;
                }
                // Quotes (quoted tweets) are now allowed to pass through
            }
            
            // Validate tweet content
            validTweets.push(tweet);
        }
        
        if (duplicatesSkipped > 0) {
            logSystem(`[DEDUP] Skipped ${duplicatesSkipped} already processed tweets`, 'automation', 'info');
        }
        
        logFilterSummary(validTweets.length);
        pushLiveLog(`[AUTO] ${validTweets.length} valid tweets found`);
        
        // Note: Les métriques d'actions validées seront mises à jour après génération des actions

        if (validTweets.length === 0) {
            logSystem('[AUTO] No valid tweets found after filtering, scan ended.', 'automation', 'info');
            scanActive = false;
            global.isAutomationScanning = false;
            return { automationActive, isAutomationEnabled };
        }

        // Replace allTweets with validated tweets
        allTweets = validTweets;

        // Update lastTweetId with the most recent
        if (allTweets.length > 0) {
            const sortedTweets = allTweets.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            newestId = sortedTweets[0].id;
        }

        // --- DEBUG LOG: tweets before action generation (reduced) ---
        logSystem(`[DEBUG][TWEETS_SUMMARY] Processing ${allTweets.length} tweets for action generation`, 'automation', 'debug');
        // 🎯 NEW UNIFIED SYSTEM: Generate actions according to automatic probabilities
        const actions = [];
        let debugActionCount = 0;
        
        for (const tweet of allTweets) {
            const author = allUsers.find(u => u.id === tweet.author_id);
            const pseudo = author ? author.username : 'unknown';

            // Generate actions for each connected account with the new system
            for (const account of accounts) {
                // Reduce debug logs - only log every 10th action generation
                if (debugActionCount % 10 === 0) {
                    logSystem(`[DEBUG][ACTION-GEN] Processing batch: ${account.username} (${account.id}) - tweet ${debugActionCount + 1}/${allTweets.length * accounts.length}`, 'automation', 'debug');
                }
                debugActionCount++;
                
                // Use the master quota system to determine actions
                const masterQuota = getMasterQuotaManager();
                const actionDecision = masterQuota.determineActionsForTweet(account.id, tweet.id);
                
                // Only log decisions that result in actions
                if (actionDecision.actions.length > 0) {
                    logSystem(`[DEBUG][ACTION-DECISION] Account ${account.username}: ${actionDecision.actions.length} actions, reason: ${actionDecision.reason}`, 'automation', 'debug');
                }
                
                if (actionDecision.actions.length > 0) {
                    logSystem(`[MASTER-QUOTA] Actions determined for ${account.username} on tweet ${tweet.id}: ${actionDecision.actions.join(', ')}`, 'automation', 'info');
                    
                    // Use account ID directly from already retrieved userObj
                    for (const actionType of actionDecision.actions) {
                        actions.push({
                            type: actionType,
                            tweetId: tweet.id,
                            pseudo: pseudo,
                            acc: account,
                            tweet: tweet
                        });
                    }
                } else {
                    logSystem(`[MASTER-QUOTA] No action for ${account.username} on tweet ${tweet.id}: ${actionDecision.reason}`, 'automation', 'debug');
                }
            }
        }

        logSystem(`[DEBUG][ACTIONS_SUMMARY] ${actions.length} action(s) generated for execution`, 'automation', 'debug');
        pushLiveLog(`[AUTO] ${actions.length} actions scheduled`);
        
        // Mettre à jour les métriques dashboard pour les actions exécutées
        const actionsByAccountExecuted = {};
        actions.forEach(action => {
            const accountName = action.acc?.username || 'unknown';
            actionsByAccountExecuted[accountName] = (actionsByAccountExecuted[accountName] || 0) + 1;
        });
        
        Object.entries(actionsByAccountExecuted).forEach(([account, count]) => {
            updateDashboardMetrics('actions_executed', { account, count });
        });

        if (actions.length === 0) {
            logSystem('[AUTO] No actions to perform, scan ended.', 'automation', 'info');
            return { automationActive, isAutomationEnabled, lastTweetId: newestId };
        }

        // Marquer tous les tweets comme traités AVANT l'exécution des actions
        const now = Date.now();
        validTweets.forEach(tweet => {
            processedTweetsCache.set(tweet.id, now);
        });
        logSystem(`[CACHE] Marked ${validTweets.length} tweets as processed to prevent re-processing`, 'automation', 'info');
        
        // Execute actions sequentially with scan protection
        let actionCount = 0;
        const maxActionsPerScan = 100; // Limit actions per scan to prevent infinite loops
        
        // Track muted accounts to group logs
        const mutedAccountsInBatch = new Set();
        
        for (const action of actions) {
            // Safety check: prevent infinite action processing
            if (actionCount >= maxActionsPerScan) {
                logSystem(`[SCAN-LIMIT] Maximum actions per scan reached (${maxActionsPerScan}), stopping to prevent loops`, 'automation', 'warn');
                break;
            }
            const accId = action.acc.id;
            
            // Check if account is muted (with automatic cleanup)
            if (mutedAccounts.has(accId)) {
                const muteUntil = mutedAccounts.get(accId);
                if (muteUntil > Date.now()) {
                    // Only log once per batch per account to reduce spam
                    if (!mutedAccountsInBatch.has(accId)) {
                        logSystem(`[MUTED] Account ${action.acc.username} muted until ${new Date(muteUntil).toLocaleString()}, actions ignored`, 'automation', 'info');
                        mutedAccountsInBatch.add(accId);
                    }
                    continue;
                } else {
                    // Account mute has expired, remove it and log unmuting
                    mutedAccounts.delete(accId);
                    logSystem(`[UNMUTE] Account ${action.acc.username} automatically unmuted (pause expired)`, 'automation', 'info');
                }
            }

    let cli;
    try {
        // OPTIMISATION: Skip validation pour éviter double appel v2.me()
        cli = await getRwClientById(accId, true); // skipValidation=true
        if (!cli) {
            logSystem(`[ERROR] Twitter client not found for account ${accId}, skipping action`, 'automation', 'error');
            continue;
        }
    } catch (error) {
        logSystem(`[ERROR] Unable to create Twitter client for ${accId}: ${error.message}`, 'automation', 'error');
        
        // Handle specific error types with shorter mute times to prevent long blocks
        const errorCode = error.code || error.status || 'UNKNOWN';
        
        if (errorCode === 429) {
            // Rate limit error - shorter mute to avoid long blocks
            mutedAccounts.set(accId, Date.now() + 2 * 60 * 1000); // 2 minutes pause
            logSystem(`[429][${action.acc.username}] Account muted for 2min due to rate limit during client creation`, 'automation', 'warn');
        } else if (error.message.includes('Token expiré') || error.message.includes('refresh échoué')) {
            // Expired token error - shorter mute
            mutedAccounts.set(accId, Date.now() + 10 * 60 * 1000); // 10 minutes pause
            logSystem(`[OAUTH2] Account ${accId} muted for 10min - expired token`, 'automation', 'warn');
        } else {
            // Other errors - very short pause to avoid spam
            mutedAccounts.set(accId, Date.now() + 1 * 60 * 1000); // 1 minute pause
            logSystem(`[ERROR] Account ${accId} muted for 1min - client creation failed`, 'automation', 'error');
        }
        continue;
        }

        // Get user information (compatible OAuth 1.0a + OAuth 2.0)
        let userObj;
        try {
            // Vérifier le cache avant l'appel API (30 minutes)
            const cacheKey = `${accId}_userinfo`;
            const cached = userVerificationCache.get(cacheKey);
            const now = Date.now();
            
            if (cached && (now - cached.timestamp) < 1800000) { // 30 minutes
                userObj = cached.data;
                logSystem(`[CACHE] Using cached user info for ${action.acc.username}`, 'automation', 'debug');
            } else {
                // Appel API selon la méthode d'auth
                if (action.acc.authMethod === 'oauth2') {
                    const me = await cli.v2.me();
                    userObj = {
                        screen_name: me.data.username,
                        id_str: me.data.id,
                        name: me.data.name || me.data.username
                    };
                } else {
                    // OAuth 1.0a: use currentUser()
                    userObj = await cli.currentUser();
                }
                
                // Mettre en cache
                userVerificationCache.set(cacheKey, {
                    data: userObj,
                    timestamp: now
                });
                logSystem(`[CACHE] Cached user info for ${action.acc.username}`, 'automation', 'debug');
            }
        } catch (e) {
                const errorCode = e.code || e.status || 'UNKNOWN';
                
                if (errorCode === 401 && action.acc.authMethod === 'oauth2') {
                    logSystem(`[TOKEN-EXPIRED] OAuth2 token expired for ${action.acc.username} (${accId}) - Attempting refresh`, 'automation', 'warn');
                    
                    // Tenter le refresh automatique du token
                    try {
                        const { oauth2Manager } = require('./oauth2-manager');
                        const refreshedUser = await oauth2Manager.refreshUserToken(accId);
                        
                        if (refreshedUser) {
                            logSystem(`[TOKEN-REFRESH] Successfully refreshed token for ${action.acc.username} - Continuing automation`, 'automation', 'info');
                            
                            // Créer un nouveau client avec le token rafraîchi
                            cli = getRwClientById(accId);
                            
                            // Retry l'appel v2.me() avec le nouveau token
                            const me = await cli.v2.me();
                            userObj = {
                                screen_name: me.data.username,
                                id_str: me.data.id,
                                name: me.data.name || me.data.username
                            };
                            
                            logSystem(`[TOKEN-REFRESH] User info retrieved successfully after refresh for ${action.acc.username}`, 'automation', 'info');
                        }
                    } catch (refreshError) {
                        logSystem(`[TOKEN-REFRESH] Failed to refresh token for ${action.acc.username}: ${refreshError.message}`, 'automation', 'error');
                        
                        // Si le refresh échoue, mettre en pause pour 5 minutes seulement
                        const mutedUntil = Date.now() + (5 * 60 * 1000);
                        mutedAccounts.set(accId, mutedUntil);
                        logSystem(`[MUTE] Account ${action.acc.username} muted until ${new Date(mutedUntil).toLocaleTimeString()} (refresh failed)`, 'automation', 'warn');
                        continue;
                    }
                } else {
                    logSystem(`[ERROR] Unable to get user info for ${accId} (${action.acc.authMethod || 'oauth1a'}): ${e.message}`, 'automation', 'error');
                    continue;
                }
            }

            // Reduced debug logging - only log actual executions, not all attempts
            if (actionCount % 5 === 0) {
                logSystem(`[DEBUG][ACTION_BATCH] Processing action ${actionCount + 1}/${actions.length}: [${action.acc.username}] ${action.type}`, 'automation', 'debug');
            }

            // --- Like ---
            if (action.type === 'like' && !hasActionBeenPerformed(action.tweetId, accId, 'like')) {
                // 📅 VÉRIFICATION SCHEDULER 24H - PHASE 6
                const scheduleCheck = actionScheduler.canPerformActionNow(accId, 'like');
                if (!scheduleCheck.allowed) {
                    logSystem(`[SCHEDULER][LIKE][${action.acc.username}] Action différée: ${scheduleCheck.reason}`, 'automation', 'info');
                    pushLiveLog(`[SCHEDULER][${action.acc.username}] Like différé - ${scheduleCheck.reason}`);
                    
                    // Ajouter l'action à la queue des actions différées
                    const nextAvailableTime = Date.now() + (scheduleCheck.waitTime || 10 * 60 * 1000);
                    actionScheduler.addDeferredAction(accId, action, nextAvailableTime);
                    continue;
                }

                // Vérification cap runtime (80/24h)
                const cap = await checkRuntimeCap(accId, 'like');
                let lastCapInfo = cap;
                if (!cap.allowed) {
                    const waitMin = cap.resetTime ? Math.ceil((cap.resetTime - Date.now()) / 60000) : null;
                    logSystem(`[CAP_REACHED][LIKE][${action.acc.username}] Limite atteinte (80/24h). Remaining=0. Reset in ${waitMin !== null ? waitMin + 'min' : 'unknown'}`, 'automation', 'warn');
                    pushLiveLog(`[CAP][${action.acc.username}] Like skip - cap atteint (${waitMin !== null ? waitMin + 'min' : '?'})`);
                    // Délai court fixe pour éviter burst (pas d'adaptatif qui peut bloquer)
                    await delay(2000); // 2 secondes fixe
                    continue;
                }
                try {
                    // Utiliser l'ID du compte directement depuis userObj déjà récupéré
                    const userId = String(userObj.id_str || userObj.id || (userObj.data && userObj.data.id));
                    
                    const likeResult = await cli.v2.like(userId, action.tweetId);
                    
                    // 🚀 MONITORING RATE LIMITS - PHASE 3
                    if (likeResult.rateLimit) {
                        rateLimitState[accId] = { ...rateLimitState[accId], ...likeResult.rateLimit };
                        const remaining = likeResult.rateLimit.remaining || 0;
                        const limit = likeResult.rateLimit.limit || 0;
                        const resetTime = likeResult.rateLimit.reset || 0;
                        
                        logSystem(`[RATE-LIMIT][LIKE] ${action.acc.username}: ${remaining}/${limit} remaining, reset: ${new Date(resetTime * 1000).toLocaleTimeString()}`, 'automation', 'info');
                        
                        // Alert if close to limit
                        if (remaining < limit * 0.1) {
                            logSystem(`[RATE-LIMIT-WARNING][LIKE] ${action.acc.username}: Only ${remaining} likes remaining!`, 'automation', 'warn');
                        }
                    }
                    
                    markActionAsPerformed(action.tweetId, accId, 'like');
                    
                    // Décrémenter le quota APRÈS succès de l'action avec master-quota-manager
                    const masterQuota = getMasterQuotaManager();
                    const quotaCheck = masterQuota.consumeAction(accId, 'like');
                    if (!quotaCheck.success) {
                        logSystem(`[QUOTA-WARNING][${action.acc.username}] Quota exceeded after like on tweet ${action.tweetId}`, 'automation', 'warn');
                    }
                    
                    // Obtenir les nouvelles statistiques du quota master
                    const masterStats = masterQuota.getStats();
                    const accountStats = masterStats.activeAccounts.find(acc => acc.id === accId) || {};
                    
                    // Calculer les métriques pour le log
                    const dailyUsed = Object.values(accountStats.dailyUsed || {}).reduce((sum, val) => sum + val, 0);
                    const dailyLimit = masterStats.allocation?.perAccountDaily || 150;
                    
                    // Enriched log with all information
                    const enrichedLogData = {
                        type: 'like',
                        level: 'info',
                        account: action.acc.username,
                        accountId: action.acc.id,
                        tweetId: action.tweetId,
                        tweetUrl: `https://twitter.com/i/status/${action.tweetId}`,
                        targetUser: action.pseudo,
                        targetUserId: action.tweet.author_id,
                        message: `Like on tweet from @${action.pseudo}`,
                        tweetText: action.tweet.text ? action.tweet.text.substring(0, 100) + '...' : 'Contenu non disponible',
                        metadata: {
                            actionTime: new Date().toISOString(),
                            quotaUsed: dailyUsed,
                            quotaLimit: dailyLimit,
                            quotaRemaining: dailyLimit - dailyUsed,
                            accountId: accId,
                            accountUsername: action.acc.username,
                            tweetCreatedAt: action.tweet.created_at,
                            globalQuotaUsed: masterStats.globalPack?.usedActions || 0,
                            globalQuotaTotal: masterStats.globalPack?.totalActions || 0
                        }
                    };
                    
                    pushLiveLog(`[${action.acc.username}] Like tweet ${action.tweetId} de @${action.pseudo} (${dailyUsed}/${dailyLimit})`);
                    
                    // Log enrichi pour l'API actions-history
                    logToFile(JSON.stringify({
                        timestamp: new Date().toISOString(),
                        type: 'like',
                        level: 'info',
                        message: `[${action.acc.username}] Like tweet ${action.tweetId} de @${action.pseudo} (${dailyUsed}/${dailyLimit})`,
                        metadata: { legacy: true },
                        account: action.acc.username,
                        tweetId: action.tweetId,
                        targetUser: action.pseudo
                    }));
                    
                    logSystem(JSON.stringify(enrichedLogData), 'automation', 'info');
                    
                    // Ajouter au cache persistant des statistiques
                    addAction('like');
                } catch (e) {
                    // Gestion détaillée des erreurs API v2
                    const errorCode = e.code || e.status || 'UNKNOWN';
                    const errorMessage = e.message || e.data?.detail || JSON.stringify(e);
                    
                    logSystem(`[ERROR][${action.acc.username}] like tweet ${action.tweetId} - Code: ${errorCode} - Message: ${errorMessage}`, 'automation', 'error');
                    
                    // Specific handling of 400, 403 and 429 errors
                    if (errorCode === 400) {
                        // Error 400: Invalid/deleted/protected tweet - use centralized handler
                        handleInvalidTweetError(action.tweetId, accId, action.acc.username);
                    } else if (errorCode === 403) {
                        // Use new authorization error handling system
                        handleAuthorizationError(accId, action.acc.username, 'like', mutedAccounts);
                    } else if (errorCode === 429) {
                        // Use new rate limiting handling system
                        handleRateLimitError(accId, action.acc.username, 'like', mutedAccounts);
                    }
                }
            }

            // --- Retweet ---
            if (action.type === 'retweet' && enabledActions.includes('retweet') && !hasActionBeenPerformed(action.tweetId, accId, 'retweet')) {
                // 📅 VÉRIFICATION SCHEDULER 24H - PHASE 6
                const scheduleCheck = actionScheduler.canPerformActionNow(accId, 'retweet');
                if (!scheduleCheck.allowed) {
                    logSystem(`[SCHEDULER][RETWEET][${action.acc.username}] Action différée: ${scheduleCheck.reason}`, 'automation', 'info');
                    pushLiveLog(`[SCHEDULER][${action.acc.username}] Retweet différé - ${scheduleCheck.reason}`);
                    
                    // Ajouter l'action à la queue des actions différées
                    const nextAvailableTime = Date.now() + (scheduleCheck.waitTime || 10 * 60 * 1000);
                    actionScheduler.addDeferredAction(accId, action, nextAvailableTime);
                    continue;
                }

                // Vérification cap runtime (3/15min)
                const cap = await checkRuntimeCap(accId, 'retweet');
                let lastCapInfo = cap;
                if (!cap.allowed) {
                    const waitMin = cap.resetTime ? Math.ceil((cap.resetTime - Date.now()) / 60000) : null;
                    logSystem(`[CAP_REACHED][RETWEET][${action.acc.username}] Limite atteinte (5/15min). Remaining=0. Reset in ${waitMin !== null ? waitMin + 'min' : 'unknown'}`, 'automation', 'warn');
                    pushLiveLog(`[CAP][${action.acc.username}] RT skip - cap atteint (${waitMin !== null ? waitMin + 'min' : '?'})`);
                    // Délai court adaptatif avant de continuer
                    await adaptiveDelay('retweet', 0, RUNTIME_CAPS.retweet.limit);
                    continue;
                }
                let retryCount = 0;
                const maxRetries = 3;
                let retweetResult;
                
                while (retryCount < maxRetries) {
                    try {
                        // Utiliser l'ID du compte directement depuis userObj déjà récupéré
                        const userId = String(userObj.id_str || userObj.id || (userObj.data && userObj.data.id));
                        
                        retweetResult = await cli.v2.retweet(userId, action.tweetId);
                        break; // Succès, sortir de la boucle
                        
                    } catch (retryError) {
                        retryCount++;
                        const retryErrorCode = retryError.code || retryError.status || 'UNKNOWN';
                        
                        logSystem(`[RETRY][RETWEET][${action.acc.username}] Tentative ${retryCount}/${maxRetries} échouée: ${retryError.message}`, 'automation', 'warn');
                        
                        if (retryErrorCode === 429 && retryCount < maxRetries) {
                            // Rate limit, attendre avant retry
                            const retryDelay = Math.pow(2, retryCount) * 1000; // 2s, 4s, 8s
                            logSystem(`[RETRY][RETWEET][${action.acc.username}] Attente ${retryDelay}ms avant retry`, 'automation', 'info');
                            await new Promise(resolve => setTimeout(resolve, retryDelay));
                            continue;
                        } else if (retryCount >= maxRetries) {
                            // Max retries atteint, relancer l'erreur
                            throw retryError;
                        } else {
                            // Autre erreur, relancer immédiatement
                            throw retryError;
                        }
                    }
                }
                
                try {
                    // 🚀 MONITORING RATE LIMITS - PHASE 3
                    if (retweetResult.rateLimit) {
                        rateLimitState[accId] = { ...rateLimitState[accId], ...retweetResult.rateLimit };
                        const remaining = retweetResult.rateLimit.remaining || 0;
                        const limit = retweetResult.rateLimit.limit || 0;
                        const resetTime = retweetResult.rateLimit.reset || 0;
                        
                        logSystem(`[RATE-LIMIT][RETWEET] ${action.acc.username}: ${remaining}/${limit} restantes, reset: ${new Date(resetTime * 1000).toLocaleTimeString()}`, 'automation', 'info');
                        
                        // Alerte si proche de la limite
                        if (remaining < limit * 0.1) {
                            logSystem(`[RATE-LIMIT-WARNING][RETWEET] ${action.acc.username}: Seulement ${remaining} retweets restants!`, 'automation', 'warn');
                        }
                    }
                    
                    markActionAsPerformed(action.tweetId, accId, 'retweet');
                    
                    // Décrémenter le quota APRÈS succès de l'action avec master-quota-manager
                    const masterQuota = getMasterQuotaManager();
                    const quotaCheck = masterQuota.consumeAction(accId, 'retweet');
                    if (!quotaCheck.success) {
                        logSystem(`[QUOTA-WARNING][${action.acc.username}] Quota dépassé après retweet sur tweet ${action.tweetId}`, 'automation', 'warn');
                    }
                    
                    const masterStats = masterQuota.getStats();
                    const accountStats = masterStats.activeAccounts.find(acc => acc.id === accId) || {};
                    const dailyUsed = Object.values(accountStats.dailyUsed || {}).reduce((sum, val) => sum + val, 0);
                    const dailyLimit = masterStats.allocation?.perAccountDaily || 150;
                    
                    // Log enrichi pour retweet
                    const enrichedLogData = {
                        type: 'retweet',
                        level: 'info',
                        account: action.acc.username,
                        accountId: action.acc.id,
                        tweetId: action.tweetId,
                        tweetUrl: `https://twitter.com/i/status/${action.tweetId}`,
                        targetUser: action.pseudo,
                        targetUserId: action.tweet.author_id,
                        message: `Retweet du tweet de @${action.pseudo}`,
                        tweetText: action.tweet.text ? action.tweet.text.substring(0, 100) + '...' : 'Contenu non disponible',
                        metadata: {
                            actionTime: new Date().toISOString(),
                            quotaUsed: dailyUsed,
                            quotaLimit: dailyLimit,
                            quotaRemaining: dailyLimit - dailyUsed,
                            accountId: accId,
                            accountUsername: action.acc.username,
                            tweetCreatedAt: action.tweet.created_at,
                            globalQuotaUsed: masterStats.globalPack?.usedActions || 0,
                            globalQuotaTotal: masterStats.globalPack?.totalActions || 0
                        }
                    };
                    
                    pushLiveLog(`[${action.acc.username}] RT tweet ${action.tweetId} de @${action.pseudo} (${dailyUsed}/${dailyLimit})`);
                    
                    // Log enrichi pour l'API actions-history
                    logToFile(JSON.stringify({
                        timestamp: new Date().toISOString(),
                        type: 'retweet',
                        level: 'info',
                        message: `[${action.acc.username}] RT tweet ${action.tweetId} de @${action.pseudo} (${dailyUsed}/${dailyLimit})`,
                        metadata: { legacy: true },
                        account: action.acc.username,
                        tweetId: action.tweetId,
                        targetUser: action.pseudo
                    }));
                    
                    logSystem(JSON.stringify(enrichedLogData), 'automation', 'info');
                    
                    // Ajouter au cache persistant des statistiques
                    addAction('retweet');
                } catch (e) {
                    // Gestion détaillée des erreurs API v2 pour retweet
                    const errorCode = e.code || e.status || 'UNKNOWN';
                    const errorMessage = e.message || e.data?.detail || JSON.stringify(e);
                    
                    logSystem(`[ERREUR][${action.acc.username}] RT tweet ${action.tweetId} - Code: ${errorCode} - Message: ${errorMessage}`, 'automation', 'error');
                    
                    // Gestion spécifique des erreurs 400, 403 et 429
                    if (errorCode === 400) {
                        // Erreur 400: Tweet invalide/supprimé/protégé - utiliser gestionnaire centralisé
                        handleInvalidTweetError(action.tweetId, accId, action.acc.username);
                    } else if (errorCode === 403) {
                        // Utiliser le nouveau système de gestion des erreurs d'autorisation
                        handleAuthorizationError(accId, action.acc.username, 'retweet', mutedAccounts);
                    } else if (errorCode === 429) {
                        // Utiliser le nouveau système de gestion du rate limiting
                        handleRateLimitError(accId, action.acc.username, 'retweet', mutedAccounts);
                    }
                }
            }

            // --- Reply ---
            if (action.type === 'reply' && !hasActionBeenPerformed(action.tweetId, accId, 'reply')) {
                // 🚫 VÉRIFICATION DÉLAI MINIMUM ENTRE REPLIES (30min)
                if (!canReplyToTweet(action.tweetId)) {
                    const lastReply = lastReplyTimes.get(action.tweetId);
                    const remainingTime = Math.ceil((REPLY_SPACING - (Date.now() - lastReply)) / (60 * 1000));
                    logSystem(`[REPLY-SPACING][${action.acc.username}] Tweet ${action.tweetId} déjà traité - attendre ${remainingTime}min`, 'automation', 'info');
                    continue;
                }
                
                // 📅 VÉRIFICATION SCHEDULER 24H - PHASE 6
                const scheduleCheck = actionScheduler.canPerformActionNow(accId, 'reply');
                if (!scheduleCheck.allowed) {
                    logSystem(`[SCHEDULER][REPLY][${action.acc.username}] Action différée: ${scheduleCheck.reason}`, 'automation', 'info');
                    pushLiveLog(`[SCHEDULER][${action.acc.username}] Reply différé - ${scheduleCheck.reason}`);
                    
                    // Ajouter l'action à la queue des actions différées
                    const nextAvailableTime = Date.now() + (scheduleCheck.waitTime || 10 * 60 * 1000);
                    actionScheduler.addDeferredAction(accId, action, nextAvailableTime);
                    continue;
                }

                // Vérification cap runtime (50/24h)
                const cap = await checkRuntimeCap(accId, 'reply');
                let lastCapInfo = cap;
                if (!cap.allowed) {
                    const waitMin = cap.resetTime ? Math.ceil((cap.resetTime - Date.now()) / 60000) : null;
                    logSystem(`[CAP_REACHED][REPLY][${action.acc.username}] Limite atteinte (100/24h). Remaining=0. Reset in ${waitMin !== null ? waitMin + 'min' : 'unknown'}`, 'automation', 'warn');
                    pushLiveLog(`[CAP][${action.acc.username}] Reply skip - cap atteint (${waitMin !== null ? waitMin + 'min' : '?'})`);
                    await adaptiveDelay('reply', 0, RUNTIME_CAPS.reply.limit);
                    continue;
                }
                
                try {
                    logSystem('[AI_TOKEN_SETTINGS][AUTOMATION] Utilisés pour la génération IA : ' + JSON.stringify(aiTokenSettings), 'automation', 'debug');
                    // Générer le commentaire IA avec les settings injectés
                    const comments = await generateUniqueAIComments([action.tweet], {
                        maxComments: 1,
                        accountId: accId,
                        tokenSettings: aiTokenSettings
                    });

                    if (comments && comments.length > 0 && comments[0] && comments[0].trim()) {
                        const generatedComment = comments[0].trim();
                        
                        // Vérifier si on doit ajouter une image (probabilité configurable)
                        const imageProb = (typeof global.replyImagesSettings?.probability === 'number')
                            ? Math.max(0, Math.min(1, global.replyImagesSettings.probability))
                            : 0.25; // défaut: 25%
                        const shouldAddImage = global.replyImagesSettings?.enabled && Math.random() < imageProb;
                        let mediaId = null;
                        
                        if (shouldAddImage && typeof global.getRandomReplyImage === 'function') {
                            try {
                                logSystem(`[REPLY-IMAGE][${action.acc.username}] Attempting to add image (probability: ${Math.round(imageProb*100)}%)`, 'automation', 'info');
                                
                                const imagePath = global.getRandomReplyImage();
                                if (imagePath) {
                                    logSystem(`[REPLY-IMAGE][${action.acc.username}] Selected image: ${path.basename(imagePath)}`, 'automation', 'info');
                                    
                                    const fs = require('fs');
                                    const imageBuffer = fs.readFileSync(imagePath);
                                    const ext = path.extname(imagePath).toLowerCase();
                                    const mimeMap = {
                                        '.jpg': 'image/jpeg',
                                        '.jpeg': 'image/jpeg',
                                        '.png': 'image/png',
                                        '.gif': 'image/gif',
                                        '.webp': 'image/webp'
                                    };
                                    const mimeType = mimeMap[ext] || 'application/octet-stream';
                                    
                                    logSystem(`[REPLY-IMAGE][${action.acc.username}] Image buffer size: ${imageBuffer.length} bytes, MIME: ${mimeType}`, 'automation', 'info');
                                    
                                    // Vérifier les scopes media.write et la validité du compte OAuth2
                                    const hasMediaScope = action.acc.scopesGranted && action.acc.scopesGranted.includes('media.write');
                                    const isValidOAuth2Account = action.acc.authMethod === 'oauth2' && action.acc.accessToken;
                                    
                                    logSystem(`[REPLY-IMAGE-DEBUG][${action.acc.username}] hasMediaScope: ${hasMediaScope}, isValidOAuth2Account: ${isValidOAuth2Account}`, 'automation', 'info');
                                    logSystem(`[REPLY-IMAGE-DEBUG][${action.acc.username}] scopesGranted: ${JSON.stringify(action.acc.scopesGranted)}`, 'automation', 'info');
                                    
                                    if (!hasMediaScope) {
                                        logSystem(`[REPLY-IMAGE-SKIP][${action.acc.username}] Scope media.write manquant - reconnexion nécessaire`, 'automation', 'warn');
                                        mediaId = null;
                                    } else if (!isValidOAuth2Account) {
                                        logSystem(`[REPLY-IMAGE-SKIP][${action.acc.username}] Compte OAuth2 invalide ou déconnecté - ignorer upload image`, 'automation', 'warn');
                                        mediaId = null;
                                    } else if (global.imageUploadDisabled) {
                                        logSystem(`[REPLY-IMAGE-SKIP][${action.acc.username}] Upload d'images temporairement désactivé (erreurs 403)`, 'automation', 'warn');
                                        mediaId = null;
                                    } else {
                                        try {
                                            logSystem(`[REPLY-IMAGE][${action.acc.username}] Tentative upload avec API v1`, 'automation', 'info');
                                            mediaId = await cli.v1.uploadMedia(imageBuffer, { mimeType });
                                            logSystem(`[REPLY-IMAGE][${action.acc.username}] Upload réussi - Media ID: ${mediaId}`, 'automation', 'info');
                                        } catch (uploadError) {
                                            logSystem(`[REPLY-IMAGE-ERROR][${action.acc.username}] Erreur upload image: ${uploadError.message} (Code: ${uploadError.code})`, 'automation', 'error');
                                            
                                            // Si erreur 403, c'est un problème de permissions de l'app Twitter
                                            if (uploadError.code === 403) {
                                                logSystem(`[REPLY-IMAGE-403][${action.acc.username}] Erreur 403 - L'application Twitter n'a pas les permissions Media Upload`, 'automation', 'warn');
                                                logSystem(`[REPLY-IMAGE-403] SOLUTION: Vérifier les permissions de l'app dans developer.twitter.com`, 'automation', 'warn');
                                                
                                                // Désactiver temporairement les images pour éviter le spam d'erreurs
                                                if (!global.imageUploadDisabled) {
                                                    global.imageUploadDisabled = true;
                                                    logSystem(`[REPLY-IMAGE-403] Images temporairement désactivées pour éviter les erreurs 403`, 'automation', 'warn');
                                                }
                                            } else {
                                                // Pour les autres erreurs, pause de 15 minutes pour ce compte
                                                const pauseUntil = new Date(Date.now() + 15 * 60 * 1000);
                                                if (!global.accountPauses) global.accountPauses = {};
                                                global.accountPauses[action.acc.id] = pauseUntil;
                                                logSystem(`[REPLY-IMAGE-ERROR][${action.acc.username}] Compte pausé jusqu'à ${pauseUntil.toISOString()}`, 'automation', 'warn');
                                            }
                                            
                                            mediaId = null; // Continuer sans image
                                        }
                                    }
                                }
                            } catch (imageError) {
                                logSystem(`[REPLY-IMAGE-ERROR][${action.acc.username}] Erreur lors du traitement de l'image: ${imageError.message}`, 'automation', 'error');
                                mediaId = null;
                            }
                        }
                        
                        // Envoyer le commentaire via le client Twitter (avec ou sans image)
                        const replyOptions = { 
                            reply: { in_reply_to_tweet_id: action.tweetId }
                        };
                        if (mediaId) {
                            replyOptions.media = { media_ids: [mediaId] };
                        }
                        
                        const replyResult = await cli.v2.tweet(generatedComment, replyOptions);
                        
                        // 🚀 MONITORING RATE LIMITS - PHASE 3
                        if (replyResult && replyResult.rateLimit) {
                            const remaining = replyResult.rateLimit.remaining || 0;
                            const limit = replyResult.rateLimit.limit || 0;
                            const resetTime = replyResult.rateLimit.reset || 0;
                            
                            logSystem(`[RATE-LIMIT][REPLY] ${action.acc.username}: ${remaining}/${limit} restantes, reset: ${new Date(resetTime * 1000).toLocaleTimeString()}`, 'automation', 'info');
                            
                            // Alerte si proche de la limite
                            if (remaining < limit * 0.1) {
                                logSystem(`[RATE-LIMIT-WARNING][REPLY] ${action.acc.username}: Seulement ${remaining} replies restants!`, 'automation', 'warn');
                            }
                        }
                        
                        // Marquer l'action comme effectuée
                        markActionAsPerformed(action.tweetId, accId, 'reply');
                        
                        // Marquer le tweet comme ayant reçu un reply (délai de 30min)
                        markReplyToTweet(action.tweetId);
                        
                        // Décrémenter le quota APRÈS succès de l'action avec master-quota-manager
                        const masterQuota = getMasterQuotaManager();
                        const quotaCheck = masterQuota.consumeAction(accId, 'reply');
                        if (!quotaCheck.success) {
                            logSystem(`[QUOTA-WARNING][${action.acc.username}] Quota dépassé après reply sur tweet ${action.tweetId}`, 'automation', 'warn');
                        }
                        // Obtenir les nouvelles statistiques du quota master
                        const masterStats = masterQuota.getStats();
                        const accountStats = masterStats.activeAccounts.find(acc => acc.id === accId) || {};
                        
                        // Calculer les métriques pour le log
                        const dailyUsed = Object.values(accountStats.dailyUsed || {}).reduce((sum, val) => sum + val, 0);
                        const dailyLimit = masterStats.allocation?.perAccountDaily || 150;
                        
                        // Log enrichi pour reply
                        const enrichedLogData = {
                            type: 'reply',
                            level: 'info',
                            account: action.acc.username,
                            accountId: action.acc.id,
                            tweetId: action.tweetId,
                            tweetUrl: `https://twitter.com/i/status/${action.tweetId}`,
                            targetUser: action.pseudo,
                            targetUserId: action.tweet.author_id,
                            message: `Réponse à @${action.pseudo}`,
                            tweetText: action.tweet.text ? action.tweet.text.substring(0, 100) + '...' : 'Contenu non disponible',
                            replyText: generatedComment,
                            metadata: {
                                actionTime: new Date().toISOString(),
                                quotaUsed: dailyUsed,
                                quotaLimit: dailyLimit,
                                quotaRemaining: dailyLimit - dailyUsed,
                                accountId: accId,
                                accountUsername: action.acc.username,
                                tweetCreatedAt: action.tweet.created_at,
                                globalQuotaUsed: masterStats.globalPack?.usedActions || 0,
                                globalQuotaTotal: masterStats.globalPack?.totalActions || 0,
                                aiGenerated: true,
                                tokenSettings: aiTokenSettings
                            }
                        };
                        
                        // Log enrichi pour l'API actions-history
                        logToFile(JSON.stringify({
                            timestamp: new Date().toISOString(),
                            type: 'reply',
                            level: 'info',
                            message: `[${action.acc.username}] Réponse à @${action.pseudo} sur tweet ${action.tweetId} (${dailyUsed}/${dailyLimit})`,
                            metadata: { legacy: true },
                            account: action.acc.username,
                            tweetId: action.tweetId,
                            targetUser: action.pseudo,
                            replyText: generatedComment
                        }));
                        
                        logSystem(JSON.stringify(enrichedLogData), 'automation', 'info');
                    }
                } catch (replyError) {
                    const errorCode = replyError.code || replyError.status || 'UNKNOWN';
                    const errorMessage = replyError.message || replyError.data?.detail || JSON.stringify(replyError);
                    
                    logSystem(`[ERREUR][${action.acc.username}] reply tweet ${action.tweetId} - Code: ${errorCode} - Message: ${errorMessage}`, 'automation', 'error');
                    
                    // Gestion spécifique des erreurs 403 et 429
                    if (errorCode === 403) {
                        // Utiliser le nouveau système de gestion des erreurs d'autorisation
                        handleAuthorizationError(accId, action.acc.username, 'reply', mutedAccounts);
                    } else if (errorCode === 429) {
                        // Utiliser le nouveau système de gestion du rate limiting
                        handleRateLimitError(accId, action.acc.username, 'reply', mutedAccounts);
                    }
                }
            }

            // Incrémenter le compteur SEULEMENT après une action réussie
            actionCount++;
            
            // Délai fixe entre les actions pour éviter les blocages adaptatifs (+20%)
            const actionDelays = {
                'like': 9600,    // 9.6 secondes (+20%)
                'retweet': 6000, // 6 secondes (+20%)
                'reply': 21600   // 21.6 secondes (+20%)
            };
            
            const delayMs = actionDelays[action.type] || 3000;
            await delay(delayMs);
        }

        scanActive = false; // Arrêter le heartbeat
        logSystem('[AUTO] Scan d\'automatisation terminé avec succès.', 'automation', 'info');
        
        // Marquer la fin du scan pour le statut dynamique
        global.isAutomationScanning = false;
        
        // Marquer la fin du scan pour le service de récupération
        scanRecoveryService.markScanEnd();
        
        return { 
            automationActive: scanActive, 
            isAutomationEnabled, 
            lastTweetId: newestId,
            foundTweets: allTweets
        };

    } catch (error) {
        scanActive = false;
        // Mark end of scan even in case of error
        global.isAutomationScanning = false;
        
        // Marquer la fin du scan pour le service de récupération même en cas d'erreur
        if (typeof scanRecoveryService !== 'undefined') {
            scanRecoveryService.markScanEnd();
        }
        
        logSystem(`[ERROR][AUTO] Critical error in runAutomationScan: ${error.message || JSON.stringify(error)}`, 'automation', 'error');
        pushLiveLog(`[ERROR] Automation scan failed: ${error.message}`);
        
        return { 
            automationActive: false, 
            isAutomationEnabled: false,
            error: error.message 
        };
    }
}

/**
 * Gestionnaire centralisé pour les erreurs 400 (tweet invalide/supprimé/protégé)
 * @param {string} tweetId - ID du tweet problématique
 * @param {string} accountId - ID du compte
 * @param {string} username - Nom d'utilisateur du compte
 */
function handleInvalidTweetError(tweetId, accountId, username) {
    logSystem(`[BLACKLIST][${username}] Tweet ${tweetId} ajouté à la blacklist (erreur 400)`, 'automation', 'warn');
    // Marquer toutes les actions comme effectuées pour éviter les répétitions
    ['like', 'retweet', 'reply'].forEach(actionType => {
        markActionAsPerformed(tweetId, accountId, actionType);
    });
}

/**
 * Get live logs for API consumption
 * @returns {Array} Array of live log messages
 */
function getLiveLogs() {
    return liveLogs;
}

/**
 * Fonction pour récupérer les statistiques du scheduler
 */
async function getSchedulerStats() {
    try {
        if (!actionScheduler) {
            logSystem('[AUTOMATION] Initialisation du ActionScheduler...', 'automation', 'info');
            actionScheduler = new ActionScheduler(dependencies);
            actionScheduler.startDeferredActionsProcessor();
            logSystem('[AUTOMATION] ActionScheduler initialisé et processeur démarré', 'automation', 'info');
        }
        global.actionScheduler = actionScheduler;

        let totalSlots = 0;
        let usedSlots = 0;
        let plannedAccounts = 0;
        const breakdown = {
            likes: { used: 0, total: 0 },
            retweets: { used: 0, total: 0 },
            replies: { used: 0, total: 0 }
        };

        // Parcourir tous les comptes planifiés
        for (const [accountId, schedule] of actionScheduler.accountSchedules) {
            plannedAccounts++;
            
            // Compter les créneaux pour chaque type d'action
            ['like', 'retweet', 'reply'].forEach(actionType => {
                const slots = schedule[actionType] || [];
                const actionKey = actionType === 'like' ? 'likes' : actionType === 'retweet' ? 'retweets' : 'replies';
                
                breakdown[actionKey].total += slots.length;
                breakdown[actionKey].used += slots.filter(slot => slot.used).length;
                
                totalSlots += slots.length;
                usedSlots += slots.filter(slot => slot.used).length;
            });
        }

        // Trouver la prochaine action programmée
        let nextAction = null;
        let nextTime = null;
        const now = new Date();

        for (const [accountId, schedule] of actionScheduler.accountSchedules) {
            ['like', 'retweet', 'reply'].forEach(actionType => {
                const slots = schedule[actionType] || [];
                slots.forEach(slot => {
                    if (!slot.used && slot.timestamp > now) {
                        if (!nextTime || slot.timestamp < nextTime) {
                            nextTime = slot.timestamp;
                            
                            // Get account username instead of ID
                            let accountUsername = accountId;
                            try {
                                // Try to get username from OAuth2 manager
                                const { getOAuth2Manager } = require('./oauth2-manager');
                                const oauth2Manager = getOAuth2Manager();
                                const user = oauth2Manager.getUserById(accountId);
                                if (user && user.username) {
                                    accountUsername = user.username;
                                }
                            } catch (error) {
                                // Fallback: try to get from global accounts
                                if (global.accounts && Array.isArray(global.accounts)) {
                                    const account = global.accounts.find(acc => acc.id === accountId);
                                    if (account && account.username) {
                                        accountUsername = account.username;
                                    }
                                }
                            }
                            
                            nextAction = {
                                type: actionType,
                                account: accountUsername,
                                time: slot.timestamp,
                                timeUntil: formatTimeUntil(slot.timestamp)
                            };
                        }
                    }
                });
            });
        }

        return {
            plannedAccounts,
            totalSlots,
            usedSlots,
            nextAction,
            breakdown
        };
    } catch (error) {
        console.error('[SCHEDULER] Erreur lors de la récupération des stats:', error);
        return null;
    }
}

/**
 * Exécute une action planifiée par le SmartScheduler
 * @param {Object} action - Action à exécuter
 */
async function executeScheduledAction(action) {
    try {
        const { logSystem } = require('./log-manager');
        logSystem(`[SMART-SCHEDULER] Début exécution action différée: ${action.actionType} sur tweet ${action.tweetId} par compte ${action.accountId}`, 'automation', 'info');
        
        const { getRwClientById } = require('./oauth2-manager');
        const { generateAIComment } = require('./ai');
        
        // Récupérer le client Twitter pour ce compte
        const cli = await getRwClientById(action.accountId, true); // skipValidation=true
        if (!cli) {
            throw new Error(`Client Twitter non trouvé pour le compte ${action.accountId}`);
        }
        
        // Vérifier les quotas avant exécution
        const quotaManager = getMasterQuotaManager();
        const quotaCheck = await quotaManager.checkQuota(action.accountId, action.actionType);
        if (!quotaCheck.allowed) {
            logSystem(`[SMART-SCHEDULER] Action refusée par quota: ${quotaCheck.reason}`, 'automation', 'warn');
            return false;
        }
        
        // Exécuter l'action selon son type
        let result = false;
        
        switch (action.actionType) {
            case 'like':
                await cli.v2.like(action.accountId, action.tweetId);
                result = true;
                logSystem(`[SMART-SCHEDULER] Like exécuté sur tweet ${action.tweetId}`, 'automation', 'info');
                break;
                
            case 'retweet':
                await cli.v2.retweet(action.accountId, action.tweetId);
                result = true;
                logSystem(`[SMART-SCHEDULER] Retweet exécuté sur tweet ${action.tweetId}`, 'automation', 'info');
                break;
                
            case 'reply':
                if (action.comment) {
                    await cli.v2.reply(action.comment, action.tweetId);
                    result = true;
                    logSystem(`[SMART-SCHEDULER] Reply exécuté sur tweet ${action.tweetId}: ${action.comment}`, 'automation', 'info');
                } else {
                    logSystem(`[SMART-SCHEDULER] Pas de commentaire pour le reply sur tweet ${action.tweetId}`, 'automation', 'warn');
                }
                break;
                
            default:
                throw new Error(`Type d'action non supporté: ${action.actionType}`);
        }
        
        if (result) {
            // Consommer le quota
            await quotaManager.consumeQuota(action.accountId, action.actionType);
            
            // Enregistrer l'action dans les stats
            addAction(action.accountId, action.actionType, 'success');
            
            logSystem(`[SMART-SCHEDULER] Action différée exécutée avec succès: ${action.actionType} sur ${action.tweetId}`, 'automation', 'info');
        }
        
        return result;
        
    } catch (error) {
        logSystem(`[SMART-SCHEDULER] Erreur lors de l'exécution de l'action différée: ${error.message}`, 'automation', 'error');
        addAction(action.accountId, action.actionType, 'error');
        throw error;
    }
}

module.exports = {
    runAutomationScan,
    pushLiveLog,
    logSystemAction,
    getDashboardMetrics,
    randomDelay,
    liveLogs,
    getLiveLogs,
    getSchedulerStats,
    executeScheduledAction,
    actionScheduler, // Exporter l'instance actionScheduler
    canReplyToTweet,
    markReplyToTweet
};
