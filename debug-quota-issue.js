const fs = require('fs');
const path = require('path');

/**
 * SCRIPT DE DEBUG - PROBLÈME QUOTA REACHED
 * Analyse détaillée du problème de quota qui bloque l'automation
 */

// Charger directement le module sans require pour éviter les problèmes de dépendances
const sharedQuotaManager = require('./services/shared-quota-manager');

console.log('=== DEBUG QUOTA ISSUE ===\n');

// 1. Charger les comptes OAuth2
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

// 2. Analyser les stats de quotas
console.log('2. STATS QUOTAS SHARED-QUOTA-MANAGER:');
try {
    const stats = sharedQuotaManager.getSharedQuotaStats();
    console.log(`   - Comptes actifs: ${stats.activeAccounts.length}`);
    console.log(`   - Quota global restant: ${stats.globalPack.remainingActions}/${stats.globalPack.totalActions}`);
    console.log(`   - Quota quotidien restant: ${stats.dailyQuotas.dailyLimit - stats.dailyQuotas.usedToday}/${stats.dailyQuotas.dailyLimit}`);
    console.log(`   - Allocation par compte: ${stats.allocation.perAccountDaily} actions/jour\n`);
    
    console.log('3. DÉTAIL PAR COMPTE:');
    stats.activeAccounts.forEach(acc => {
        console.log(`   ${acc.username} (${acc.id}):`);
        console.log(`     - Quota quotidien restant: ${acc.dailyRemaining}`);
        console.log(`     - Actions utilisées aujourd'hui: ${Object.values(acc.dailyUsed).reduce((sum, val) => sum + val, 0)}`);
    });
    console.log('');
    
} catch (error) {
    console.log(`   ERREUR: ${error.message}\n`);
}

// 3. Tester calculateActionsLeftForAccount pour chaque compte
console.log('4. TEST calculateActionsLeftForAccount:');
const enabledActions = ['like', 'retweet', 'reply'];

accounts.forEach(account => {
    try {
        const actionsLeft = sharedQuotaManager.calculateActionsLeftForAccount(account.id);
        console.log(`   ${account.username}:`);
        console.log(`     - Like: ${actionsLeft.like}`);
        console.log(`     - Retweet: ${actionsLeft.retweet}`);
        console.log(`     - Reply: ${actionsLeft.reply}`);
        
        const allQuotasExhausted = enabledActions.every(type => actionsLeft[type] <= 0);
        console.log(`     - Tous quotas épuisés: ${allQuotasExhausted ? 'OUI ❌' : 'NON ✅'}`);
        
    } catch (error) {
        console.log(`     ERREUR: ${error.message}`);
    }
});

// 4. Simuler la logique d'automation.js
console.log('\n5. SIMULATION LOGIQUE AUTOMATION:');
const firstAccount = accounts[0];
if (firstAccount) {
    try {
        const actionsLeft = sharedQuotaManager.calculateActionsLeftForAccount(firstAccount.id);
        const allQuotasExhausted = enabledActions.every(type => actionsLeft[type] <= 0);
        
        console.log(`   Premier compte testé: ${firstAccount.username}`);
        console.log(`   Actions restantes: ${JSON.stringify(actionsLeft)}`);
        console.log(`   Condition allQuotasExhausted: ${allQuotasExhausted}`);
        console.log(`   Résultat: ${allQuotasExhausted ? 'AUTOMATION BLOQUÉE ❌' : 'AUTOMATION AUTORISÉE ✅'}`);
        
    } catch (error) {
        console.log(`   ERREUR: ${error.message}`);
    }
} else {
    console.log('   Aucun compte disponible pour le test');
}

console.log('\n=== FIN DEBUG ===');
