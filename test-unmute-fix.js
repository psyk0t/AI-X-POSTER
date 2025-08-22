/**
 * Test de la correction du système de unmute automatique
 * Ce script simule des comptes mutés et vérifie qu'ils sont bien unmutés après expiration
 */

const { runAutomationScan } = require('./services/automation');
const { logToFile } = require('./services/logs-optimized');

// Simulation des dépendances du serveur
const mutedAccounts = new Map();

// Ajouter des comptes mutés avec différentes durées d'expiration
const now = Date.now();
mutedAccounts.set('test_account_1', now - 60000); // Expiré depuis 1 minute
mutedAccounts.set('test_account_2', now + 30000); // Expire dans 30 secondes
mutedAccounts.set('test_account_3', now + 120000); // Expire dans 2 minutes

console.log('🧪 Test de la correction du système de unmute');
console.log(`📊 État initial: ${mutedAccounts.size} comptes mutés`);

// Afficher l'état initial
for (const [accountId, muteUntil] of mutedAccounts.entries()) {
    const timeLeft = muteUntil - now;
    const status = timeLeft <= 0 ? 'EXPIRÉ' : `${Math.round(timeLeft/1000)}s restants`;
    console.log(`   - ${accountId}: ${status}`);
}

// Dépendances simulées
const mockDependencies = {
    getAllConnectedAccounts: () => [
        { id: 'test_account_1', username: 'test1', authMethod: 'oauth2' },
        { id: 'test_account_2', username: 'test2', authMethod: 'oauth2' },
        { id: 'test_account_3', username: 'test3', authMethod: 'oauth2' }
    ],
    watchAccounts: [],
    lastTweetId: {},
    isAutomationEnabled: false, // Désactivé pour éviter le scan complet
    automationActive: false,
    rateLimitState: {},
    performedActionsDB: {},
    mutedAccounts: mutedAccounts, // Référence partagée
    getRwClientById: () => null,
    generateUniqueAIComments: () => 'Test comment',
    markActionAsPerformed: () => {},
    hasActionBeenPerformed: () => false,
    logSystemAction: (msg) => console.log(`[SYSTEM] ${msg}`),
    pushLiveLog: (msg) => console.log(`[LIVE] ${msg}`),
    randomDelay: () => Promise.resolve(),
    logToFile: (msg) => console.log(`[LOG] ${msg}`)
};

// Exécuter le test
async function runTest() {
    console.log('\n🚀 Lancement du test...\n');
    
    try {
        await runAutomationScan(mockDependencies);
        
        console.log('\n📊 État final:');
        console.log(`   Comptes mutés restants: ${mutedAccounts.size}`);
        
        if (mutedAccounts.size > 0) {
            for (const [accountId, muteUntil] of mutedAccounts.entries()) {
                const timeLeft = muteUntil - Date.now();
                console.log(`   - ${accountId}: ${Math.round(timeLeft/1000)}s restants`);
            }
        }
        
        // Vérifier que le compte expiré a été supprimé
        if (!mutedAccounts.has('test_account_1')) {
            console.log('\n✅ SUCCÈS: Le compte expiré a été automatiquement unmuted');
        } else {
            console.log('\n❌ ÉCHEC: Le compte expiré n\'a pas été unmuted');
        }
        
    } catch (error) {
        console.error('❌ Erreur pendant le test:', error.message);
    }
}

runTest();
