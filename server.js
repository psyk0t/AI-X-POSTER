// Configuration des dépendances nécessaires
require('dotenv').config();
const fs = require('fs');
const express = require('express');
const { TwitterApi } = require('twitter-api-v2');
const axios = require('axios');
const cors = require('cors');

// Configuration du serveur Express
// Utilisation du port spécifié dans .env ou 3000 par défaut
const app = express();
const PORT = process.env.PORT || 3000;

// Configuration des middlewares
// CORS pour permettre les requêtes depuis n'importe quelle origine
app.use(cors());
// Parser les requêtes JSON
app.use(express.json());
app.use(express.static(__dirname));

// --- Gestion multi-comptes X (stockage en mémoire) ---
const accounts = [];
let watchAccounts = [];
let isAutomationEnabled = true;

// --- Limitation des actions automatisées ---
// --- Limitation des actions automatisées par type ---
let quotas = { like: 100, retweet: 100, comment: 100 };
let actionCounts = { like: 0, retweet: 0, comment: 0 };
let automationActive = true;

// Nouvelle route pour définir les quotas par type d'action
app.post('/api/set-action-limit', (req, res) => {
  const { like, retweet, comment } = req.body;
  if (
    (typeof like === 'number' && like > 0) &&
    (typeof retweet === 'number' && retweet > 0) &&
    (typeof comment === 'number' && comment > 0)
  ) {
    quotas = { like, retweet, comment };
    actionCounts = { like: 0, retweet: 0, comment: 0 };
    automationActive = true;
    res.json({ success: true, quotas });
  } else {
    res.status(400).json({ error: 'Limites invalides' });
  }
});


// Gestion du rate limit strict : 5 requêtes max / 15 min / utilisateur
const userRateLimits = new Map(); // { userId: { count: number, resetTime: number } }
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes en millisecondes
const MAX_REQUESTS_PER_WINDOW = 5; // 5 requêtes max par fenêtre

// Fonction pour vérifier et mettre à jour le compteur de requêtes
function checkAndUpdateRateLimit(userId) {
    const now = Date.now();
    let userLimit = userRateLimits.get(userId);

    // Si pas de limite pour cet utilisateur ou si la fenêtre est expirée, on réinitialise
    if (!userLimit || now > userLimit.resetTime) {
        userLimit = { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
        userRateLimits.set(userId, userLimit);
    }

    // Incrémente le compteur
    userLimit.count++;

    // Si on dépasse la limite, on renvoie false
    return userLimit.count <= MAX_REQUESTS_PER_WINDOW;
}

// Middleware pour appliquer le rate limiting
function enforceRateLimit(req, res, next) {
    const userId = req.headers['x-user-id'] || 'default'; // À adapter selon comment tu identifies les utilisateurs
    
    if (!checkAndUpdateRateLimit(userId)) {
        const resetTime = userRateLimits.get(userId).resetTime;
        const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
        
        res.set('Retry-After', retryAfter);
        return res.status(429).json({ 
            error: 'Trop de requêtes',
            message: `Limite de ${MAX_REQUESTS_PER_WINDOW} requêtes par 15 minutes atteinte. Réessayez dans ${retryAfter} secondes.`
        });
    }
    
    next();
}

const rateLimitState = {}; // { accountId: {limit, remaining, reset, dailyLimit, dailyRemaining, dailyReset, dailyBlocked} }

async function initAllAccountsRateLimit(accounts) {
    for (const acc of accounts) {
        try {
            const client = getRwClientById(acc.id);
            const user = await client.currentUser();
            // Requête inoffensive pour obtenir les headers
            const res = await client.v2.userTimeline(user.id_str || user.id, { max_results: 1 });
            const headers = res?.headers || {};
            rateLimitState[acc.id] = {
                limit: parseInt(headers['x-rate-limit-limit']) || null,
                remaining: parseInt(headers['x-rate-limit-remaining']) || null,
                reset: parseInt(headers['x-rate-limit-reset']) || null,
                dailyLimit: parseInt(headers['x-user-limit-24hour-limit']) || null,
                dailyRemaining: parseInt(headers['x-user-limit-24hour-remaining']) || null,
                dailyReset: parseInt(headers['x-user-limit-24hour-reset']) || null,
                dailyBlocked: parseInt(headers['x-user-limit-24hour-remaining']) === 0
            };
            console.log(`[INIT][${acc.username}] Quota initialisé :`, rateLimitState[acc.id]);
        } catch (e) {
            console.log(`[INIT][${acc.username}] Impossible d'initialiser le quota :`, e.message);
        }
    }
}

// Appel au démarrage (si comptes déjà présents)
(async () => {
    if (accounts.length > 0) {
        await initAllAccountsRateLimit(accounts);
    }
})();
let accountCounter = 1;

// --- Gestion des comptes à surveiller (automation) ---

// API pour gérer le statut de l'automatisation
app.get('/api/automation-status', (req, res) => {
    res.json({ isEnabled: isAutomationEnabled });
});

app.post('/api/automation-status', (req, res) => {
    const { enable } = req.body;
    if (typeof enable === 'boolean') {
        isAutomationEnabled = enable;
    } else {
        // Comportement de bascule si 'enable' n'est pas fourni
        isAutomationEnabled = !isAutomationEnabled;
    }
    logToFile(`[AUTO] Statut de l'automatisation changé : ${isAutomationEnabled ? 'Activé' : 'Désactivé'}`);
    res.json({ isEnabled: isAutomationEnabled });
});

// API pour enregistrer la liste des comptes à surveiller
app.post('/api/watch-accounts', (req, res) => {
    const { pseudos } = req.body;
    if (!Array.isArray(pseudos)) return res.status(400).json({ error: 'Format attendu: { pseudos: ["pseudo1", ...] }' });
    watchAccounts = pseudos.map(p => p.trim().replace(/^@/, '')).filter(Boolean);
    console.log(`[WATCH] Liste des comptes à surveiller mise à jour:`, watchAccounts);
    res.json({ success: true, watchAccounts });
});

// API pour récupérer la liste actuelle
app.get('/api/watch-accounts', (req, res) => {
    res.json({ watchAccounts });
});



// --- SCHEDULER AUTOMATIQUE : surveillance & interaction ---
const seenTweets = {}; // { username: Set(tweetId) }


// (déplacé plus haut avec la fonction d'init automatique)
function logToFile(msg) {
    const ts = new Date().toISOString();
    fs.appendFileSync('auto-actions.log', `[${ts}] ${msg}\n`);
}

// Variable pour stocker l'ID du dernier tweet traité pour ne pas le traiter à nouveau
let lastTweetId = null;

// Fonction pour créer un délai aléatoire
function randomDelay(minSeconds, maxSeconds) {
    const ms = (Math.random() * (maxSeconds - minSeconds) + minSeconds) * 1000;
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Stockage en mémoire des derniers tweets trouvés pour le frontend
let foundTweets = [];

// Pour mettre en sourdine les comptes qui ont atteint leur rate limit
const mutedAccounts = new Map(); // accountId => muteUntilTimestamp

// Pour garder une trace des actions déjà effectuées { tweetId: Set(accountId) }
const performedActions = {};

// --- Statistiques pour le tableau de bord ---
let actionStats = { likes: 0, retweets: 0, comments: 0 };
let actionLog = []; // { timestamp, type, tweetId, tweetUrl, originalAuthor, actingAccount }
const MAX_LOG_SIZE = 100; // On garde les 100 dernières actions en mémoire

// API pour le tableau de bord
app.get('/api/dashboard-stats', (req, res) => {
    res.json({
        totalLikes: actionStats.likes,
        totalRetweets: actionStats.retweets,
        totalComments: actionStats.comments,
        recentActions: actionLog,
        quotas,
        actionsLeft: {
            like: Math.max(quotas.like - actionCounts.like, 0),
            retweet: Math.max(quotas.retweet - actionCounts.retweet, 0),
            comment: Math.max(quotas.comment - actionCounts.comment, 0)
        }
    });
});

// API pour récupérer les derniers tweets trouvés
app.get('/api/found-tweets', (req, res) => {
    res.json({ tweets: foundTweets });
});
const MAX_FOUND_TWEETS = 50; // On garde les 50 derniers tweets en mémoire

setInterval(async () => {
    // Blocage total si un quota est atteint
    if (
        actionCounts.like >= quotas.like &&
        actionCounts.retweet >= quotas.retweet &&
        actionCounts.comment >= quotas.comment
    ) {
        if (automationActive || isAutomationEnabled) {
            logToFile('[QUOTA][AUTO] Quota atteint, arrêt complet de l’automatisation (API polling désactivé).');
        }
        automationActive = false;
        isAutomationEnabled = false;
        return;
    }
    if (!isAutomationEnabled || !watchAccounts.length || !accounts.length) return;

    logToFile(`[AUTO] Recherche de nouveaux tweets pour : ${watchAccounts.join(', ')}`);

    try {
        if (!watchAccounts.length) {
    logToFile('[AUTO] Aucun compte à surveiller, requête non envoyée.');
    return;
}
const allPseudos = watchAccounts.filter(p => typeof p === 'string' && p.trim());
const MAX_FROM_PER_QUERY = 10;
let allTweets = [];
let allUsers = [];
let newestId = lastTweetId;
const client = getRwClientById(accounts[0].id);
for (let i = 0; i < allPseudos.length; i += MAX_FROM_PER_QUERY) {
    const batch = allPseudos.slice(i, i + MAX_FROM_PER_QUERY);
    logToFile(`[DEBUG] Batch de pseudos (${batch.length}/10): ${batch.join(', ')}`);
    if (batch.length === 0) continue;
    const queryBase = batch.map(p => `from:${p}`).join(' OR ');
    if (!queryBase) continue;
    const searchQuery = `${queryBase} -is:retweet -is:reply`;
    logToFile('[AUTO] Query envoyée à Twitter : ' + searchQuery);
    const searchParams = {
        query: searchQuery,
        'tweet.fields': 'created_at,author_id',
        expansions: 'author_id',
        max_results: 10,
    };
    if (lastTweetId) {
        searchParams.since_id = lastTweetId;
    }
    logToFile('[DEBUG] Paramètres Twitter : ' + JSON.stringify(searchParams));
    logToFile('[DEBUG] Credentials : ' + JSON.stringify({
        appKey: process.env.X_API_KEY ? 'OK' : 'MISSING',
        appSecret: process.env.X_API_SECRET ? 'OK' : 'MISSING',
        accessToken: process.env.X_ACCESS_TOKEN ? 'OK' : 'MISSING',
        accessSecret: process.env.X_ACCESS_TOKEN_SECRET ? 'OK' : 'MISSING',
    }));
    let searchResult;
    try {
        searchResult = await client.v2.search(searchParams);
        logToFile('[DEBUG] Réponse brute Twitter : ' + JSON.stringify(searchResult));
    } catch (apiError) {
        logToFile('[DEBUG][API ERROR] ' + (apiError.stack || JSON.stringify(apiError)));
        continue;
    }
    if (searchResult.data && searchResult.data.data && searchResult.data.data.length > 0) {
        allTweets = allTweets.concat(searchResult.data.data);
        if (searchResult.data.meta && searchResult.data.meta.newest_id) {
            if (!newestId || searchResult.data.meta.newest_id > newestId) {
                newestId = searchResult.data.meta.newest_id;
            }
        }
        if (searchResult.data.includes && searchResult.data.includes.users) {
            allUsers = allUsers.concat(searchResult.data.includes.users);
        }
    }
}
if (newestId) lastTweetId = newestId;
if (!allTweets.length) return;
const usersMap = new Map(allUsers.map(u => [u.id, u.username]));
let actions = [];
// Correction : enrichir allTweets avec les bons champs pour filtrage replies
for (const tweet of allTweets) {
            const pseudo = usersMap.get(tweet.author_id);
            if (!pseudo) continue;

            logToFile(`[TWEET TROUVÉ][@${pseudo}] ID: ${tweet.id} - ${tweet.text.slice(0, 50)}...`);

            const newTweet = {
                id: tweet.id,
                text: tweet.text,
                author: pseudo,
                url: `https://x.com/${pseudo}/status/${tweet.id}`,
                timestamp: new Date(tweet.created_at).toISOString(),
                in_reply_to_status_id: tweet.in_reply_to_status_id,
                in_reply_to_user_id: tweet.in_reply_to_user_id
            };
            foundTweets.unshift(newTweet);

            for (const acc of accounts) {
                const rl = rateLimitState[acc.id] || {};
                if (rl.dailyBlocked === true || rl.dailyRemaining === 0) {
                    logToFile(`[BLOQUÉ][${acc.username}] Quota épuisé ou compte bloqué, aucune action sur ${tweet.id}`);
                    continue;
                }
                logToFile(`[ACTION PRÉPARÉE][${acc.username}] Action sur tweet ${tweet.id} de @${pseudo}`);
                actions.push({ pseudo, tweetId: tweet.id, tweetText: tweet.text, acc });
            }
        }

        if (foundTweets.length > MAX_FOUND_TWEETS) {
            foundTweets = foundTweets.slice(0, MAX_FOUND_TWEETS);
        }

        if (actions.length === 0) return;

        logToFile(`[ACTION] Traitement de ${actions.length} actions...`);

        const actionsByTweet = actions.reduce((acc, action) => {
            if (!acc[action.tweetId]) acc[action.tweetId] = [];
            acc[action.tweetId].push(action);
            return acc;
        }, {});

        
        for (const tweetId in actionsByTweet) {
    // --- Filtrage : ne retweeter que les tweets directs (pas de reply) ---
    const tweetObj = allTweets.find(t => t.id_str === tweetId || t.id === tweetId);
    if (tweetObj && (tweetObj.in_reply_to_status_id || tweetObj.in_reply_to_user_id)) {
        logToFile(`[FILTRAGE][RT][${tweetObj.author}] Tweet ${tweetObj.id} est une réponse : retweet ignoré.`);
        // C'est une réponse, on saute le retweet
        actionsByTweet[tweetId] = actionsByTweet[tweetId].filter(a => a.type !== 'retweet');
        if (actionsByTweet[tweetId].length === 0) continue;
    }
    // --- Limitation d'actions automation par type ---
    if (!automationActive ||
        actionCounts.like >= quotas.like ||
        actionCounts.retweet >= quotas.retweet ||
        actionCounts.comment >= quotas.comment
    ) {
        if (automationActive &&
            (actionCounts.like >= quotas.like || actionCounts.retweet >= quotas.retweet || actionCounts.comment >= quotas.comment)) {
            automationActive = false;
                logToFile(`[AUTO] Limite atteinte : Like (${actionCounts.like}/${quotas.like}), Retweet (${actionCounts.retweet}/${quotas.retweet}), Commentaire (${actionCounts.comment}/${quotas.comment}). Automatisation stoppée.`);
                return; // Arrêt immédiat du traitement pour éviter tout appel API ou action superflue
        }
        break;
    }
            const tweetActions = actionsByTweet[tweetId];
            const tweetText = tweetActions[0].tweetText;

            let uniqueComments = [];
            if (process.env.OPENAI_API_KEY) {
                const accountsThatWillComment = tweetActions.length;
                uniqueComments = await generateUniqueAIComments(tweetText, accountsThatWillComment);
                if (uniqueComments.length > 0) {
                    logToFile(`[IA PREVIEW][Tweet ${tweetId}] Commentaires générés : ${JSON.stringify(uniqueComments)}`);
                }
            }

            for (const action of tweetActions) {
                const accId = action.acc.id;
                const rl = rateLimitState[accId] || {};
                const now = Math.floor(Date.now() / 1000);

                if (mutedAccounts.has(accId) && mutedAccounts.get(accId) > Date.now()) {
                    const muteUntil = new Date(mutedAccounts.get(accId)).toLocaleTimeString();
                    logToFile(`[SOURDINE][${action.acc.username}] Compte en pause jusqu'à ${muteUntil}, action ignorée.`);
                    continue;
                }

                if (rl.dailyBlocked === true || rl.dailyRemaining === 0) {
                    logToFile(`[BLOQUÉ 24H][${action.acc.username}] Quota 24h épuisé, action ${action.tweetId} ignorée.`);
                    continue;
                }
                if (rl.remaining === 0 && rl.reset > now) {
                    const waitMs = (rl.reset - now + 2) * 1000;
                    logToFile(`[RATE LIMIT][${action.acc.username}] Limite atteinte, attente ${waitMs / 1000}s`);
                    await new Promise(r => setTimeout(r, waitMs));
                }

                try {
                    const cli = getRwClientById(accId);
                    const userObj = await cli.currentUser();

                    // --- Like ---
                    if (actionCounts.like >= quotas.like) {
                        logToFile(`[QUOTA] Limite de likes atteinte. Arrêt du flow.`);
                        automationActive = false;
                        return;
                    }
                    if (!performedActions[action.tweetId]?.likes?.has(accId)) {
                        await randomDelay(60, 120);
                        try {
                            const likeResult = await cli.v2.like(userObj.id_str || userObj.id, action.tweetId);
                            if (likeResult.rateLimit) rateLimitState[accId] = { ...rateLimitState[accId], ...likeResult.rateLimit };
                            if (!performedActions[action.tweetId]) performedActions[action.tweetId] = {};
                            if (!performedActions[action.tweetId].likes) performedActions[action.tweetId].likes = new Set();
                            performedActions[action.tweetId].likes.add(accId);
                            logToFile(`[${action.acc.username}] Like tweet ${action.tweetId} de @${action.pseudo}`);
                            actionCounts.like++;
actionStats.likes++;
                            actionLog.unshift({
                                timestamp: new Date().toISOString(),
                                type: 'like',
                                tweetId: action.tweetId,
                                tweetUrl: `https://x.com/${action.pseudo}/status/${action.tweetId}`,
                                originalAuthor: action.pseudo,
                                actingAccount: action.acc.username
                            });
                            if (actionLog.length > MAX_LOG_SIZE) actionLog.pop();
                        } catch (e) {
                            logToFile(`[ERREUR][${action.acc.username}] like tweet ${action.tweetId} : ${e.message || JSON.stringify(e)}`);
                            if (e.code === 429) mutedAccounts.set(accId, Date.now() + 15 * 60 * 1000);
                        }
                    }

                    // --- Retweet ---
                    if (actionCounts.retweet >= quotas.retweet) {
                        logToFile(`[QUOTA] Limite de retweets atteinte. Arrêt du flow.`);
                        automationActive = false;
                        return;
                    }
                    if (!performedActions[action.tweetId]?.retweets?.has(accId)) {
                        await randomDelay(60, 120);
                        try {
                            const retweetResult = await cli.v2.retweet(userObj.id_str || userObj.id, action.tweetId);
                            if (retweetResult.rateLimit) rateLimitState[accId] = { ...rateLimitState[accId], ...retweetResult.rateLimit };
                            if (!performedActions[action.tweetId]) performedActions[action.tweetId] = {};
                            if (!performedActions[action.tweetId].retweets) performedActions[action.tweetId].retweets = new Set();
                            performedActions[action.tweetId].retweets.add(accId);
                            logToFile(`[${action.acc.username}] RT tweet ${action.tweetId} de @${action.pseudo}`);
                            actionCounts.retweet++;
actionStats.retweets++;
                            actionLog.unshift({
                                timestamp: new Date().toISOString(),
                                type: 'retweet',
                                tweetId: action.tweetId,
                                tweetUrl: `https://x.com/${action.pseudo}/status/${action.tweetId}`,
                                originalAuthor: action.pseudo,
                                actingAccount: action.acc.username
                            });
                            if (actionLog.length > MAX_LOG_SIZE) actionLog.pop();
                        } catch (e) {
                            logToFile(`[ERREUR][${action.acc.username}] RT tweet ${action.tweetId} : ${e.message || JSON.stringify(e)}`);
                            if (e.code === 429) mutedAccounts.set(accId, Date.now() + 15 * 60 * 1000);
                        }
                    }

                    // --- Commentaire automatique par IA ---
                    if (actionCounts.comment >= quotas.comment) {
                        logToFile(`[QUOTA] Limite de commentaires atteinte. Arrêt du flow.`);
                        automationActive = false;
                        return;
                    }
                    if (process.env.OPENAI_API_KEY && !performedActions[action.tweetId]?.comments?.has(accId) && uniqueComments.length > 0) {
                        await randomDelay(60, 120);
                        try {
                            const aiComment = uniqueComments.shift();
                            if (aiComment) {
                                const replyResult = await cli.v2.reply(aiComment, action.tweetId);
                                if (replyResult.rateLimit) rateLimitState[accId] = { ...rateLimitState[accId], ...replyResult.rateLimit };
                                if (!performedActions[action.tweetId]) performedActions[action.tweetId] = {};
                                if (!performedActions[action.tweetId].comments) performedActions[action.tweetId].comments = new Set();
                                performedActions[action.tweetId].comments.add(accId);
                                logToFile(`[${action.acc.username}] Commentaire IA sur tweet ${action.tweetId} de @${action.pseudo}: \"${aiComment}\"`);
                                actionCounts.comment++;
                                actionStats.comments++;
                                actionLog.unshift({
                                    timestamp: new Date().toISOString(),
                                    type: 'comment',
                                    text: aiComment,
                                    tweetId: action.tweetId,
                                    tweetUrl: `https://x.com/${action.pseudo}/status/${action.tweetId}`,
                                    originalAuthor: action.pseudo,
                                    actingAccount: action.acc.username
                                });
                                if (actionLog.length > MAX_LOG_SIZE) actionLog.pop();
                            }
                        } catch (e) {
                            logToFile(`[ERREUR][${action.acc.username}] Commentaire tweet ${action.tweetId} : ${e.message || JSON.stringify(e)}`);
                            if (e.code === 429) mutedAccounts.set(accId, Date.now() + 15 * 60 * 1000);
                        }
                    }
                } catch (e) {
                    logToFile(`[ERREUR MAJEUR][${action.acc.username}] lors du traitement de l'action pour ${action.tweetId} : ${e.stack || JSON.stringify(e)}`);
                }
            }
        }
    } catch (err) {
        logToFile(`[ERREUR FATALE] Erreur lors de la recherche de tweets : ${(err.stack || JSON.stringify(err))}`);
        console.error("[ERREUR FATALE] Erreur lors de la recherche de tweets", err);
    }
}, 2 * 60 * 1000); // toutes les 2 minutes

// --- Intelligence Artificielle ---
// (OpenAI supprimé, on utilise Perplexity uniquement)

async function generateUniqueAIComments(tweetText, count) {
    if (count === 0) return [];
    try {
        logToFile(`[IA] Génération de ${count} commentaire(s) unique(s) pour le tweet : "${tweetText}"`);
        const promises = [];
        // On génère un peu plus de commentaires que nécessaire pour augmenter les chances d'avoir des uniques
        const generationCount = Math.ceil(count * 1.5);
        for (let i = 0; i < generationCount; i++) { 
            promises.push(generateAIComment(tweetText));
        }
        const results = await Promise.all(promises);
        const uniqueSet = new Set(results.filter(Boolean)); // new Set() pour dédupliquer
        return Array.from(uniqueSet).slice(0, count); // On retourne le nombre exact demandé
    } catch (error) {
        logToFile(`[ERREUR IA] Erreur lors de la génération de commentaires uniques : ${error.message}`);
        return [];
    }
}

// Génère un commentaire IA crypto naturel (sans contexte dynamique)
async function generateAIComment(tweetText) {
    if (!process.env.PERPLEXITY_API_KEY) {
        logToFile('[IA] Clé API Perplexity non configurée.');
        return null;
    }
    try {
        const prompt = `You are a casual American crypto enthusiast replying to a tweet from an influencer or KOL on X. Respond in laid-back US English, friendly and familiar, not robotic. Keep it EXTREMELY short: 1 sentence only, under 100 characters total. Be direct, thoughtful, and tied ONLY to the tweet's exact content – no extra details or off-topic additions.

Key rules:
- Stay STRICTLY on-topic: Do NOT introduce new ideas or news unless explicitly in the tweet. If vague, reply minimally with agreement or a quick question – no additions.
- Use subtle slang (e.g., "gm," "LFG") only if it fits naturally – no forcing.
- No emojis unless one is perfect and subtle.
- Respond in English only.

Promotion Rule:
- ALWAYS subtly promote $PICA (@picaonbase, Pineapple Cat on Base L2 ETH) in your reply by linking it naturally to the tweet's theme (e.g., as a similar opportunity or your fav gem). Keep it brief and authentic – do not make it spammy or forced.

Web Search Rules:
- Perform a web search ONLY if the tweet explicitly mentions a specific crypto, event, or topic (e.g., "SOL" or "Ethereum ETF").
- If searching, make it narrow: Query for recent info on THAT exact topic ONLY (e.g., for "SOL pumping", search "current Solana price and latest Solana news"). Do NOT search or add general crypto news (like BTC/ETH prices or market trends) unless THAT specific thing is mentioned.
- ALWAYS include a narrow search for "current $PICA price and latest Pineapple Cat news on Base" and subtly integrate if it fits your promotion without adding length or going off-topic.
- Subtly integrate the searched info ONLY if it fits naturally in your 1-sentence reply. If not relevant or if it would make the reply longer, ignore it completely.
- If the tweet is general/vague (no specific mentions), do NOT search extra – just reply casually with the $PICA promotion.

Good example (for tweet "lesgo!"): "LFG with $PICA on Base – Pineapple Cat's pumping too!"
Bad example (avoid): Anything longer than 1 sentence, without $PICA mention, or with unrelated hype.

Tweet: "${tweetText}"

Generate JUST the reply text – nothing else.`;
        const response = await axios.post(
            'https://api.perplexity.ai/chat/completions',
            {
                model: "sonar",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 1040,
                temperature: 0.8
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        const comment = response.data.choices[0].message.content.trim();
        return comment;
    } catch (error) {
        logToFile(`[ERREUR IA] ${error.message}`);
        console.error('Erreur Perplexity:', error);
        return null;
    }
}

function createRwClient(tokens) {
    const twitterClient = new TwitterApi({
        appKey: tokens.apiKey,
        appSecret: tokens.apiSecret,
        accessToken: tokens.accessToken,
        accessSecret: tokens.accessSecret,
    });
    return twitterClient.readWrite;
}

function getRwClientById(accountId) {
    const acc = accounts.find(a => a.id === String(accountId));
    if (!acc) throw new Error('Compte X non trouvé');
    return createRwClient(acc.tokens);
}

// Route pour ajouter un compte X (POST /api/add-account)
app.post('/api/add-account', async (req, res) => {
    const { apiKey, apiSecret, accessToken, accessSecret } = req.body;
    if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
        return res.status(400).json({ error: 'Clés API manquantes' });
    }
    try {
        const rwClient = createRwClient({ apiKey, apiSecret, accessToken, accessSecret });
        const me = await rwClient.currentUser();
        const account = {
            id: String(accountCounter++),
            username: me.screen_name || me.username,
            userId: me.id_str || me.id,
            tokens: { apiKey, apiSecret, accessToken, accessSecret }
        };
        accounts.push(account);
        await initAllAccountsRateLimit([account]); // Initialisation du quota pour ce compte
        res.json({ success: true, account });
    } catch (error) {
        res.status(400).json({ error: 'Impossible de valider ce compte X', details: error.data || error.message });
    }
});

// Route pour lister les comptes X connectés
app.get('/api/accounts', (req, res) => {
    res.json(accounts.map(a => ({ id: a.id, username: a.username, userId: a.userId })));
});

// Route pour effectuer une action sur un tweet (like, retweet, comment)
app.get('/api/watch-accounts', (req, res) => {
    res.json({ watchAccounts });
});

app.post('/api/watch-accounts', (req, res) => {
    const { pseudos } = req.body;
    if (Array.isArray(pseudos)) {
        watchAccounts = pseudos;
        res.json({ message: 'Liste des comptes à surveiller mise à jour.' });
    } else {
        res.status(400).json({ error: 'Le format des données est incorrect.' });
    }
});

app.get('/api/automation-status', (req, res) => {
    res.json({ isEnabled: isAutomationEnabled });
});

app.post('/api/automation-status', (req, res) => {
    isAutomationEnabled = !isAutomationEnabled;
    res.json({ isEnabled: isAutomationEnabled });
});

app.post('/api/action', async (req, res) => {
    const { action, tweetId, commentText, accountId } = req.body;

    // Bloc de blocage strict des quotas globaux
    if (
        (action === 'like' && actionCounts.like >= quotas.like) ||
        (action === 'retweet' && actionCounts.retweet >= quotas.retweet) ||
        (action === 'comment' && actionCounts.comment >= quotas.comment)
    ) {
        return res.status(403).json({ error: `Quota atteint pour l'action ${action}.` });
    }

    if (!action || !tweetId) {
        return res.status(400).json({ error: 'Les paramètres `action` et `tweetId` sont requis.' });
    }

    // Pour l'instant, on utilise le premier compte par défaut si aucun n'est spécifié
    // À l'avenir, le frontend pourrait permettre de choisir
    const accountToUse = accountId ? accounts.find(a => a.id === accountId) : accounts[0];

    if (!accountToUse) {
        return res.status(404).json({ error: 'Aucun compte X disponible pour effectuer l\'action.' });
    }

    try {
        const client = getRwClientById(accountToUse.id);
        const user = await client.currentUser();
        const userId = user.id_str || user.id;

        switch (action) {
            case 'like':
                // Vérification du tweetId
                if (!tweetId || !/^[0-9]+$/.test(tweetId)) {
                    return res.status(400).json({ error: 'tweetId invalide' });
                }
                if (performedActions[tweetId]?.has(accountToUse.id)) {
                    return res.status(409).json({ error: 'Ce compte a déjà liké ce tweet (vérification interne).' });
                }
                try {
                    await client.v2.like(userId, tweetId);
                    if (!performedActions[tweetId]) performedActions[tweetId] = new Set();
                    performedActions[tweetId].add(accountToUse.id);
                    actionCounts.like++;
                    logToFile(`[ACTION MANUELLE][${accountToUse.username}] Like sur le tweet ${tweetId}`);
                    res.json({ success: true, message: 'Tweet liké avec succès.' });
                } catch (e) {
                    let errorMessage = e.data && e.data.detail ? e.data.detail : (e.message || 'Erreur inconnue');
                    if (errorMessage.includes('already liked')) {
                        errorMessage = 'Vous avez déjà liké ce tweet.';
                        return res.status(409).json({ error: errorMessage });
                    }
                    logToFile(`[ERREUR][${accountToUse.username}] Like sur ${tweetId} : ${errorMessage}`);
                    return res.status(400).json({ error: errorMessage });
                }
                break;
            case 'retweet':
                // Vérification du tweetId
                if (!tweetId || !/^[0-9]+$/.test(tweetId)) {
                    return res.status(400).json({ error: 'tweetId invalide' });
                }
                if (performedActions[tweetId]?.has(accountToUse.id)) {
                    return res.status(409).json({ error: 'Ce compte a déjà retweeté ce tweet (vérification interne).' });
                }
                try {
                    await client.v2.retweet(userId, tweetId);
                    if (!performedActions[tweetId]) performedActions[tweetId] = new Set();
                    performedActions[tweetId].add(accountToUse.id);
                    actionCounts.retweet++;
                    logToFile(`[ACTION MANUELLE][${accountToUse.username}] Retweet sur le tweet ${tweetId}`);
                    res.json({ success: true, message: 'Tweet retweeté avec succès.' });
                } catch (e) {
                    let errorMessage = e.data && e.data.detail ? e.data.detail : (e.message || 'Erreur inconnue');
                    if (errorMessage.includes('already retweeted')) {
                        errorMessage = 'Vous avez déjà retweeté ce tweet.';
                        return res.status(409).json({ error: errorMessage });
                    }
                    logToFile(`[ERREUR][${accountToUse.username}] Retweet sur ${tweetId} : ${errorMessage}`);
                    return res.status(400).json({ error: errorMessage });
                }
                break;
            case 'comment':
                if (!commentText) {
                    return res.status(400).json({ error: 'Le texte du commentaire est requis.' });
                }
                // Vérification du tweetId
                if (!tweetId || !/^[0-9]+$/.test(tweetId)) {
                    return res.status(400).json({ error: 'tweetId invalide' });
                }
                try {
                    await client.v2.reply(commentText, tweetId);
                    actionCounts.comment++;
                    logToFile(`[ACTION MANUELLE][${accountToUse.username}] Commentaire sur le tweet ${tweetId}: ${commentText}`);
                    res.json({ success: true, message: 'Commentaire publié avec succès.' });
                } catch (e) {
                    let errorMessage = e.data && e.data.detail ? e.data.detail : (e.message || 'Erreur inconnue');
                    logToFile(`[ERREUR][${accountToUse.username}] Commentaire sur ${tweetId} : ${errorMessage}`);
                    return res.status(400).json({ error: errorMessage });
                }
                break;
            default:
                res.status(400).json({ error: `Action '${action}' non reconnue.` });
        }
    } catch (e) {
        let errorMessage = `Échec de l'action '${action}'.`;
        let statusCode = 500;

        // twitter-api-v2 encapsule les erreurs API dans e.data
        if (e.data && e.data.detail) {
            errorMessage = e.data.detail;
            if (errorMessage.includes('You have already liked this Tweet')) {
                errorMessage = 'Vous avez déjà liké ce tweet.';
                statusCode = 409; // Conflict
            } else if (errorMessage.includes('You have already retweeted this Tweet')) {
                errorMessage = 'Vous avez déjà retweeté ce tweet.';
                statusCode = 409; // Conflict
            }
        } else if (e.message) {
            errorMessage = e.message;
        }

        logToFile(`[ERREUR ACTION][${accountToUse.username}] Échec de l'action '${action}' sur ${tweetId}: ${errorMessage}`);
        res.status(statusCode).json({ error: errorMessage, details: e.data || e.message });
    }
});

// --- Fin gestion multi-comptes ---

// --- Flow OAuth 1.0a automatique pour ajout de comptes X ---
const OAUTH_CALLBACK_URL = process.env.OAUTH_CALLBACK_URL || 'http://localhost:3005/api/oauth/callback';
const pendingOAuthTokens = {};

// 1. Initier le flow OAuth : obtenir le request token et rediriger vers X
app.get('/api/oauth/init', async (req, res) => {
    try {
        const client = new TwitterApi({
            appKey: process.env.X_API_KEY,
            appSecret: process.env.X_API_SECRET
        });
        const { url, oauth_token, oauth_token_secret } = await client.generateAuthLink(OAUTH_CALLBACK_URL, { linkMode: 'authorize' });
        // Stocke le secret temporairement (clé = oauth_token)
        pendingOAuthTokens[oauth_token] = oauth_token_secret;
        // Redirige le navigateur vers l'URL d'auth X
        res.json({ url });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Callback après autorisation X
app.get('/api/oauth/callback', async (req, res) => {
    const { oauth_token, oauth_verifier } = req.query;
    const oauth_token_secret = pendingOAuthTokens[oauth_token];
    if (!oauth_token || !oauth_verifier || !oauth_token_secret) {
        return res.status(400).send('Paramètres OAuth manquants ou session expirée');
    }
    try {
        const client = new TwitterApi({
            appKey: process.env.X_API_KEY,
            appSecret: process.env.X_API_SECRET,
            accessToken: oauth_token,
            accessSecret: oauth_token_secret
        });
        // Échange le request token contre un access token utilisateur
        const {
            accessToken,
            accessSecret,
            screenName,
            userId
        } = await client.login(oauth_verifier);
        // Ajoute le compte à la liste
        const account = {
            id: String(accountCounter++),
            username: screenName,
            userId,
            tokens: {
                apiKey: process.env.X_API_KEY,
                apiSecret: process.env.X_API_SECRET,
                accessToken,
                accessSecret
            }
        };
        accounts.push(account);
        delete pendingOAuthTokens[oauth_token];
        // Redirige vers le frontend avec succès
        res.send('<script>window.opener && window.opener.loadAccounts && window.opener.loadAccounts(); window.close();</script>Connexion réussie, vous pouvez fermer cette fenêtre.');
    } catch (error) {
        res.status(500).send('Erreur OAuth X : ' + error.message);
    }
});
// --- Fin flow OAuth ---

// Configuration du client Twitter par défaut (pour compatibilité)
const twitterClient = new TwitterApi({
  appKey: process.env.X_API_KEY,
  appSecret: process.env.X_API_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
});
const rwClient = twitterClient.readWrite;


// Route de test
// Permet de vérifier que l'API est accessible
app.get('/api/test', (req, res) => {
    res.json({ message: 'API X-AutoPost est en ligne !' });
});

// Route pour obtenir les informations du compte sélectionné (GET /api/account?accountId=...)
app.get('/api/account', async (req, res) => {
    try {
        const { accountId } = req.query;
        let client = rwClient;
        if (accountId) {
            client = getRwClientById(accountId);
        }
        const me = await client.currentUser();
        res.json({
            id: me.id_str || me.id,
            name: me.name,
            username: me.screen_name || me.username
        });
    } catch (error) {
        res.status(400).json({ error: error.data || error.message });
    }
});

// Route pour supprimer un compte X (DELETE /api/account?accountId=...)
app.delete('/api/account', (req, res) => {
    const { accountId } = req.query;
    if (!accountId) return res.status(400).json({ error: 'accountId requis' });
    const idx = accounts.findIndex(acc => acc.id === accountId);
    if (idx === -1) return res.status(404).json({ error: 'Compte non trouvé' });
    accounts.splice(idx, 1);
    res.json({ success: true });
});

// Route pour poster un tweet
// Utilise twitter-api-v2 pour publier un nouveau tweet
app.post('/api/post', async (req, res) => {
    try {
        const { text, accountId } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'Le texte du tweet est requis' });
        }
        let client = rwClient;
        if (accountId) {
            try { client = getRwClientById(accountId); } catch (e) { return res.status(400).json({ error: e.message }); }
        }
        const tweet = await client.v2.tweet(text);
        res.json(tweet);
    } catch (error) {
        res.status(400).json({ error: error.data || error.message });
    }
});

// Route pour répondre à un tweet
// Utilise twitter-api-v2 pour publier une réponse à un tweet existant
app.post('/api/reply', async (req, res) => {
    try {
        const { text, replyTo, accountId } = req.body;
        if (!text || !replyTo) {
            return res.status(400).json({ error: 'Le texte du tweet et l\'ID du tweet à répondre sont requis' });
        }
        let client = rwClient;
        if (accountId) {
            try { client = getRwClientById(accountId); } catch (e) { return res.status(400).json({ error: e.message }); }
        }
        const tweet = await client.v2.tweet({
            text,
            reply: { in_reply_to_tweet_id: replyTo }
        });
        res.json(tweet);
    } catch (error) {
        res.status(400).json({ error: error.data || error.message });
    }
});

// Route pour liker un tweet avec TOUS les comptes X connectés
// POST /api/like-multi { tweetId }
app.post('/api/like-multi', async (req, res) => {
    const { tweetId } = req.body;
    if (!tweetId) return res.status(400).json({ error: 'tweetId requis' });
    const results = [];
    for (const acc of accounts) {
        try {
            const client = getRwClientById(acc.id);
            const user = await client.currentUser();
            await client.v2.like(user.id_str || user.id, tweetId);
            results.push({ accountId: acc.id, username: acc.username, success: true });
        } catch (e) {
            results.push({ accountId: acc.id, username: acc.username, success: false, error: e.data || e.message });
        }
    }
    res.json({ results });
});

// Route pour retweeter un tweet avec TOUS les comptes X connectés
// POST /api/retweet-multi { tweetId }
app.post('/api/retweet-multi', async (req, res) => {
    const { tweetId } = req.body;
    if (!tweetId) return res.status(400).json({ error: 'tweetId requis' });
    const results = [];
    for (const acc of accounts) {
        try {
            const client = getRwClientById(acc.id);
            const user = await client.currentUser();
            const rtRes = await client.v2.retweet(user.id_str || user.id, tweetId);
            // MAJ du quota si possible
            if (rtRes && rtRes.rateLimit) {
                rateLimitState[acc.id] = {
                    ...rateLimitState[acc.id],
                    limit: rtRes.rateLimit.limit,
                    remaining: rtRes.rateLimit.remaining,
                    reset: rtRes.rateLimit.reset
                };
            }
            if (rtRes && rtRes.headers) {
                rateLimitState[acc.id] = {
                    ...rateLimitState[acc.id],
                    dailyLimit: parseInt(rtRes.headers['x-user-limit-24hour-limit']) || null,
                    dailyRemaining: parseInt(rtRes.headers['x-user-limit-24hour-remaining']) || null,
                    dailyReset: parseInt(rtRes.headers['x-user-limit-24hour-reset']) || null,
                    dailyBlocked: parseInt(rtRes.headers['x-user-limit-24hour-remaining']) === 0
                };
            }
            results.push({ accountId: acc.id, username: acc.username, success: true });
        } catch (e) {
            // MAJ du quota si possible même en cas d'erreur
            if (e && e.rateLimit) {
                rateLimitState[acc.id] = {
                    ...rateLimitState[acc.id],
                    limit: e.rateLimit.limit,
                    remaining: e.rateLimit.remaining,
                    reset: e.rateLimit.reset
                };
            }
            if (e && e.headers) {
                rateLimitState[acc.id] = {
                    ...rateLimitState[acc.id],
                    dailyLimit: parseInt(e.headers['x-user-limit-24hour-limit']) || null,
                    dailyRemaining: parseInt(e.headers['x-user-limit-24hour-remaining']) || null,
                    dailyReset: parseInt(e.headers['x-user-limit-24hour-reset']) || null,
                    dailyBlocked: parseInt(e.headers['x-user-limit-24hour-remaining']) === 0
                };
            }
            results.push({ accountId: acc.id, username: acc.username, success: false, error: e.data || e.message });
        }
    }
    res.json({ results });
});

// Route pour répondre à un tweet avec TOUS les comptes X connectés en respectant le rate limit
// POST /api/reply-multi { tweetId, text }
app.post('/api/reply-multi', async (req, res) => {
    const { tweetId, text } = req.body;
    if (!tweetId || !text) return res.status(400).json({ error: 'tweetId et text requis' });

    const RATE_LIMIT = 450;
    const WINDOW_MS = 15 * 60 * 1000;
    let results = [];
    let batchCount = 0;

    for (let i = 0; i < accounts.length; i += RATE_LIMIT) {
        const batch = accounts.slice(i, i + RATE_LIMIT);
        for (const acc of batch) {
            try {
                const client = getRwClientById(acc.id);
                const tweet = await client.v2.tweet({ text, reply: { in_reply_to_tweet_id: tweetId } });
                // MAJ du quota si possible
                if (tweet && tweet.rateLimit) {
                    rateLimitState[acc.id] = {
                        ...rateLimitState[acc.id],
                        limit: tweet.rateLimit.limit,
                        remaining: tweet.rateLimit.remaining,
                        reset: tweet.rateLimit.reset
                    };
                }
                if (tweet && tweet.headers) {
                    rateLimitState[acc.id] = {
                        ...rateLimitState[acc.id],
                        dailyLimit: parseInt(tweet.headers['x-user-limit-24hour-limit']) || null,
                        dailyRemaining: parseInt(tweet.headers['x-user-limit-24hour-remaining']) || null,
                        dailyReset: parseInt(tweet.headers['x-user-limit-24hour-reset']) || null,
                        dailyBlocked: parseInt(tweet.headers['x-user-limit-24hour-remaining']) === 0
                    };
                }
                results.push({ accountId: acc.id, username: acc.username, success: true, tweet });
            } catch (e) {
                // MAJ du quota si possible même en cas d'erreur
                if (e && e.rateLimit) {
                    rateLimitState[acc.id] = {
                        ...rateLimitState[acc.id],
                        limit: e.rateLimit.limit,
                        remaining: e.rateLimit.remaining,
                        reset: e.rateLimit.reset
                    };
                }
                if (e && e.headers) {
                    rateLimitState[acc.id] = {
                        ...rateLimitState[acc.id],
                        dailyLimit: parseInt(e.headers['x-user-limit-24hour-limit']) || null,
                        dailyRemaining: parseInt(e.headers['x-user-limit-24hour-remaining']) || null,
                        dailyReset: parseInt(e.headers['x-user-limit-24hour-reset']) || null,
                        dailyBlocked: parseInt(e.headers['x-user-limit-24hour-remaining']) === 0
                    };
                }
                results.push({ accountId: acc.id, username: acc.username, success: false, error: e.data || e.message });
            }
        }
        batchCount++;
        if (i + RATE_LIMIT < accounts.length) {
            console.log(`Batch ${batchCount} terminé, attente de 15 minutes pour respecter la limite API...`);
            await new Promise(resolve => setTimeout(resolve, WINDOW_MS));
        }
    }
    res.json({ results });
});

// Route pour liker un tweet avec TOUS les comptes X connectés en respectant le rate limit
// POST /api/like { tweetId }
app.post('/api/like', async (req, res) => {
    const { tweetId } = req.body;
    if (!tweetId) return res.status(400).json({ error: 'tweetId requis' });

    const RATE_LIMIT = 450;
    const WINDOW_MS = 15 * 60 * 1000;
    let results = [];
    let batchCount = 0;

    for (let i = 0; i < accounts.length; i += RATE_LIMIT) {
        const batch = accounts.slice(i, i + RATE_LIMIT);
        for (const acc of batch) {
            try {
                const client = getRwClientById(acc.id);
                const user = await client.currentUser();
                const likeRes = await client.v2.like(user.id_str || user.id, tweetId);
                // MAJ du quota si possible
                if (likeRes && likeRes.rateLimit) {
                    rateLimitState[acc.id] = {
                        ...rateLimitState[acc.id],
                        limit: likeRes.rateLimit.limit,
                        remaining: likeRes.rateLimit.remaining,
                        reset: likeRes.rateLimit.reset
                    };
                }
                if (likeRes && likeRes.headers) {
                    rateLimitState[acc.id] = {
                        ...rateLimitState[acc.id],
                        dailyLimit: parseInt(likeRes.headers['x-user-limit-24hour-limit']) || null,
                        dailyRemaining: parseInt(likeRes.headers['x-user-limit-24hour-remaining']) || null,
                        dailyReset: parseInt(likeRes.headers['x-user-limit-24hour-reset']) || null,
                        dailyBlocked: parseInt(likeRes.headers['x-user-limit-24hour-remaining']) === 0
                    };
                }
                results.push({ accountId: acc.id, username: acc.username, success: true });
            } catch (e) {
                // MAJ du quota si possible même en cas d'erreur
                if (e && e.rateLimit) {
                    rateLimitState[acc.id] = {
                        ...rateLimitState[acc.id],
                        limit: e.rateLimit.limit,
                        remaining: e.rateLimit.remaining,
                        reset: e.rateLimit.reset
                    };
                }
                if (e && e.headers) {
                    rateLimitState[acc.id] = {
                        ...rateLimitState[acc.id],
                        dailyLimit: parseInt(e.headers['x-user-limit-24hour-limit']) || null,
                        dailyRemaining: parseInt(e.headers['x-user-limit-24hour-remaining']) || null,
                        dailyReset: parseInt(e.headers['x-user-limit-24hour-reset']) || null,
                        dailyBlocked: parseInt(e.headers['x-user-limit-24hour-remaining']) === 0
                    };
                }
                results.push({ accountId: acc.id, username: acc.username, success: false, error: e.data || e.message });
            }
        }
        batchCount++;
        if (i + RATE_LIMIT < accounts.length) {
            console.log(`Batch ${batchCount} terminé, attente de 15 minutes pour respecter la limite API...`);
            await new Promise(resolve => setTimeout(resolve, WINDOW_MS));
        }
    }
    res.json({ results });
});

// Route pour retweeter un tweet
// POST /api/retweet { tweetId }
app.post('/api/retweet', async (req, res) => {
    try {
        const { tweetId, accountId } = req.body;
        if (!tweetId) {
            return res.status(400).json({ error: "tweetId requis" });
        }
        let client = rwClient;
        if (accountId) {
            try { client = getRwClientById(accountId); } catch (e) { return res.status(400).json({ error: e.message }); }
        }
        const user = await client.currentUser();
        await client.v2.retweet(user.id_str || user.id, tweetId);
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.data || error.message });
    }
});

// Route pour rechercher des tweets publics contenant des mots-clés (général, pas limité à un utilisateur)
// GET /api/search-tweets?keywords=mot1,mot2&count=50&accountId=...
app.get('/api/search-tweets', async (req, res) => {
    try {
        const { keywords = '', count = 20, accountId } = req.query;
        if (!keywords) return res.status(400).json({ error: 'keywords requis' });
        // Authentification :
        let rwClient;
        if (accountId) {
            rwClient = getRwClientById(accountId);
        } else {
            // Utilisation du Bearer Token public (read-only, pas besoin de compte connecté)
            if (!process.env.X_BEARER_TOKEN) {
                console.error('Erreur : X_BEARER_TOKEN absent du .env');
                return res.status(500).json({ error: 'Le Bearer Token X n\'est pas configuré côté serveur (.env)' });
            }
            const twitterClient = new TwitterApi(process.env.X_BEARER_TOKEN);
            rwClient = twitterClient.readOnly;
        }
        // Génère une requête de recherche précise (chaque mot-clé entre guillemets, sans altérer les caractères spéciaux)
        const kws = keywords.split(',').map(k => k.trim()).filter(Boolean);
        // Pour chaque mot-clé, on le met entre guillemets pour forcer la correspondance exacte
        // On échappe les guillemets internes éventuels
        const query = kws.map(k => `"${k.replace(/\"/g, '')}"`).join(' OR ');
        const tweets = await rwClient.v2.search(query, { max_results: Math.min(Number(count), 100), 'tweet.fields': 'created_at,author_id' });
        res.json({
            query,
            tweets: tweets.data?.data || []
        });
    } catch (error) {
        res.status(400).json({ error: error.data || error.message });
    }
});

// Route pour récupérer les 5 derniers tweets d'un utilisateur (GET /api/user-tweets?username=...&accountId=...)
app.get('/api/user-tweets', async (req, res) => {
    try {
        const { username, accountId } = req.query;
        if (!username) return res.status(400).json({ error: "username requis" });
        let rwClient;
        if (accountId) {
            rwClient = getRwClientById(accountId);
        } else if (accounts.length > 0) {
            rwClient = getRwClientById(accounts[0].id);
        } else {
            return res.status(400).json({ error: "Aucun compte X connecté" });
        }
        // Récupérer l'ID utilisateur à partir du username
        const user = await rwClient.v2.userByUsername(username.replace(/^@/, ''));
        if (!user?.data?.id) {
            return res.status(404).json({ error: "Utilisateur non trouvé" });
        }
        // Récupérer les 5 derniers tweets
        const tweets = await rwClient.v2.userTimeline(user.data.id, { max_results: 5, exclude: ['replies','retweets'] });
        res.json({
            user: user.data,
            tweets: tweets.data?.data || []
        });
    } catch (error) {
        res.status(400).json({ error: error.data || error.message });
    }
});

// Démarrage du serveur
// Le serveur écoute sur le port configuré
// Route pour exposer le dernier quota trouvé dans les logs pour chaque compte
app.get('/api/rate-limit-from-logs', (req, res) => {
    try {
        const logPath = __dirname + '/auto-actions.log';
        const quotas = extractRateLimitsFromLogs(logPath);
        res.json({ accounts: Object.values(quotas) });
    } catch (e) {
        res.status(500).json({ error: 'Erreur lors de la lecture des logs', details: e.message });
    }
});

// Route pour exposer l'état du rate limit de chaque compte
app.get('/api/rate-limit-status', (req, res) => {
    try {
        const now = Math.floor(Date.now() / 1000);
        const status = (accounts || []).map(acc => {
            const rl = (rateLimitState && rateLimitState[acc.id]) ? rateLimitState[acc.id] : {};
            return {
                username: acc.username,
                limit: rl.limit ?? null,
                remaining: rl.remaining ?? null,
                reset: rl.reset ?? null,
                secondsToReset: rl.reset ? Math.max(0, rl.reset - now) : null,
                dailyLimit: rl.dailyLimit ?? null,
                dailyRemaining: rl.dailyRemaining ?? null,
                dailyReset: rl.dailyReset ?? null,
                secondsToDailyReset: rl.dailyReset ? Math.max(0, rl.dailyReset - now) : null,
                dailyBlocked: rl.dailyBlocked ?? false
            };
        });
        console.log('[API rate-limit-status] status:', status);
        res.json({ accounts: status });
    } catch (e) {
        console.error('[API rate-limit-status] ERREUR :', e);
        res.status(500).json({ error: 'Erreur interne lors de la récupération du rate limit', details: e.message });
    }
});

// API pour récupérer les tweets trouvés par l'automatisation
app.get('/api/found-tweets', (req, res) => {
    res.json(foundTweets);
});

app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
});

// Note: Pour utiliser cette application, vous devez créer un fichier .env avec la variable X_BEARER_TOKEN
// Le fichier .env.example fourni montre la structure nécessaire.
