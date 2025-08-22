const { logToFile } = require('./logs-optimized');
const { masterQuotaManager } = require('./master-quota-manager');

// Cache pour les vérifications utilisateur (30 minutes)
const userVerificationCache = new Map();
const { addAction } = require('./actions-stats');

/**
 * Automation Service - Extracted from server.js
 * Responsibilities:
 * - Automatic tweet scanning
 * - Action execution (like, retweet, reply)
 * - Quota and rate limiting management
 * - AI comment generation
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
        logToFile(`[UNMUTE] Account ${accountId} automatically unmuted (pause expired)`);
    });
    
    if (expiredAccounts.length > 0) {
        logToFile(`[CLEANUP] Removed ${expiredAccounts.length} expired muted accounts from memory`);
    }
    
    return expiredAccounts.length;
}

/**
 * Real-time log buffer to reassure the user
 */
let liveLogs = [];
const MAX_LIVE_LOGS = 100;

/**
 * Add a message to real-time logs
 * @param {string} msg - Message to add
 */
function pushLiveLog(msg) {
    const timestamp = new Date().toISOString();
    liveLogs.unshift(`[${timestamp}] ${msg}`);
    if (liveLogs.length > MAX_LIVE_LOGS) {
        liveLogs.pop();
    }
    console.log('[LIVE_LOG]', msg);
}

// Initialisation du système
pushLiveLog('System initialized - Automation service ready');

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
    logToFile(`[429][${username}] Rate limit reached for ${action} - Error #${rateLimitInfo.errorCount}`);
    logToFile(`[429][${username}] Pause for ${rateLimitInfo.delayMinutes} minutes (exponential backoff)`);
    
    if (rateLimitInfo.shouldDisable) {
        logToFile(`[429][${username}] ⚠️  ACCOUNT DISABLED - Too many 429 errors (${rateLimitInfo.errorCount}/${RATE_LIMIT_CONFIG.maxRetries})`);
        logToFile(`[429][${username}] Account will be automatically reactivated in 24h`);
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
    logToFile(`[403][${username}] Authorization error for ${action} - Error #${tracker.errorCount}`);
    logToFile(`[403][${username}] Pause for ${AUTH_ERROR_CONFIG.pauseDuration} minutes`);
    
    // Alerts based on severity level
    if (tracker.errorCount >= AUTH_ERROR_CONFIG.criticalThreshold) {
        logToFile(`[403][${username}] 🚨 CRITICAL ALERT - ${tracker.errorCount} 403 errors detected`);
        logToFile(`[403][${username}] IMMEDIATELY check OAuth permissions and account status`);
        logToFile(`[403][${username}] Affected actions: ${tracker.actions.map(a => a.action).join(', ')}`);
        pushLiveLog(`[${username}] 🚨 ALERT - Too many 403 errors, check permissions`);
    } else if (tracker.errorCount >= AUTH_ERROR_CONFIG.maxErrors) {
        logToFile(`[403][${username}] ⚠️  WARNING - ${tracker.errorCount} recent 403 errors`);
        logToFile(`[403][${username}] Monitor this account, potential permissions issue`);
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
    logToFile(`[SYSTEM][${subtype.toUpperCase()}] ${detail}`);
}

/**
 * 🛡️ RATE-LIMIT SAFE DELAYS - PHASE 4
 * Increased delays to prevent 429 errors (100 actions/11h = 1 action/6.6min)
 * Target: Max 1 action per 8-10 minutes per account
 */
const ULTRA_OPTIMIZED_DELAYS = {
    like: { min: 45, max: 90 },      // 🛡️ 45-90s (was 5-12s) - Safer spacing
    retweet: { min: 60, max: 120 },  // 🛡️ 1-2min (was 8-18s) - More conservative  
    reply: { min: 120, max: 240 },   // 🛡️ 2-4min (was 25-50s) - AI + rate limit safety
    betweenAccounts: { min: 10, max: 20 },  // 🛡️ 10-20s between accounts (was 2-5s)
    betweenBatches: { min: 10, max: 20 }    // 🛡️ 30-60s between batches (was 1-2s)
};

/**
 * Function to create a random delay optimized by action type
 * @param {number|string} minSecondsOrActionType - Minimum delay in seconds OR action type
 * @param {number} maxSeconds - Maximum delay in seco   nds (optional if actionType)
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
        logToFile(`[DELAY] ${context} - Waiting ${delaySeconds}s before next action`);
    }
    
    return new Promise(resolve => setTimeout(resolve, delayMs));
}

/**
 * Main automation function - Modular version
 * This function will be called from server.js with injected dependencies
 * @param {Object} dependencies - Dependencies injected from server.js
 */
async function runAutomationScan(dependencies) {
    try {
        // Mark scan start for dynamic status
        global.isAutomationScanning = true;
        
        // Dynamic retrieval of injected AI Token Settings
    const aiTokenSettings = dependencies.aiTokenSettings || { tokenSymbol: '', tokenName: '', tokenX: '', tokenChain: '' };

    let { enabledActions } = dependencies;
    if (!enabledActions || !Array.isArray(enabledActions)) enabledActions = ['like', 'retweet', 'reply'];
    
    const {
        getAllConnectedAccounts, watchAccounts, lastTweetId, isAutomationEnabled, automationActive,
        rateLimitState, performedActionsDB,
        getRwClientById, generateUniqueAIComments, markActionAsPerformed, hasActionBeenPerformed,
        logSystemAction, pushLiveLog, randomDelay, logToFile
    } = dependencies;

    // 🔄 RÉCUPÉRATION DYNAMIQUE DES COMPTES À CHAQUE SCAN
    const accounts = getAllConnectedAccounts();
    logToFile(`[DYNAMIC] Récupération dynamique: ${accounts.length} comptes connectés`);
    
    // 🔍 DEBUG: Lister tous les comptes récupérés
    accounts.forEach((account, index) => {
        logToFile(`[DEBUG][ACCOUNT-${index + 1}] ID: ${account.id}, Username: ${account.username}, AuthMethod: ${account.authMethod}`);
    });

    // CRITICAL FIX: Use the shared mutedAccounts reference from dependencies
    // DO NOT create a new Map - use the original reference to maintain state
    const { mutedAccounts } = dependencies;
    if (!mutedAccounts || typeof mutedAccounts !== 'object' || typeof mutedAccounts.has !== 'function') {
        logToFile('[ERROR] mutedAccounts is not a valid Map - automation may not work correctly');
        return { automationActive, isAutomationEnabled };
    }

        // --- Clean expired muted accounts ---
        logToFile(`[DEBUG] Before cleanup: ${mutedAccounts.size} muted accounts in memory`);
        if (mutedAccounts.size > 0) {
            const now = Date.now();
            for (const [accountId, muteUntil] of mutedAccounts.entries()) {
                const timeLeft = muteUntil - now;
                const timeLeftMin = Math.round(timeLeft / 60000);
                logToFile(`[DEBUG] Account ${accountId} muted until ${new Date(muteUntil).toLocaleTimeString()} (${timeLeftMin}min remaining)`);
            }
        }
        
        const cleanedCount = cleanExpiredMutedAccounts(mutedAccounts);
        if (cleanedCount > 0) {
            logToFile(`[AUTOMATION] Cleaned ${cleanedCount} expired muted accounts before scan`);
        }
        
        logToFile(`[DEBUG] After cleanup: ${mutedAccounts.size} muted accounts remaining`)

        // --- Heartbeat log ---
        let scanActive = true;
        let lastHeartbeat = Date.now();
        const heartbeatInterval = 30000; // 30s
        
        function heartbeat() {
            if (!scanActive) return;
            logToFile(`[HEARTBEAT] Automation still active (scan in progress, ${Math.round((Date.now()-lastHeartbeat)/1000)}s since last heartbeat).`);
            lastHeartbeat = Date.now();
            setTimeout(heartbeat, heartbeatInterval);
        }
        setTimeout(heartbeat, heartbeatInterval);

        pushLiveLog('[AUTO] Starting automation scan...');
        logToFile(`[DEBUG][SCAN] Connected X accounts: ${accounts.map(a => a.username).join(', ')}`);
        
        // Vérifier les quotas avec le système master unifié
        const { getMasterQuotaManager } = require('./master-quota-manager');
        const masterQuota = getMasterQuotaManager();
        
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
            logSystemAction('Quota reached: automation stopped', 'quota');
            pushLiveLog('[AUTO] Quota reached, complete automation stop.');
            if (automationActive || isAutomationEnabled) {
                logToFile('[QUOTA][AUTO] Quota reached, complete automation stop (API polling disabled).');
            }
            return { automationActive: false, isAutomationEnabled: false };
        }
        
        if (!isAutomationEnabled) {
            logSystemAction('Automation is paused (isAutomationEnabled=false)', 'system');
            pushLiveLog('[AUTO] Automation disabled (isAutomationEnabled=false), no action.');
            logToFile('[AUTO][DEBUG] Automation disabled (isAutomationEnabled=false), no action.');
            return { automationActive, isAutomationEnabled };
        }
        
        if (!accounts.length) {
            pushLiveLog('[AUTO] No Twitter account connected, automation impossible.');
            logToFile('[AUTO][DEBUG] No Twitter account connected, automation impossible.');
            return { automationActive, isAutomationEnabled };
        }
        
        if (!watchAccounts.length) {
            pushLiveLog('[AUTO] No accounts to monitor (watchAccounts empty), automation impossible.');
            logToFile('[AUTO][DEBUG] No accounts to monitor (watchAccounts empty), automation impossible.');
            return { automationActive, isAutomationEnabled };
        }

        pushLiveLog(`[AUTO] Searching for new tweets from: ${watchAccounts.join(', ')}`);
        logToFile(`[AUTO] Searching for new tweets from: ${watchAccounts.join(', ')}`);

        if (!watchAccounts.length) {
            logToFile('[AUTO] No accounts to monitor, request not sent.');
            return { automationActive, isAutomationEnabled };
        }

        // Clean usernames: remove commas, spaces and unwanted characters
        const allPseudos = watchAccounts
            .filter(p => typeof p === 'string' && p.trim())
            .map(p => p.trim().replace(/[,\s]+/g, '').replace(/^@/, ''))
            .filter(p => p.length > 0);

        const MAX_FROM_PER_QUERY = 5; // Strict limit to avoid Twitter 400 errors
        let allTweets = [];
        let allUsers = [];
        let newestId = lastTweetId;
        let client;
        let searchAccountId = null;
        
        // 🔄 ESSAYER PLUSIEURS COMPTES POUR LA RECHERCHE (pas seulement le premier)
        for (let i = 0; i < accounts.length; i++) {
            const account = accounts[i];
            
            // Vérifier si ce compte est en rate limit
            if (rateLimitTracker.has(account.id)) {
                const tracker = rateLimitTracker.get(account.id);
                const now = Date.now();
                const timeSinceLastError = now - tracker.lastError;
                const delayInfo = calculateRateLimitDelay(account.id);
                
                if (timeSinceLastError < delayInfo.delayMs) {
                    logToFile(`[SKIP] Account ${account.username} still in rate limit (${Math.round((delayInfo.delayMs - timeSinceLastError) / 60000)}min remaining)`);
                    continue; // Passer au compte suivant
                }
            }
            
            try {
                client = await getRwClientById(account.id);
                searchAccountId = account.id;
                logToFile(`[SUCCESS] Using account ${account.username} (${account.id}) for Twitter search`);
                break; // Client trouvé, sortir de la boucle
            } catch (error) {
                logToFile(`[ERROR] Cannot use account ${account.username} for search: ${error.message}`);
                
                // Si c'est une erreur 429, l'enregistrer dans le tracker
                if (error.message.includes('429') || error.message.includes('Rate limit')) {
                    calculateRateLimitDelay(account.id);
                    logToFile(`[RATE-LIMIT] Account ${account.username} added to rate limit tracker`);
                }
                
                continue; // Essayer le compte suivant
            }
        }
        
        // Si aucun compte n'est disponible pour la recherche
        if (!client) {
            logToFile(`[ERROR] No available account for Twitter search - all accounts may be rate limited`);
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
            logToFile(`[DEBUG] Username batch (${batch.length}/10): ${batch.join(', ')}`);

            if (batch.length === 0) continue;

            const queryBase = batch.map(p => `from:${p}`).join(' OR ');
            if (!queryBase) continue;

            // Enhanced filtering: exclude retweets, replies, quotes and old tweets
            const searchQuery = `${queryBase} -is:retweet -is:reply -is:quote`;
            logToFile('[AUTO] Query sent to Twitter: ' + searchQuery);

            // Correct parameters for API v2
            const searchOptions = {
                'tweet.fields': ['created_at', 'author_id', 'public_metrics', 'referenced_tweets', 'in_reply_to_user_id'],
                'user.fields': ['username'],
                expansions: ['author_id'],
                max_results: 10,
            };

            // Validate and format since_id correctly
            if (lastTweetId && typeof lastTweetId === 'string' && lastTweetId.match(/^\d+$/)) {
                searchOptions.since_id = lastTweetId;
            }

            logToFile('[DEBUG] Twitter query: ' + searchQuery);
            logToFile('[DEBUG] Twitter options: ' + JSON.stringify(searchOptions));

            let searchResult;
            try {
                logToFile(`[AUTO][WAIT] Twitter API call in progress (may take several seconds)...`);
                // Correct syntax for API v2: search(query, options)
                searchResult = await client.v2.search(searchQuery, searchOptions);
                logToFile('[DEBUG] Raw Twitter response: ' + JSON.stringify(searchResult, null, 2).substring(0, 500) + '...');
            } catch (searchError) {
                logToFile(`[ERROR] Error during Twitter search: ${searchError.message || JSON.stringify(searchError)}`);
                pushLiveLog(`[ERROR] Twitter search failed: ${searchError.message}`);
                continue;
            }

            const tweets = searchResult?._realData?.data || [];
            if (tweets.length) {
                allTweets.push(...tweets);
                if (searchResult._realData?.includes?.users) {
                    allUsers.push(...searchResult._realData.includes.users);
                }
                logToFile(`[AUTO] Batch ${Math.floor(i/MAX_FROM_PER_QUERY) + 1}: ${tweets.length} tweets found`);
            } else {
                logToFile(`[AUTO] Batch ${Math.floor(i/MAX_FROM_PER_QUERY) + 1}: No tweets found`);
            }

            // Optimized delay between batches to avoid rate limiting
            if (i + MAX_FROM_PER_QUERY < allPseudos.length) {
                await randomDelay('betweenBatches');
            }
        }

        logToFile(`[AUTO] Search completed. ${allTweets.length} tweets found in total.`);
        logToFile(`[DEBUG][RAW_TWEETS] ${JSON.stringify(allTweets, null, 2).substring(0, 2000)}...`);
        
        // POST-REQUEST VALIDATION: Filter invalid tweets
        const validTweets = [];
        const now = Date.now();
        const maxAgeHours = 24; // Only tweets less than 24h old
        
        for (const tweet of allTweets) {
            // 1. Check tweet age (filter by recent date)
            const tweetAge = now - new Date(tweet.created_at).getTime();
            const tweetAgeHours = tweetAge / (1000 * 60 * 60);
            
            if (tweetAgeHours > maxAgeHours) {
                logToFile(`[FILTER] Tweet ${tweet.id} too old (${Math.round(tweetAgeHours)}h) - ignored`);
                continue;
            }
            
            // 2. Check it's an original tweet (no referenced_tweets)
            if (tweet.referenced_tweets && tweet.referenced_tweets.length > 0) {
                const refTypes = tweet.referenced_tweets.map(ref => ref.type).join(', ');
                logToFile(`[FILTER] Tweet ${tweet.id} with references (${refTypes}) - ignored`);
                continue;
            }
            
            // 3. Strict author validation: must be in monitored list
            const author = allUsers.find(u => u.id === tweet.author_id);
            const authorUsername = author ? author.username : null;
            
            if (!authorUsername) {
                logToFile(`[FILTER] Tweet ${tweet.id} without identified author - ignored`);
                continue;
            }
            
            // Check that author is in the monitored accounts list
            const isValidAuthor = allPseudos.some(pseudo => 
                pseudo.toLowerCase() === authorUsername.toLowerCase()
            );
            
            if (!isValidAuthor) {
                logToFile(`[FILTER] Tweet ${tweet.id} from @${authorUsername} not monitored - ignored`);
                continue;
            }
            
            // Valid tweet: add to list
            validTweets.push(tweet);
            logToFile(`[VALID] Tweet ${tweet.id} from @${authorUsername} validated (${Math.round(tweetAgeHours)}h)`);
        }
        
        // Replace allTweets with validated tweets
        allTweets = validTweets;
        
        logToFile(`[AUTO] Validation completed. ${allTweets.length} valid tweets after filtering.`);
        pushLiveLog(`[AUTO] ${allTweets.length} valid tweets found`);

        if (allTweets.length === 0) {
            logToFile('[AUTO] No valid tweets found after filtering, scan ended.');
            return { automationActive, isAutomationEnabled };
        }

        // Update lastTweetId with the most recent
        if (allTweets.length > 0) {
            const sortedTweets = allTweets.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            newestId = sortedTweets[0].id;
        }

        // --- DEBUG LOG: tweets before action generation ---
        logToFile(`[DEBUG][TWEETS_BEFORE_ACTIONS] ${JSON.stringify(allTweets, null, 2).substring(0, 2000)}...`);
        // 🎯 NEW UNIFIED SYSTEM: Generate actions according to automatic probabilities
        const actions = [];
        for (const tweet of allTweets) {
            const author = allUsers.find(u => u.id === tweet.author_id);
            const pseudo = author ? author.username : 'unknown';

            // Generate actions for each connected account with the new system
            for (const account of accounts) {
                logToFile(`[DEBUG][ACTION-GEN] Processing account: ${account.username} (${account.id}) for tweet ${tweet.id}`);
                
                // Use the master quota system to determine actions
                const masterQuota = getMasterQuotaManager();
                const actionDecision = masterQuota.determineActionsForTweet(account.id, tweet.id);
                
                logToFile(`[DEBUG][ACTION-DECISION] Account ${account.username}: ${actionDecision.actions.length} actions, reason: ${actionDecision.reason}`);
                
                if (actionDecision.actions.length > 0) {
                    logToFile(`[MASTER-QUOTA] Actions determined for ${account.username} on tweet ${tweet.id}: ${actionDecision.actions.join(', ')}`);
                    
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
                    logToFile(`[MASTER-QUOTA] No action for ${account.username} on tweet ${tweet.id}: ${actionDecision.reason}`);
                }
            }
        }

        logToFile(`[DEBUG][ACTIONS] ${actions.length} action(s) generated for execution.`);
        logToFile(`[DEBUG][ACTIONS_OBJ] ${JSON.stringify(actions, null, 2).substring(0, 2000)}...`);
        pushLiveLog(`[AUTO] ${actions.length} actions scheduled`);

        if (actions.length === 0) {
            logToFile('[AUTO] No actions to perform, scan ended.');
            return { automationActive, isAutomationEnabled, lastTweetId: newestId };
        }

        // Execute actions sequentially (parallelization temporarily disabled)
        for (const action of actions) {
            const accId = action.acc.id;
            
            // Check if account is muted (with automatic cleanup)
            if (mutedAccounts.has(accId)) {
                const muteUntil = mutedAccounts.get(accId);
                if (muteUntil > Date.now()) {
                    logToFile(`[MUTED] Account ${action.acc.username} muted until ${new Date(muteUntil).toLocaleString()}, action ignored`);
                    continue;
                } else {
                    // Account mute has expired, remove it and log unmuting
                    mutedAccounts.delete(accId);
                    logToFile(`[UNMUTE] Account ${action.acc.username} automatically unmuted (pause expired)`);
                }
            }

    let cli;
    try {
        cli = await getRwClientById(accId);
        if (!cli) {
            logToFile(`[ERROR] Twitter client not found for account ${accId}`);
            continue;
        }
    } catch (error) {
        logToFile(`[ERROR] Unable to create Twitter client for ${accId}: ${error.message}`);
        
        // Handle specific error types
        const errorCode = error.code || 'UNKNOWN';
        
        if (errorCode === 429) {
            // Rate limit error - use the same system as action errors
            handleRateLimitError(accId, action.acc.username, 'client_creation', mutedAccounts);
            logToFile(`[429][${action.acc.username}] Account muted due to rate limit during client creation`);
        } else if (error.message.includes('Token expiré') || error.message.includes('refresh échoué')) {
            // Expired token error
            mutedAccounts.set(accId, Date.now() + 60 * 60 * 1000); // 1 hour pause
            logToFile(`[OAUTH2] Account ${accId} muted for 1h - expired token`);
        } else {
            // Other errors - short pause to avoid spam
            mutedAccounts.set(accId, Date.now() + 5 * 60 * 1000); // 5 minutes pause
            logToFile(`[ERROR] Account ${accId} muted for 5min - client creation failed`);
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
                logToFile(`[CACHE] Using cached user info for ${action.acc.username}`);
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
                logToFile(`[CACHE] Cached user info for ${action.acc.username}`);
            }
        } catch (e) {
                const errorCode = e.code || e.status || 'UNKNOWN';
                
                if (errorCode === 401 && action.acc.authMethod === 'oauth2') {
                    logToFile(`[TOKEN-EXPIRED] OAuth2 token expired for ${action.acc.username} (${accId}) - Attempting refresh`);
                    
                    // Tenter le refresh automatique du token
                    try {
                        const { oauth2Manager } = require('./oauth2-manager');
                        const refreshedUser = await oauth2Manager.refreshUserToken(accId);
                        
                        if (refreshedUser) {
                            logToFile(`[TOKEN-REFRESH] Successfully refreshed token for ${action.acc.username} - Continuing automation`);
                            
                            // Créer un nouveau client avec le token rafraîchi
                            cli = getRwClientById(accId);
                            
                            // Retry l'appel v2.me() avec le nouveau token
                            const me = await cli.v2.me();
                            userObj = {
                                screen_name: me.data.username,
                                id_str: me.data.id,
                                name: me.data.name || me.data.username
                            };
                            
                            logToFile(`[TOKEN-REFRESH] User info retrieved successfully after refresh for ${action.acc.username}`);
                        }
                    } catch (refreshError) {
                        logToFile(`[TOKEN-REFRESH] Failed to refresh token for ${action.acc.username}: ${refreshError.message}`);
                        
                        // Si le refresh échoue, mettre en pause pour 1 heure
                        const mutedUntil = Date.now() + (60 * 60 * 1000);
                        mutedAccounts.set(accId, mutedUntil);
                        logToFile(`[MUTE] Account ${action.acc.username} muted until ${new Date(mutedUntil).toLocaleTimeString()} (refresh failed)`);
                        continue;
                    }
                } else {
                    logToFile(`[ERROR] Unable to get user info for ${accId} (${action.acc.authMethod || 'oauth1a'}): ${e.message}`);
                    continue;
                }
            }

            logToFile(`[DEBUG][ACTION] Starting action processing: [${action.acc.username}] ${action.type} on tweet ${action.tweetId} (@${action.pseudo})`);

            // --- Like ---
            if (action.type === 'like' && !hasActionBeenPerformed(action.tweetId, accId, 'like')) {
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
                        
                        logToFile(`[RATE-LIMIT][LIKE] ${action.acc.username}: ${remaining}/${limit} remaining, reset: ${new Date(resetTime * 1000).toLocaleTimeString()}`);
                        
                        // Alert if close to limit
                        if (remaining < limit * 0.1) {
                            logToFile(`[RATE-LIMIT-WARNING][LIKE] ${action.acc.username}: Only ${remaining} likes remaining!`);
                        }
                    }
                    
                    markActionAsPerformed(action.tweetId, accId, 'like');
                    
                    // Décrémenter le quota APRÈS succès de l'action avec master-quota-manager
                    const masterQuota = getMasterQuotaManager();
                    const quotaCheck = masterQuota.consumeAction(accId, 'like');
                    if (!quotaCheck.success) {
                        logToFile(`[QUOTA-WARNING][${action.acc.username}] Quota exceeded after like on tweet ${action.tweetId}`);
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
                    logToFile(enrichedLogData);
                    
                    // Ajouter au cache persistant des statistiques
                    addAction('like');
                } catch (e) {
                    // Gestion détaillée des erreurs API v2
                    const errorCode = e.code || e.status || 'UNKNOWN';
                    const errorMessage = e.message || e.data?.detail || JSON.stringify(e);
                    
                    logToFile(`[ERROR][${action.acc.username}] like tweet ${action.tweetId} - Code: ${errorCode} - Message: ${errorMessage}`);
                    
                    // Specific handling of 400, 403 and 429 errors
                    if (errorCode === 400) {
                        // Error 400: Invalid/deleted/protected tweet - mark as performed to avoid repetition
                        logToFile(`[BLACKLIST][${action.acc.username}] Tweet ${action.tweetId} added to blacklist (400 error)`);
                        markActionAsPerformed(action.tweetId, accId, 'like');
                        markActionAsPerformed(action.tweetId, accId, 'retweet');
                        markActionAsPerformed(action.tweetId, accId, 'reply');
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
                try {
                    // Utiliser l'ID du compte directement depuis userObj déjà récupéré
                    const userId = String(userObj.id_str || userObj.id || (userObj.data && userObj.data.id));
                    
                    const retweetResult = await cli.v2.retweet(userId, action.tweetId);
                    
                    // 🚀 MONITORING RATE LIMITS - PHASE 3
                    if (retweetResult.rateLimit) {
                        rateLimitState[accId] = { ...rateLimitState[accId], ...retweetResult.rateLimit };
                        const remaining = retweetResult.rateLimit.remaining || 0;
                        const limit = retweetResult.rateLimit.limit || 0;
                        const resetTime = retweetResult.rateLimit.reset || 0;
                        
                        logToFile(`[RATE-LIMIT][RETWEET] ${action.acc.username}: ${remaining}/${limit} restantes, reset: ${new Date(resetTime * 1000).toLocaleTimeString()}`);
                        
                        // Alerte si proche de la limite
                        if (remaining < limit * 0.1) {
                            logToFile(`[RATE-LIMIT-WARNING][RETWEET] ${action.acc.username}: Seulement ${remaining} retweets restants!`);
                        }
                    }
                    
                    markActionAsPerformed(action.tweetId, accId, 'retweet');
                    
                    // Décrémenter le quota APRÈS succès de l'action avec master-quota-manager
                    const masterQuota = getMasterQuotaManager();
                    const quotaCheck = masterQuota.consumeAction(accId, 'retweet');
                    if (!quotaCheck.success) {
                        logToFile(`[QUOTA-WARNING][${action.acc.username}] Quota dépassé après retweet sur tweet ${action.tweetId}`);
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
                    logToFile(enrichedLogData);
                    
                    // Ajouter au cache persistant des statistiques
                    addAction('retweet');
                } catch (e) {
                    // Gestion détaillée des erreurs API v2 pour retweet
                    const errorCode = e.code || e.status || 'UNKNOWN';
                    const errorMessage = e.message || e.data?.detail || JSON.stringify(e);
                    
                    logToFile(`[ERREUR][${action.acc.username}] RT tweet ${action.tweetId} - Code: ${errorCode} - Message: ${errorMessage}`);
                    
                    // Gestion spécifique des erreurs 400, 403 et 429
                    if (errorCode === 400) {
                        // Erreur 400: Tweet invalide/supprimé/protégé - marquer comme effectué pour éviter répétition
                        logToFile(`[BLACKLIST][${action.acc.username}] Tweet ${action.tweetId} ajouté à la blacklist (erreur 400)`);
                        markActionAsPerformed(action.tweetId, accId, 'like');
                        markActionAsPerformed(action.tweetId, accId, 'retweet');
                        markActionAsPerformed(action.tweetId, accId, 'reply');
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
                
                try {
                    logToFile('[AI_TOKEN_SETTINGS][AUTOMATION] Utilisés pour la génération IA : ' + JSON.stringify(aiTokenSettings));
                    // Générer le commentaire IA avec les settings injectés
                    const comments = await generateUniqueAIComments([action.tweet], {
                        maxComments: 1,
                        accountId: accId,
                        tokenSettings: aiTokenSettings
                    });

                    if (comments && comments.length > 0) {
                        const generatedComment = comments[0];
                        
                        // Vérifier si on doit ajouter une image (10% de chance)
                        const shouldAddImage = global.replyImagesSettings?.enabled && Math.random() < 0.1;
                        let mediaId = null;
                        
                        if (shouldAddImage && typeof global.getRandomReplyImage === 'function') {
                            try {
                                const imagePath = global.getRandomReplyImage();
                                if (imagePath) {
                                    const fs = require('fs');
                                    const imageBuffer = fs.readFileSync(imagePath);
                                    const uploadResult = await cli.v1.uploadMedia(imageBuffer, { mimeType: 'image/jpeg' });
                                    mediaId = uploadResult;
                                    logToFile(`[REPLY-IMAGE][${action.acc.username}] Image ajoutée au reply: ${imagePath.split('/').pop()}`);
                                }
                            } catch (imageError) {
                                logToFile(`[REPLY-IMAGE-ERROR][${action.acc.username}] Erreur upload image: ${imageError.message}`);
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
                            
                            logToFile(`[RATE-LIMIT][REPLY] ${action.acc.username}: ${remaining}/${limit} restantes, reset: ${new Date(resetTime * 1000).toLocaleTimeString()}`);
                            
                            // Alerte si proche de la limite
                            if (remaining < limit * 0.1) {
                                logToFile(`[RATE-LIMIT-WARNING][REPLY] ${action.acc.username}: Seulement ${remaining} replies restants!`);
                            }
                        }
                        
                        // Marquer l'action comme effectuée
                        markActionAsPerformed(action.tweetId, accId, 'reply');
                        
                        // Décrémenter le quota APRÈS succès de l'action avec master-quota-manager
                        const masterQuota = getMasterQuotaManager();
                        const quotaCheck = masterQuota.consumeAction(accId, 'reply');
                        if (!quotaCheck.success) {
                            logToFile(`[QUOTA-WARNING][${action.acc.username}] Quota dépassé après reply sur tweet ${action.tweetId}`);
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
                        
                        logToFile(enrichedLogData);
                        pushLiveLog(`[${action.acc.username}] Reply tweet ${action.tweetId} de @${action.pseudo} (${dailyUsed}/${dailyLimit})`);
                        
                        // Ajouter au cache persistant des statistiques
                        addAction('reply');
                    } else {
                        logToFile(`[ERREUR][${action.acc.username}] Aucun commentaire généré pour le tweet ${action.tweetId}`);
                    }
                } catch (e) {
                    // Gestion détaillée des erreurs API v2 pour reply
                    const errorCode = e.code || e.status || 'UNKNOWN';
                    const errorMessage = e.message || e.data?.detail || JSON.stringify(e);
                    
                    logToFile(`[ERREUR][${action.acc.username}] reply tweet ${action.tweetId} - Code: ${errorCode} - Message: ${errorMessage}`);
                    
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

            // Délai optimisé selon le type d'action
            await randomDelay(action.type);
        }

        scanActive = false; // Arrêter le heartbeat
        logToFile('[AUTO] Scan d\'automatisation terminé avec succès.');
        
        // Marquer la fin du scan pour le statut dynamique
        global.isAutomationScanning = false;
        
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
        
        logToFile(`[ERROR][AUTO] Critical error in runAutomationScan: ${error.message || JSON.stringify(error)}`);
        pushLiveLog(`[ERROR] Automation scan failed: ${error.message}`);
        
        return { 
            automationActive: false, 
            isAutomationEnabled: false,
            error: error.message 
        };
    }
}

/**
 * Get live logs for API consumption
 * @returns {Array} Array of live log messages
 */
function getLiveLogs() {
    return liveLogs;
}

module.exports = {
    runAutomationScan,
    pushLiveLog,
    logSystemAction,
    randomDelay,
    liveLogs,
    getLiveLogs
};
