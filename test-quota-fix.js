const fs = require('fs');
const path = require('path');

/**
 * TEST DE LA CORRECTION DU PROBLÈME QUOTA
 * Vérifie que la logique unifiée fonctionne correctement
 */

console.log('=== TEST CORRECTION QUOTA ===\n');

// 1. Charger le master quota manager
const { getMasterQuotaManager } = require('./services/master-quota-manager');
const masterQuota = getMasterQuotaManager();

// 2. Charger les comptes OAuth2
const oauth2File = path.join(__dirname, 'oauth2-users.json');
let accounts = [];
if (fs.existsSync(oauth2File)) {
    const oauth2Data = JSON.parse(fs.readFileSync(oauth2File, 'utf8'));
    accounts = oauth2Data.map(([id, userData]) => ({
        id,
        username: userData.username
    }));
}

console.log('1. COMPTES CONNECTÉS:');
accounts.forEach(acc => {
    console.log(`   - ${acc.username} (${acc.id})`);
});
console.log(`   Total: ${accounts.length} comptes\n`);

// 3. Tester canPerformAction pour chaque compte
console.log('2. TEST canPerformAction (MASTER-QUOTA-MANAGER):');
let hasAvailableQuota = false;

accounts.forEach(account => {
    try {
        const quotaCheck = masterQuota.canPerformAction(account.id);
        console.log(`   ${account.username}:`);
        console.log(`     - Autorisé: ${quotaCheck.allowed ? '✅' : '❌'}`);
        console.log(`     - Raison: ${quotaCheck.reason}`);
        console.log(`     - Quota quotidien restant: ${quotaCheck.dailyRemaining}`);
        console.log(`     - Quota global restant: ${quotaCheck.globalRemaining}`);
        
        if (quotaCheck.allowed && quotaCheck.dailyRemaining > 0) {
            hasAvailableQuota = true;
        }
        
    } catch (error) {
        console.log(`     ERREUR: ${error.message}`);
    }
});

console.log(`\n3. RÉSULTAT LOGIQUE AUTOMATION:`);
console.log(`   hasAvailableQuota: ${hasAvailableQuota}`);
console.log(`   Automation ${hasAvailableQuota ? 'AUTORISÉE ✅' : 'BLOQUÉE ❌'}`);

// 4. Tester determineActionsForTweet
console.log(`\n4. TEST determineActionsForTweet:`);
const testTweetId = '1234567890';

accounts.forEach(account => {
    try {
        const actionDecision = masterQuota.determineActionsForTweet(account.id, testTweetId);
        console.log(`   ${account.username}:`);
        console.log(`     - Actions: [${actionDecision.actions.join(', ')}]`);
        console.log(`     - Raison: ${actionDecision.reason}`);
        
    } catch (error) {
        console.log(`     ERREUR: ${error.message}`);
    }
});

console.log('\n=== FIN TEST ===');
