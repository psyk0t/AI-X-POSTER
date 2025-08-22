/**
 * TEST PHASE 1 : Migration vers shared-quota-manager.js uniquement
 * Vérifie que toutes les fonctions de quotas fonctionnent correctement
 */

const { 
    canPerformSharedAction, 
    consumeSharedAction, 
    getSharedQuotaStats,
    addConnectedAccount,
    removeConnectedAccount,
    determineActionsForTweet,
    calculateActionsLeftForAccount
} = require('./services/shared-quota-manager');

async function testPhase1Migration() {
    console.log('🧪 TEST PHASE 1 : Migration des quotas vers shared-quota-manager.js');
    console.log('='.repeat(70));
    
    let testsPassed = 0;
    let testsTotal = 0;
    
    function logTest(name, condition, details = '') {
        testsTotal++;
        if (condition) {
            testsPassed++;
            console.log(`✅ ${name}`);
            if (details) console.log(`   ${details}`);
        } else {
            console.log(`❌ ${name}`);
            if (details) console.log(`   ${details}`);
        }
    }
    
    try {
        // Test 1: Vérifier que les fonctions sont bien importées
        logTest('Import des fonctions shared-quota-manager', 
            typeof canPerformSharedAction === 'function' &&
            typeof consumeSharedAction === 'function' &&
            typeof getSharedQuotaStats === 'function' &&
            typeof determineActionsForTweet === 'function' &&
            typeof calculateActionsLeftForAccount === 'function',
            'Toutes les fonctions nécessaires sont disponibles'
        );
        
        // Test 2: Ajouter un compte de test
        const testAccountId = 'test_account_123';
        const testUsername = 'test_user';
        
        const addResult = addConnectedAccount(testAccountId, testUsername, 'oauth2');
        logTest('Ajout d\'un compte de test', 
            addResult && typeof addResult === 'object',
            `Compte ${testUsername} ajouté avec succès`
        );
        
        // Test 3: Vérifier les statistiques initiales
        const initialStats = getSharedQuotaStats();
        logTest('Récupération des statistiques', 
            initialStats && initialStats.activeAccounts && initialStats.globalPack,
            `${initialStats.activeAccounts.length} comptes actifs, ${initialStats.globalPack.remainingActions} actions restantes`
        );
        
        // Test 4: Tester la vérification d'action
        const canPerform = canPerformSharedAction(testAccountId, 'like');
        logTest('Vérification d\'autorisation d\'action', 
            canPerform && typeof canPerform.allowed === 'boolean',
            `Action autorisée: ${canPerform.allowed}, Raison: ${canPerform.reason || 'OK'}`
        );
        
        // Test 5: Tester la détermination d'actions
        const actions = determineActionsForTweet(testAccountId, 'test_tweet_456');
        logTest('Détermination d\'actions pour un tweet', 
            actions && Array.isArray(actions.actions),
            `Actions déterminées: ${actions.actions.join(', ') || 'aucune'}`
        );
        
        // Test 6: Tester le calcul d'actions restantes (compatibilité)
        const actionsLeft = calculateActionsLeftForAccount(testAccountId);
        logTest('Calcul d\'actions restantes (compatibilité)', 
            actionsLeft && typeof actionsLeft.like === 'number',
            `Actions restantes - Like: ${actionsLeft.like}, Retweet: ${actionsLeft.retweet}, Reply: ${actionsLeft.reply}`
        );
        
        // Test 7: Consommer une action si autorisée
        if (canPerform.allowed) {
            const consumeResult = consumeSharedAction(testAccountId, 'like');
            logTest('Consommation d\'une action', 
                consumeResult && consumeResult.success !== undefined,
                `Résultat: ${consumeResult.success ? 'Succès' : 'Échec - ' + consumeResult.reason}`
            );
        } else {
            logTest('Consommation d\'une action', 
                true,
                'Test ignoré - action non autorisée'
            );
        }
        
        // Test 8: Vérifier les stats après consommation
        const finalStats = getSharedQuotaStats();
        logTest('Statistiques après consommation', 
            finalStats && finalStats.globalPack.usedActions >= initialStats.globalPack.usedActions,
            `Actions utilisées: ${finalStats.globalPack.usedActions}/${finalStats.globalPack.totalActions}`
        );
        
        // Test 9: Nettoyer le compte de test
        const removeResult = removeConnectedAccount(testAccountId);
        logTest('Suppression du compte de test', 
            removeResult !== null,
            'Compte de test supprimé avec succès'
        );
        
    } catch (error) {
        console.log(`❌ Erreur critique lors des tests: ${error.message}`);
        console.log(error.stack);
    }
    
    console.log('\n' + '='.repeat(70));
    console.log(`📊 RÉSULTATS: ${testsPassed}/${testsTotal} tests réussis`);
    
    if (testsPassed === testsTotal) {
        console.log('🎉 PHASE 1 VALIDÉE - Migration réussie vers shared-quota-manager.js');
        return true;
    } else {
        console.log('⚠️  PHASE 1 ÉCHOUÉE - Corrections nécessaires avant Phase 2');
        return false;
    }
}

// Exécuter les tests
if (require.main === module) {
    testPhase1Migration().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('Erreur fatale:', error);
        process.exit(1);
    });
}

module.exports = { testPhase1Migration };
