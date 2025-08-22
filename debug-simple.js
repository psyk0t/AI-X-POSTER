const fs = require('fs');

console.log('=== DEBUG SIMPLE ===');

// Test 1: Vérifier les fichiers
console.log('1. VÉRIFICATION FICHIERS:');
const files = ['oauth2-users.json', 'master-quota-config.json', 'quota-usage.json'];
files.forEach(file => {
    const exists = fs.existsSync(file);
    console.log(`   ${file}: ${exists ? '✅' : '❌'}`);
    if (exists) {
        try {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            console.log(`     Taille: ${JSON.stringify(data).length} caractères`);
        } catch (e) {
            console.log(`     ERREUR PARSING: ${e.message}`);
        }
    }
});

// Test 2: Comptes OAuth2
console.log('\n2. COMPTES OAUTH2:');
try {
    const oauth2Data = JSON.parse(fs.readFileSync('oauth2-users.json', 'utf8'));
    console.log(`   Nombre de comptes: ${oauth2Data.length}`);
    oauth2Data.forEach(([id, userData]) => {
        console.log(`   - ${userData.username} (${id})`);
    });
} catch (e) {
    console.log(`   ERREUR: ${e.message}`);
}

// Test 3: Master quota config
console.log('\n3. MASTER QUOTA CONFIG:');
try {
    const masterData = JSON.parse(fs.readFileSync('master-quota-config.json', 'utf8'));
    console.log(`   Quota global: ${masterData.globalPack.totalActions}`);
    console.log(`   Quota utilisé: ${masterData.globalPack.usedActions}`);
    console.log(`   Quota quotidien: ${masterData.dailyQuotas.dailyLimit}`);
    console.log(`   Utilisé aujourd'hui: ${masterData.dailyQuotas.usedToday}`);
    console.log(`   Comptes connectés: ${Object.keys(masterData.connectedAccounts).length}`);
    
    Object.entries(masterData.connectedAccounts).forEach(([id, acc]) => {
        console.log(`   - ${acc.username}: actif=${acc.isActive}, actions=${acc.actionsUsed}`);
    });
} catch (e) {
    console.log(`   ERREUR: ${e.message}`);
}

console.log('\n=== FIN DEBUG ===');
