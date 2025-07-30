const fs = require('fs');
const path = require('path');

// Fonction utilitaire pour parser les logs et extraire les quotas par compte
function extractRateLimitsFromLogs(logPath) {
    if (!fs.existsSync(logPath)) return {};
    const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).reverse();
    const quotas = {};
    for (const line of lines) {
        // Cherche une ligne d'erreur avec JSON (erreur 429 ou autre)
        const match = line.match(/Surveillance @([\w_]+) : (\{.+\})/);
        if (match) {
            const username = match[1];
            try {
                const obj = JSON.parse(match[2]);
                // On ne prend que la première occurrence la plus récente pour chaque compte
                if (!quotas[username]) {
                    quotas[username] = {
                        username,
                        limit: obj.rateLimit?.limit ?? null,
                        remaining: obj.rateLimit?.remaining ?? null,
                        reset: obj.rateLimit?.reset ?? null,
                        dailyLimit: obj.headers?.['x-user-limit-24hour-limit'] ? parseInt(obj.headers['x-user-limit-24hour-limit']) : null,
                        dailyRemaining: obj.headers?.['x-user-limit-24hour-remaining'] ? parseInt(obj.headers['x-user-limit-24hour-remaining']) : null,
                        dailyReset: obj.headers?.['x-user-limit-24hour-reset'] ? parseInt(obj.headers['x-user-limit-24hour-reset']) : null,
                        dailyBlocked: obj.headers?.['x-user-limit-24hour-remaining'] == '0',
                        code: obj.code,
                        status: obj.error?.title || obj.error?.detail || obj.code || null,
                        logTimestamp: line.substring(1, 25)
                    };
                }
            } catch (e) { /* ignore parse error */ }
        }
    }
    return quotas;
}

module.exports = { extractRateLimitsFromLogs };
