# 🔧 RAPPORT TECHNIQUE DÉTAILLÉ - GESTION DES ACTIONS TWITTER

## 📋 ARCHITECTURE DU SYSTÈME

### Structure des actions
```javascript
action = {
    type: 'like|retweet|reply',
    tweetId: '1234567890',
    acc: { id, username, authMethod },
    tweet: { text, author_id, created_at },
    pseudo: 'target_username'
}
```

---

## ⚡ RYTHME D'EXÉCUTION DÉTAILLÉ

### Délais par action (Phase 2 optimisée)
| Action | Délai min | Délai max | Justification |
|--------|-----------|-----------|---------------|
| **LIKE** | 10s | 20s | Action simple, API rapide |
| **RETWEET** | 15s | 30s | Action modérée |
| **REPLY** | 45s | 90s | Génération IA + validation + envoi |
| **Entre comptes** | 5s | 10s | Éviter patterns de détection |
| **Entre batches** | 2s | 4s | Recherche API Twitter |

### Calcul des délais
```javascript
// Fonction randomDelay() optimisée
const delayMs = Math.floor(Math.random() * (max - min + 1) + min) * 1000;
// Exemple: like → 10-20s aléatoire
```

---

## 🎯 PROBABILITÉS ET GÉNÉRATION D'ACTIONS

### Logique de génération (determineActionsForTweet)
```javascript
const actions = [];

// REPLY: 100% de chance si quota disponible
if (canPerformSharedAction(accountId, 'reply').allowed) {
    actions.push('reply');
}

// LIKE: 50% de chance si quota disponible  
if (Math.random() < 0.5 && canPerformSharedAction(accountId, 'like').allowed) {
    actions.push('like');
}

// RETWEET: 10% de chance si quota disponible
if (Math.random() < 0.1 && canPerformSharedAction(accountId, 'retweet').allowed) {
    actions.push('retweet');
}
```

### Ordre d'exécution optimisé
1. **LIKE** → Action rapide (10-20s)
2. **RETWEET** → Action modérée (15-30s)  
3. **REPLY** → Action complexe (45-90s)

---

## 📊 SYSTÈME DE QUOTAS UNIFIÉ

### Architecture shared-quota-manager.js
```javascript
sharedQuotaData = {
    globalPack: {
        totalActions: 1500,      // Pack quotidien
        usedActions: 245,        // Consommées
        remainingActions: 1255,  // Restantes
        resetTime: "2025-01-20T00:00:00.000Z"
    },
    activeAccounts: [
        {
            id: "account_123",
            username: "user1", 
            dailyUsed: { like: 45, retweet: 12, reply: 8 },
            allocation: { like: 200, retweet: 100, reply: 100 }
        }
    ]
}
```

### Vérification avant action
```javascript
// 1. Vérifier quota global
if (globalPack.remainingActions <= 0) return { allowed: false, reason: 'Pack global épuisé' };

// 2. Vérifier quota compte
const accountQuota = account.allocation[actionType];
const accountUsed = account.dailyUsed[actionType] || 0;
if (accountUsed >= accountQuota) return { allowed: false, reason: 'Quota compte épuisé' };

// 3. Action autorisée
return { allowed: true };
```

---

## 🚫 GESTION AVANCÉE DES ERREURS

### Erreurs 429 (Rate Limit) - Backoff exponentiel
```javascript
const BACKOFF_DELAYS = [
    15 * 60 * 1000,    // 15 minutes
    30 * 60 * 1000,    // 30 minutes  
    60 * 60 * 1000,    // 1 heure
    2 * 60 * 60 * 1000, // 2 heures
    4 * 60 * 60 * 1000  // 4 heures (max)
];

function handleRateLimitError(accountId, username, actionType, mutedAccounts) {
    const attempts = rateLimitAttempts.get(accountId) || 0;
    const delayIndex = Math.min(attempts, BACKOFF_DELAYS.length - 1);
    const muteUntil = Date.now() + BACKOFF_DELAYS[delayIndex];
    
    mutedAccounts.set(accountId, muteUntil);
    rateLimitAttempts.set(accountId, attempts + 1);
}
```

### Erreurs 403 (Forbidden)
```javascript
function handleAuthorizationError(accountId, username, actionType, mutedAccounts) {
    // Pause immédiate de 1 heure
    const muteUntil = Date.now() + (60 * 60 * 1000);
    mutedAccounts.set(accountId, muteUntil);
    
    // Tentative refresh token OAuth2
    if (authMethod === 'oauth2') {
        attemptTokenRefresh(accountId);
    }
}
```

### Erreurs 400 (Bad Request)
```javascript
// Tweet invalide/supprimé → Blacklist immédiate
if (errorCode === 400) {
    markActionAsPerformed(tweetId, accountId, 'like');
    markActionAsPerformed(tweetId, accountId, 'retweet'); 
    markActionAsPerformed(tweetId, accountId, 'reply');
    logToFile(`[BLACKLIST] Tweet ${tweetId} blacklisté (erreur 400)`);
}
```

---

## 🔄 CYCLE D'EXÉCUTION COMPLET

### 1. Phase de recherche
```javascript
// Recherche par batches de 15 pseudos max
for (let i = 0; i < allPseudos.length; i += MAX_FROM_PER_QUERY) {
    const batch = allPseudos.slice(i, i + MAX_FROM_PER_QUERY);
    const fromQuery = batch.map(p => `from:${p}`).join(' OR ');
    
    // API Twitter v2 search
    const searchResult = await client.v2.search(fromQuery, {
        max_results: 100,
        'tweet.fields': 'created_at,author_id,text',
        'user.fields': 'username'
    });
    
    // Délai entre batches
    if (i + MAX_FROM_PER_QUERY < allPseudos.length) {
        await randomDelay('betweenBatches'); // 2-4s
    }
}
```

### 2. Filtrage et validation
```javascript
// Filtres appliqués
const validTweets = allTweets.filter(tweet => {
    // 1. Tweet récent (<24h)
    const tweetAge = (now - new Date(tweet.created_at).getTime()) / (1000 * 60 * 60);
    if (tweetAge > maxAgeHours) return false;
    
    // 2. Tweet original (pas de RT)
    if (tweet.text.startsWith('RT @')) return false;
    
    // 3. Pas déjà traité
    if (processedTweetIds.has(tweet.id)) return false;
    
    return true;
});
```

### 3. Génération d'actions
```javascript
const actions = [];
for (const tweet of validTweets) {
    for (const account of connectedAccounts) {
        const tweetActions = determineActionsForTweet(account.id, tweet.id);
        
        for (const actionType of tweetActions.actions) {
            actions.push({
                type: actionType,
                tweetId: tweet.id,
                acc: account,
                tweet: tweet,
                pseudo: tweet.username
            });
        }
    }
}
```

### 4. Exécution séquentielle
```javascript
for (const action of actions) {
    // Vérifier compte non muté
    if (mutedAccounts.has(accId) && mutedAccounts.get(accId) > Date.now()) {
        continue;
    }
    
    // Exécuter action
    try {
        await executeAction(action);
        consumeSharedAction(accId, action.type);
    } catch (error) {
        handleActionError(error, action);
    }
    
    // Délai optimisé
    await randomDelay(action.type);
}
```

---

## 📈 MONITORING ET MÉTRIQUES

### Logs enrichis par action
```javascript
const enrichedLogData = {
    type: 'like',
    level: 'info',
    account: 'username',
    accountId: 'acc_123',
    tweetId: '1234567890',
    tweetUrl: 'https://twitter.com/i/status/1234567890',
    targetUser: '@target',
    message: 'Like sur le tweet de @target',
    tweetText: 'Contenu du tweet...',
    metadata: {
        actionTime: '2025-01-19T22:00:00.000Z',
        quotaUsed: 45,
        quotaLimit: 200,
        quotaRemaining: 155,
        globalQuotaUsed: 245,
        globalQuotaTotal: 1500
    }
};
```

### Heartbeat système
```javascript
// Toutes les 30 secondes pendant l'exécution
setInterval(() => {
    if (scanActive) {
        const stats = getSharedQuotaStats();
        logToFile(`[HEARTBEAT] Scan actif - ${stats.globalPack.usedActions}/${stats.globalPack.totalActions} actions utilisées`);
    }
}, 30000);
```

---

## ⚙️ PARAMÈTRES DE CONFIGURATION

### Limites système
```javascript
const CONFIG = {
    MAX_FROM_PER_QUERY: 15,        // Pseudos par batch de recherche
    MAX_RESULTS_PER_SEARCH: 100,   // Tweets max par recherche
    MAX_AGE_HOURS: 24,             // Âge max des tweets
    HEARTBEAT_INTERVAL: 30000,     // Heartbeat toutes les 30s
    MAX_PARALLEL_ACCOUNTS: 3       // Comptes parallèles (désactivé)
};
```

### Quotas configurables
```javascript
const DEFAULT_QUOTAS = {
    GLOBAL_DAILY_PACK: 1500,       // Pack global quotidien
    DEFAULT_PER_ACCOUNT: 150,      // Par compte si non spécifié
    ACTION_DISTRIBUTION: {         // Répartition par type
        like: 0.5,      // 50%
        retweet: 0.25,  // 25% 
        reply: 0.25     // 25%
    }
};
```

---

## 🚀 PERFORMANCE ET OPTIMISATIONS

### Améliorations Phase 2
- **Délais réduits** : Like 10-20s (vs 30-60s avant)
- **Architecture unifiée** : Un seul gestionnaire de quotas
- **Gestion d'erreurs robuste** : Backoff exponentiel
- **Logs enrichis** : Métriques détaillées

### Capacité théorique
- **1500 actions/jour** réparties sur tous les comptes
- **1 action toutes les 10-90s** selon le type
- **~60-150 actions/heure** en pic d'activité
- **Gestion automatique** des pauses et reprises

### Stabilité
- **Résistance aux rate limits** avec backoff adaptatif
- **Récupération automatique** après erreurs temporaires
- **Monitoring continu** avec heartbeat et logs
- **Reset quotidien** automatique à minuit UTC
