// Test script autonome - pas besoin d'imports

/**
 * Test script pour vérifier le système de démutage automatique
 */

// Simuler la fonction cleanExpiredMutedAccounts
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
        console.log(`[UNMUTE] Account ${accountId} automatically unmuted (pause expired)`);
    });
    
    if (expiredAccounts.length > 0) {
        console.log(`[CLEANUP] Removed ${expiredAccounts.length} expired muted accounts from memory`);
    }
    
    return expiredAccounts.length;
}

// Test du système
console.log('=== Test du système de démutage automatique ===\n');

// Créer une Map de test avec des comptes mutés
const testMutedAccounts = new Map();
const now = Date.now();

// Ajouter des comptes avec différents statuts
testMutedAccounts.set('account1', now - 5 * 60 * 1000); // Expiré il y a 5 minutes
testMutedAccounts.set('account2', now + 10 * 60 * 1000); // Expire dans 10 minutes
testMutedAccounts.set('account3', now - 1 * 60 * 1000); // Expiré il y a 1 minute
testMutedAccounts.set('account4', now + 5 * 60 * 1000); // Expire dans 5 minutes

console.log('État initial des comptes mutés:');
testMutedAccounts.forEach((muteUntil, accountId) => {
    const timeLeft = muteUntil - now;
    const status = timeLeft > 0 ? `expire dans ${Math.round(timeLeft / 60000)}min` : `expiré il y a ${Math.round(-timeLeft / 60000)}min`;
    console.log(`  ${accountId}: ${status}`);
});

console.log('\nNettoyage des comptes expirés...');
const cleanedCount = cleanExpiredMutedAccounts(testMutedAccounts);

console.log('\nÉtat final des comptes mutés:');
if (testMutedAccounts.size === 0) {
    console.log('  Aucun compte muté restant');
} else {
    testMutedAccounts.forEach((muteUntil, accountId) => {
        const timeLeft = muteUntil - now;
        console.log(`  ${accountId}: expire dans ${Math.round(timeLeft / 60000)}min`);
    });
}

console.log(`\nRésultat: ${cleanedCount} comptes démutés automatiquement`);
console.log('=== Test terminé ===');
