const { getRwClientById } = require('./server');
const rateLimitState = require('./server').rateLimitState;

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

module.exports = { initAllAccountsRateLimit };
