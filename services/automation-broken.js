const { logToFile } = require('./logs-optimized');
const { 
    canAccountPerformAction, 
    consumeAction, 
    determineActionsForTweet,
    getQuotaStats 
} = require('./unified-quota-manager');

/**
 * Service d'automatisation - Extrait de server.js
 * Responsabilités :
 * - Scan automatique des tweets
 * - Exécution des actions (like, retweet, reply)
 * - Gestion des quotas et rate limiting
 * - Génération de commentaires IA
 */

/**
 * Buffer de logs temps réel pour rassurer l'utilisateur
 */
const liveLogs = [];
const MAX_LIVE_LOGS = 150;

/**
 * 🚦 SYSTÈME DE GESTION DU RATE LIMITING AVANCÉ
 * Gestion intelligente des erreurs 429 avec backoff exponentiel
 */
const rateLimitTracker = new Map(); // Suivi des erreurs 429 par compte
const RATE_LIMIT_CONFIG = {
    // Délais de base (en minutes)
    baseDelay: 15,        // Délai initial : 15 minutes
    maxDelay: 240,        // Délai maximum : 4 heures
    exponentialFactor: 2, // Facteur d'augmentation
    resetAfter: 24 * 60,  // Reset du compteur après 24h
    maxRetries: 5         // Nombre maximum de tentatives avant désactivation
};

/**
 * Calcule le délai d'attente pour un compte en cas d'erreur 429
 * @param {string} accountId - ID du compte
 * @returns {Object} - Informations sur le délai et l'état
 */
function calculateRateLimitDelay(accountId) {
    const now = Date.now();
    const tracker = rateLimitTracker.get(accountId) || {
        errorCount: 0,
        firstError: now,
        lastError: now
    };
    
    // Reset si plus de 24h depuis la première erreur
    if (now - tracker.firstError > RATE_LIMIT_CONFIG.resetAfter * 60 * 1000) {
        tracker.errorCount = 0;
        tracker.firstError = now;
    }
    
    // Incrémenter le compteur d'erreurs
    tracker.errorCount++;
    tracker.lastError = now;
    
    // Calculer le délai avec backoff exponentiel
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
 * Gère une erreur 429 pour un compte donné
 * @param {string} accountId - ID du compte
 * @param {string} username - Nom d'utilisateur pour les logs
 * @param {string} action - Type d'action (like, retweet, reply)
 * @param {Map} mutedAccounts - Map des comptes en sourdine
 */
function handleRateLimitError(accountId, username, action, mutedAccounts) {
    const rateLimitInfo = calculateRateLimitDelay(accountId);
    
    // Mettre le compte en sourdine
    mutedAccounts.set(accountId, rateLimitInfo.nextRetryAt);
    
    // Logs détaillés
    logToFile(`[429][${username}] Rate limit atteint pour ${action} - Erreur #${rateLimitInfo.errorCount}`);
    logToFile(`[429][${username}] Pause de ${rateLimitInfo.delayMinutes} minutes (backoff exponentiel)`);
    
    if (rateLimitInfo.shouldDisable) {
        logToFile(`[429][${username}] ⚠️  COMPTE DÉSACTIVÉ - Trop d'erreurs 429 (${rateLimitInfo.errorCount}/${RATE_LIMIT_CONFIG.maxRetries})`);
        logToFile(`[429][${username}] Le compte sera réactivé automatiquement dans 24h`);
    }
    
    // Log pour le dashboard
    pushLiveLog(`[${username}] Rate limit - Pause ${rateLimitInfo.delayMinutes}min (tentative ${rateLimitInfo.errorCount})`);
    
    return rateLimitInfo;
}

/**
 * 🚫 SYSTÈME DE GESTION DES ERREURS 403 (AUTORISATION)
 * Surveillance et gestion intelligente des erreurs d'autorisation
 */
const authErrorTracker = new Map(); // Suivi des erreurs 403 par compte
const AUTH_ERROR_CONFIG = {
    maxErrors: 3,           // Nombre maximum d'erreurs 403 avant alerte
    pauseDuration: 60,      // Durée de pause en minutes (1h)
    resetAfter: 12 * 60,    // Reset du compteur après 12h
    criticalThreshold: 5    // Seuil critique pour désactivation
};

/**
 * Gère une erreur 403 pour un compte donné
 * @param {string} accountId - ID du compte
 * @param {string} username - Nom d'utilisateur pour les logs
 * @param {string} action - Type d'action (like, retweet, reply)
 * @param {Map} mutedAccounts - Map des comptes en sourdine
 */
function handleAuthorizationError(accountId, username, action, mutedAccounts) {
    const now = Date.now();
    const tracker = authErrorTracker.get(accountId) || {
        errorCount: 0,
        firstError: now,
        lastError: now,
        actions: []
    };
    
    // Reset si plus de 12h depuis la première erreur
    if (now - tracker.firstError > AUTH_ERROR_CONFIG.resetAfter * 60 * 1000) {
        tracker.errorCount = 0;
        tracker.firstError = now;
        tracker.actions = [];
    }
    
    // Incrémenter le compteur et enregistrer l'action
    tracker.errorCount++;
    tracker.lastError = now;
    tracker.actions.push({ action, timestamp: now });
    
    // Sauvegarder l'état
    authErrorTracker.set(accountId, tracker);
    
    // Calculer la durée de pause
    const pauseMs = AUTH_ERROR_CONFIG.pauseDuration * 60 * 1000;
    mutedAccounts.set(accountId, now + pauseMs);
    
    // Logs détaillés
    logToFile(`[403][${username}] Erreur d'autorisation pour ${action} - Erreur #${tracker.errorCount}`);
    logToFile(`[403][${username}] Pause de ${AUTH_ERROR_CONFIG.pauseDuration} minutes`);
    
    // Alertes selon le niveau de gravité
    if (tracker.errorCount >= AUTH_ERROR_CONFIG.criticalThreshold) {
        logToFile(`[403][${username}] 🚨 ALERTE CRITIQUE - ${tracker.errorCount} erreurs 403 détectées`);
        logToFile(`[403][${username}] Vérifiez IMMÉDIATEMENT les permissions OAuth et l'état du compte`);
        logToFile(`[403][${username}] Actions concernées: ${tracker.actions.map(a => a.action).join(', ')}`);
        pushLiveLog(`[${username}] 🚨 ALERTE - Trop d'erreurs 403, vérifiez les permissions`);
    } else if (tracker.errorCount >= AUTH_ERROR_CONFIG.maxErrors) {
        logToFile(`[403][${username}] ⚠️  ATTENTION - ${tracker.errorCount} erreurs 403 récentes`);
        logToFile(`[403][${username}] Surveillez ce compte, problème potentiel de permissions`);
        pushLiveLog(`[${username}] ⚠️  Attention - Erreurs 403 répétées (${tracker.errorCount})`);
    } else {
        pushLiveLog(`[${username}] Erreur 403 - Pause ${AUTH_ERROR_CONFIG.pauseDuration}min`);
    }
    
    return {
        errorCount: tracker.errorCount,
        pauseMinutes: AUTH_ERROR_CONFIG.pauseDuration,
        isCritical: tracker.errorCount >= AUTH_ERROR_CONFIG.criticalThreshold,
        needsAttention: tracker.errorCount >= AUTH_ERROR_CONFIG.maxErrors
    };
}

/**
 * Ajoute un message aux logs temps réel
 * @param {string} msg - Message à ajouter
 */
function pushLiveLog(msg) {
    const timestamp = new Date().toISOString();
    liveLogs.unshift(`[${timestamp}] ${msg}`);
    if (liveLogs.length > MAX_LIVE_LOGS) {
        liveLogs.pop();
    }
}

/**
 * Ajoute une entrée système dans le actionLog pour le dashboard
 * @param {string} detail - Détail de l'action
 * @param {string} subtype - Sous-type de l'action
 */
function logSystemAction(detail, subtype = 'system') {
    logToFile(`[SYSTEM][${subtype.toUpperCase()}] ${detail}`);
}

/**
 * Fonction pour créer un délai aléatoire
 * @param {number} minSeconds - Délai minimum en secondes
 * @param {number} maxSeconds - Délai maximum en secondes
 * @param {string} context - Contexte pour le log
 * @returns {Promise} Promise qui se résout après le délai
 */
async function randomDelay(minSeconds, maxSeconds, context = '') {
    const delayMs = Math.floor(Math.random() * (maxSeconds - minSeconds + 1) + minSeconds) * 1000;
    const delaySeconds = Math.floor(delayMs / 1000);
    
    if (context) {
        logToFile(`[DELAY] ${context} - Attente de ${delaySeconds}s avant la prochaine action`);
    }
    
    return new Promise(resolve => setTimeout(resolve, delayMs));
}

/**
 * Fonction principale d'automatisation - Version modulaire
 * Cette fonction sera appelée depuis server.js avec les dépendances injectées
 * @param {Object} dependencies - Dépendances injectées depuis server.js
 */
async function runAutomationScan(dependencies) {
    // Marquer le début du scan pour le statut dynamique
    global.isAutomationScanning = true;
    // Récupération dynamique des AI Token Settings injectés
    const aiTokenSettings = dependencies.aiTokenSettings || { tokenSymbol: '', tokenName: '', tokenX: '', tokenChain: '' };

    let { enabledActions } = dependencies;
    if (!enabledActions || !Array.isArray(enabledActions)) enabledActions = ['like', 'retweet', 'reply'];
    
    const {
        accounts, watchAccounts, lastTweetId, isAutomationEnabled, automationActive,
        rateLimitState, performedActionsDB,
        getRwClientById, generateUniqueAIComments, markActionAsPerformed, hasActionBeenPerformed,
        logSystemAction, pushLiveLog, randomDelay, logToFile,
        // Système de quotas partagés unifié
        consumeSharedAction, getSharedQuotaStats
    } = dependencies;

    // Correction : s'assurer que mutedAccounts est un Map (utiliser let pour pouvoir réassigner)
    let { mutedAccounts } = dependencies;
    if (!mutedAccounts || typeof mutedAccounts !== 'object' || typeof mutedAccounts.has !== 'function') {
        mutedAccounts = new Map();
    } else if (!(mutedAccounts instanceof Map)) {
        // Si c'est un objet simple, le convertir en Map
        mutedAccounts = new Map(Object.entries(mutedAccounts));
    }

    // --- Heartbeat log ---
    let scanActive = true;
    
    try {
        let lastHeartbeat = Date.now();
        const heartbeatInterval = 30000; // 30s
        
        function heartbeat() {
            if (!scanActive) return;
            logToFile(`[HEARTBEAT] Automatisation toujours active (scan en cours, ${Math.round((Date.now()-lastHeartbeat)/1000)}s depuis dernier heartbeat).`);
            lastHeartbeat = Date.now();
            setTimeout(heartbeat, heartbeatInterval);
        }
        setTimeout(heartbeat, heartbeatInterval);

        pushLiveLog('[AUTO] Démarrage du scan d\'automatisation...');
        logToFile(`[DEBUG][SCAN] Comptes X connectés : ${accounts.map(a => a.username).join(', ')}`);
        
        // Calculer les actions restantes pour le premier compte (pour l'affichage général)
        const firstAccount = accounts[0];
        const actionsLeft = firstAccount ? calculateActionsLeftForAccount(firstAccount.id) : { like: 0, retweet: 0, reply: 0 };
        const allQuotasExhausted = enabledActions.every(type => actionsLeft[type] <= 0);
        
        if (allQuotasExhausted) {
            logSystemAction('Quota reached: automation stopped', 'quota');
            pushLiveLog('[AUTO] Quota atteint, arrêt complet de l\'automatisation.');
            if (automationActive || isAutomationEnabled) {
                logToFile('[QUOTA][AUTO] Quota atteint, arrêt complet de l\'automatisation (API polling désactivé).');
            }
            return { automationActive: false, isAutomationEnabled: false };
        }
        
        if (!isAutomationEnabled) {
            logSystemAction('Automation is paused (isAutomationEnabled=false)', 'system');
            pushLiveLog('[AUTO] Automatisation désactivée (isAutomationEnabled=false), aucune action.');
            logToFile('[AUTO][DEBUG] Automatisation désactivée (isAutomationEnabled=false), aucune action.');
            return { automationActive, isAutomationEnabled };
        }
        
        if (!accounts.length) {
            pushLiveLog('[AUTO] Aucun compte Twitter connecté, automation impossible.');
            logToFile('[AUTO][DEBUG] Aucun compte Twitter connecté, automation impossible.');
            return { automationActive, isAutomationEnabled };
        }
        
        if (!watchAccounts.length) {
            pushLiveLog('[AUTO] Aucun compte à surveiller (watchAccounts vide), automation impossible.');
            logToFile('[AUTO][DEBUG] Aucun compte à surveiller (watchAccounts vide), automation impossible.');
            return { automationActive, isAutomationEnabled };
        }

        pushLiveLog(`[AUTO] Recherche de nouveaux tweets pour : ${watchAccounts.join(', ')}`);
        logToFile(`[AUTO] Recherche de nouveaux tweets pour : ${watchAccounts.join(', ')}`);

        if (!watchAccounts.length) {
            logToFile('[AUTO] Aucun compte à surveiller, requête non envoyée.');
            return { automationActive, isAutomationEnabled };
        }

        // Nettoyer les pseudos : supprimer les virgules, espaces et caractères parasites
        const allPseudos = watchAccounts
            .filter(p => typeof p === 'string' && p.trim())
            .map(p => p.trim().replace(/[,\s]+/g, '').replace(/^@/, ''))
            .filter(p => p.length > 0);

        const MAX_FROM_PER_QUERY = 5; // Limite stricte pour éviter les erreurs Twitter 400
        let allTweets = [];
        let allUsers = [];
        let newestId = lastTweetId;
        let client;
        try {
            client = await getRwClientById(accounts[0].id);
        } catch (error) {
            logToFile(`[ERREUR] Impossible de créer le client Twitter pour la recherche: ${error.message}`);
            throw new Error(`Client Twitter indisponible pour la recherche: ${error.message}`);
        }

        pushLiveLog(`[AUTO] Recherche Twitter en cours pour ${allPseudos.length} pseudo(s)...`);
        
        for (let i = 0; i < allPseudos.length; i += MAX_FROM_PER_QUERY) {
            const batch = allPseudos.slice(i, i + MAX_FROM_PER_QUERY);
            logToFile(`[DEBUG] Batch de pseudos (${batch.length}/10): ${batch.join(', ')}`);

            if (batch.length === 0) continue;

            const queryBase = batch.map(p => `from:${p}`).join(' OR ');
            if (!queryBase) continue;

            // Filtrage renforcé : exclure retweets, replies, quotes et tweets anciens
            const searchQuery = `${queryBase} -is:retweet -is:reply -is:quote`;
            logToFile('[AUTO] Query envoyée à Twitter : ' + searchQuery);

            // Paramètres corrects pour l'API v2
            const searchOptions = {
                'tweet.fields': ['created_at', 'author_id', 'public_metrics', 'referenced_tweets', 'in_reply_to_user_id'],
                'user.fields': ['username'],
                expansions: ['author_id'],
                max_results: 10,
            };

            // Valider et formater since_id correctement
            if (lastTweetId && typeof lastTweetId === 'string' && lastTweetId.match(/^\d+$/)) {
                searchOptions.since_id = lastTweetId;
            }

            logToFile('[DEBUG] Requête Twitter : ' + searchQuery);
            logToFile('[DEBUG] Options Twitter : ' + JSON.stringify(searchOptions));

            let searchResult;
            try {
                logToFile(`[AUTO][WAIT] Appel API Twitter en cours (peut prendre plusieurs secondes)...`);
                // Syntaxe correcte pour l'API v2: search(query, options)
                searchResult = await client.v2.search(searchQuery, searchOptions);
                logToFile('[DEBUG] Réponse brute Twitter : ' + JSON.stringify(searchResult, null, 2).substring(0, 500) + '...');
            } catch (searchError) {
                logToFile(`[ERREUR] Erreur lors de la recherche Twitter: ${searchError.message || JSON.stringify(searchError)}`);
                pushLiveLog(`[ERREUR] Recherche Twitter échouée: ${searchError.message}`);
                continue;
            }

            const tweets = searchResult?._realData?.data || [];
            if (tweets.length) {
                allTweets.push(...tweets);
                if (searchResult._realData?.includes?.users) {
                    allUsers.push(...searchResult._realData.includes.users);
                }
                logToFile(`[AUTO] Batch ${Math.floor(i/MAX_FROM_PER_QUERY) + 1}: ${tweets.length} tweets trouvés`);
            } else {
                logToFile(`[AUTO] Batch ${Math.floor(i/MAX_FROM_PER_QUERY) + 1}: Aucun tweet trouvé`);
            }

            // Délai entre les batches pour éviter le rate limiting
            if (i + MAX_FROM_PER_QUERY < allPseudos.length) {
                await randomDelay(2, 4, 'Entre batches de recherche');
            }
        }

        logToFile(`[AUTO] Recherche terminée. ${allTweets.length} tweets trouvés au total.`);
        logToFile(`[DEBUG][TWEETS_BRUTS] ${JSON.stringify(allTweets, null, 2).substring(0, 2000)}...`);
        
        // VALIDATION POST-REQUÊTE : Filtrer les tweets non-valides
        const validTweets = [];
        const now = Date.now();
        const maxAgeHours = 24; // Tweets de moins de 24h seulement
        
        for (const tweet of allTweets) {
            // 1. Vérifier l'âge du tweet (filtrage par date récente)
            const tweetAge = now - new Date(tweet.created_at).getTime();
            const tweetAgeHours = tweetAge / (1000 * 60 * 60);
            
            if (tweetAgeHours > maxAgeHours) {
                logToFile(`[FILTER] Tweet ${tweet.id} trop ancien (${Math.round(tweetAgeHours)}h) - ignoré`);
                continue;
            }
            
            // 2. Vérifier que c'est un tweet original (pas de referenced_tweets)
            if (tweet.referenced_tweets && tweet.referenced_tweets.length > 0) {
                const refTypes = tweet.referenced_tweets.map(ref => ref.type).join(', ');
                logToFile(`[FILTER] Tweet ${tweet.id} avec références (${refTypes}) - ignoré`);
                continue;
            }
            
            // 3. Validation stricte de l'auteur : doit être dans la liste surveillée
            const author = allUsers.find(u => u.id === tweet.author_id);
            const authorUsername = author ? author.username : null;
            
            if (!authorUsername) {
                logToFile(`[FILTER] Tweet ${tweet.id} sans auteur identifié - ignoré`);
                continue;
            }
            
            // Vérifier que l'auteur est bien dans la liste des comptes surveillés
            const isValidAuthor = allPseudos.some(pseudo => 
                pseudo.toLowerCase() === authorUsername.toLowerCase()
            );
            
    }

    logToFile(`[DEBUG][ACTIONS] ${actions.length} action(s) générée(s) pour exécution.`);
    logToFile(`[DEBUG][ACTIONS_OBJ] ${JSON.stringify(actions, null, 2).substring(0, 2000)}...`);
    pushLiveLog(`[AUTO] ${actions.length} actions planifiées`);

    if (actions.length === 0) {
        logToFile('[AUTO] Aucune action à effectuer, fin du scan.');
        return { automationActive, isAutomationEnabled, lastTweetId: newestId };
    }

        // Générer les actions pour chaque combinaison tweet/compte
        const queueManager = require('./queue-manager');
        let scheduledActionsCount = 0;

        for (const tweet of allTweets) {
            for (const account of accounts) {
                const accId = account.id;
                const pseudo = tweet.author_username;

                // Vérifier si le compte est temporairement désactivé
                if (mutedAccounts.has(accId)) {
                    const muteEndTime = mutedAccounts.get(accId);
                    if (Date.now() < muteEndTime) {
                        continue; // Compte encore en pause
                    } else {
                        mutedAccounts.delete(accId); // Réactiver le compte
                    }
                }

                // Déterminer les actions à effectuer
                const actionDecision = determineActionsForTweet(accId, tweet.id);
                
                if (actionDecision.actions.length > 0) {
                    for (const actionType of actionDecision.actions) {
                        // Vérifier si l'action n'a pas déjà été effectuée
                        if (!hasActionBeenPerformed(tweet.id, accId, actionType)) {
                            // Planifier l'action au lieu de l'exécuter immédiatement
                            const scheduledTime = Date.now() + Math.random() * 300000 + 60000; // Entre 1 et 6 minutes
                            
                            const actionData = {
                                type: actionType,
                                tweetId: tweet.id,
                                accountId: accId,
                                accountUsername: account.username,
                                userId: account.userId || account.id,
                                targetUser: pseudo,
                                targetUserId: tweet.author_id,
                                scheduledTime: scheduledTime,
                                tweetText: tweet.text ? tweet.text.substring(0, 100) + '...' : 'Contenu non disponible',
                                tweetUrl: `https://twitter.com/i/status/${tweet.id}`,
                                priority: actionDecision.priority || 'medium'
                            };

                            // Ajouter des données spécifiques selon le type d'action
                            if (actionType === 'reply') {
                                actionData.replyText = generateReplyText(tweet, account);
                            }

                            queueManager.addAction(actionData);
                            scheduledActionsCount++;
                            
                            pushLiveLog(`[QUEUE] Action ${actionType} planifiée pour le tweet ${tweet.id} de @${pseudo} par @${account.username} dans ${Math.round((scheduledTime - Date.now()) / 1000)}s`);
                        }
                    }
                }
            }
        }

        pushLiveLog(`[SCAN] ${scheduledActionsCount} actions planifiées ajoutées à la queue`);

        return { 
            automationActive: true, 
            isAutomationEnabled, 
            lastTweetId: newestId,
            foundTweets: allTweets.map(tweet => ({
                id: tweet.id,
                text: tweet.text,
                author: tweet.author_username,
                created_at: tweet.created_at
            })),
            scheduledActionsCount
        };

    } catch (error) {
        pushLiveLog(`[ERREUR] Scan d'automatisation échoué: ${error.message}`);
        
        return { 
            automationActive: false, 
            isAutomationEnabled, 
            lastTweetId: newestId,
            foundTweets: []
        };
    }
}

/**
 * Génère un texte de réponse automatique
 */
function generateReplyText(tweet, account) {
    const replies = [
        "Très intéressant ! 🤔",
        "Merci pour ce partage 👍",
        "Excellente analyse !",
        "Très pertinent 💯",
        "Bien dit ! 🔥",
        "Totalement d'accord 💪",
        "Perspective intéressante ✨"
    ];
    
    return replies[Math.floor(Math.random() * replies.length)];
}

/**
 * Active/désactive l'automatisation
 */
function setAutomationEnabled(enabled) {
    isAutomationEnabled = enabled;
    pushLiveLog(`[AUTOMATION] ${enabled ? 'Activée' : 'Désactivée'}`);
}

/**
 * Retourne l'état de l'automatisation
 */
function getAutomationStatus() {
    return {
        isEnabled: isAutomationEnabled,
        lastTweetId,
        mutedAccountsCount: mutedAccounts.size
    };
}

/**
 * Fonction utilitaire pour générer un délai aléatoire
 */
function randomDelay(minMs, maxMs, context = '') {
    return new Promise(resolve => {
        const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
        if (context) {
            console.log(`[DELAY] ${context}: ${delay}ms`);
        }
        setTimeout(resolve, delay);
    });
}

/**
 * Fonction utilitaire pour pousser des logs en temps réel
 */
function pushLiveLog(message) {
    console.log(`[LIVE] ${message}`);
}

/**
 * Fonction utilitaire pour logger les actions système
 */
function logSystemAction(action, type) {
    console.log(`[SYSTEM] ${type}: ${action}`);
}

module.exports = {
    runAutomationScan,
    setAutomationEnabled,
    getAutomationStatus,
    pushLiveLog,
    logSystemAction,
    randomDelay,
};
