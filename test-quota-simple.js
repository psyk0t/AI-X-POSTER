console.log('=== TEST SIMPLE ===');

// Test basique sans dépendances
const fs = require('fs');

try {
    // Vérifier master-quota-config.json
    const masterData = JSON.parse(fs.readFileSync('master-quota-config.json', 'utf8'));
    console.log('Master quota config chargé:');
    console.log(`- Quota global restant: ${masterData.globalPack.remainingActions}`);
    console.log(`- Quota quotidien restant: ${masterData.dailyQuotas.dailyLimit - masterData.dailyQuotas.usedToday}`);
    console.log(`- Comptes connectés: ${Object.keys(masterData.connectedAccounts).length}`);
    
    // Vérifier chaque compte
    Object.entries(masterData.connectedAccounts).forEach(([id, acc]) => {
        const dailyUsed = Object.values(acc.dailyUsed).reduce((sum, val) => sum + val, 0);
        const dailyRemaining = masterData.allocation.perAccountDaily - dailyUsed;
        console.log(`- ${acc.username}: actif=${acc.isActive}, quotaRestant=${dailyRemaining}`);
    });
    
} catch (error) {
    console.log(`ERREUR: ${error.message}`);
}

console.log('=== FIN TEST ===');
