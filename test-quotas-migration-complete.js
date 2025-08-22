#!/usr/bin/env node

/**
 * 🎯 TEST COMPLET DE MIGRATION DES QUOTAS
 * Validation automatique de la suppression de l'ancien système et du nouveau système par compte
 */

const fs = require('fs');
const path = require('path');

console.log('🎯 TEST COMPLET - MIGRATION QUOTAS PAR COMPTE');
console.log('='.repeat(60));

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function logTest(name, success, details = '') {
    totalTests++;
    if (success) {
        console.log(`✅ ${name}`);
        if (details) console.log(`   ${details}`);
        passedTests++;
    } else {
        console.log(`❌ ${name}`);
        if (details) console.log(`   ${details}`);
        failedTests++;
    }
}

// 🧹 PHASE 1: VÉRIFICATION SUPPRESSION ANCIEN SYSTÈME
console.log('\n🧹 PHASE 1: VÉRIFICATION SUPPRESSION ANCIEN SYSTÈME');
console.log('-'.repeat(50));

try {
    // Test 1: Vérifier que l'ancien import a été supprimé du serveur
    const serverContent = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf-8');
    const hasOldImport = serverContent.includes("require('./services/quotas')");
    logTest('Ancien import quotas.js supprimé du serveur', !hasOldImport, 
        hasOldImport ? 'ERREUR: Import encore présent' : 'Import correctement supprimé');

    // Test 2: Vérifier que l'ancienne interface a été supprimée
    const indexContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
    const hasOldUI = indexContent.includes('Quota management') || indexContent.includes('quotaGlobalInput');
    logTest('Ancienne interface quotas supprimée', !hasOldUI,
        hasOldUI ? 'ERREUR: Ancienne interface encore présente' : 'Interface correctement supprimée');

    // Test 3: Vérifier que le nouveau système est présent
    const hasNewUI = indexContent.includes('Gestion des Quotas par Compte') && 
                     indexContent.includes('loadQuotasPerAccount');
    logTest('Nouvelle interface quotas par compte présente', hasNewUI,
        hasNewUI ? 'Interface moderne correctement implémentée' : 'ERREUR: Nouvelle interface manquante');

} catch (error) {
    logTest('Vérification fichiers système', false, `Erreur: ${error.message}`);
}

// 🔧 PHASE 2: VALIDATION DU NOUVEAU SYSTÈME
console.log('\n🔧 PHASE 2: VALIDATION DU NOUVEAU SYSTÈME');
console.log('-'.repeat(50));

try {
    // Test 4: Vérifier l'existence du service quotas par compte
    const quotasPerAccountPath = path.join(__dirname, 'services', 'quotas-per-account.js');
    const quotasPerAccountExists = fs.existsSync(quotasPerAccountPath);
    logTest('Service quotas-per-account.js existe', quotasPerAccountExists,
        quotasPerAccountExists ? 'Service correctement créé' : 'ERREUR: Service manquant');

    if (quotasPerAccountExists) {
        const quotasPerAccountContent = fs.readFileSync(quotasPerAccountPath, 'utf-8');
        
        // Test 5: Vérifier les fonctions essentielles
        const hasEssentialFunctions = [
            'loadAllAccountQuotas',
            'getQuotasForAccount', 
            'initializeAccountQuotas',
            'canPerformActionForAccount',
            'consumeActionForAccount'
        ].every(func => quotasPerAccountContent.includes(func));
        
        logTest('Fonctions essentielles présentes', hasEssentialFunctions,
            hasEssentialFunctions ? 'Toutes les fonctions critiques implémentées' : 'ERREUR: Fonctions manquantes');

        // Test 6: Vérifier la configuration par défaut
        const hasDefaultConfig = quotasPerAccountContent.includes('DEFAULT_ACCOUNT_QUOTAS') &&
                                 quotasPerAccountContent.includes('dailyLimit: 300');
        logTest('Configuration par défaut mise à jour', hasDefaultConfig,
            hasDefaultConfig ? 'Limite journalière augmentée à 300' : 'ERREUR: Configuration obsolète');
    }

} catch (error) {
    logTest('Validation nouveau système', false, `Erreur: ${error.message}`);
}

// 🌐 PHASE 3: VALIDATION DES APIS
console.log('\n🌐 PHASE 3: VALIDATION DES APIS');
console.log('-'.repeat(50));

try {
    // Test 7: Vérifier les nouvelles routes API dans le serveur
    const serverContent = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf-8');
    
    const hasQuotasAPIs = [
        '/api/quotas/summary',
        '/api/quotas/account/:accountId',
        '/api/quotas/account/:accountId/update',
        '/api/quotas/defaults/update'
    ].every(route => serverContent.includes(route));
    
    logTest('APIs de gestion des quotas présentes', hasQuotasAPIs,
        hasQuotasAPIs ? 'Toutes les routes API implémentées' : 'ERREUR: Routes API manquantes');

    // Test 8: Vérifier l'import du nouveau service
    const hasNewImport = serverContent.includes("require('./services/quotas-per-account')");
    logTest('Import du nouveau service quotas', hasNewImport,
        hasNewImport ? 'Service correctement importé' : 'ERREUR: Import manquant');

} catch (error) {
    logTest('Validation APIs', false, `Erreur: ${error.message}`);
}

// 📊 PHASE 4: TEST DU SYSTÈME EN FONCTIONNEMENT
console.log('\n📊 PHASE 4: TEST DU SYSTÈME EN FONCTIONNEMENT');
console.log('-'.repeat(50));

try {
    // Test 9: Charger et tester le service quotas par compte
    const { 
        loadAllAccountQuotas,
        initializeAccountQuotas,
        getQuotasForAccount,
        getAllAccountsQuotasSummary 
    } = require('./services/quotas-per-account');

    // Test d'initialisation d'un compte test
    const testAccountId = 'test_account_123';
    const initializedQuotas = initializeAccountQuotas(testAccountId, 'oauth2');
    
    logTest('Initialisation quotas nouveau compte', !!initializedQuotas,
        initializedQuotas ? `Compte ${testAccountId} initialisé avec ${initializedQuotas.dailyLimit} actions/jour` : 'ERREUR: Échec initialisation');

    // Test de récupération des quotas
    const retrievedQuotas = getQuotasForAccount(testAccountId);
    logTest('Récupération quotas compte', !!retrievedQuotas,
        retrievedQuotas ? `Quotas récupérés: ${retrievedQuotas.dailyLimit} limite journalière` : 'ERREUR: Échec récupération');

    // Test du résumé global
    const summary = getAllAccountsQuotasSummary();
    logTest('Génération résumé global', !!summary && summary.totalAccounts >= 0,
        summary ? `${summary.totalAccounts} comptes avec quotas détectés` : 'ERREUR: Échec résumé');

} catch (error) {
    logTest('Test système en fonctionnement', false, `Erreur: ${error.message}`);
}

// 🎯 PHASE 5: VALIDATION FRONTEND
console.log('\n🎯 PHASE 5: VALIDATION FRONTEND');
console.log('-'.repeat(50));

try {
    const indexContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
    
    // Test 10: Vérifier les fonctions JavaScript
    const hasJSFunctions = [
        'loadQuotasPerAccount',
        'editAccountQuotas', 
        'saveDefaultQuotas',
        'displayQuotasSummary'
    ].every(func => indexContent.includes(`function ${func}`) || indexContent.includes(`${func} =`));
    
    logTest('Fonctions JavaScript quotas présentes', hasJSFunctions,
        hasJSFunctions ? 'Toutes les fonctions frontend implémentées' : 'ERREUR: Fonctions JS manquantes');

    // Test 11: Vérifier l'interface utilisateur
    const hasUIElements = [
        'totalActiveAccounts',
        'totalCreditsUsed', 
        'totalActionsToday',
        'quotasAccountsList',
        'defaultDailyLimit'
    ].every(id => indexContent.includes(`id="${id}"`));
    
    logTest('Éléments interface utilisateur présents', hasUIElements,
        hasUIElements ? 'Interface complète implémentée' : 'ERREUR: Éléments UI manquants');

    // Test 12: Vérifier le chargement automatique
    const hasAutoLoad = indexContent.includes('loadQuotasPerAccount()') && 
                       indexContent.includes('setInterval(loadQuotasPerAccount');
    logTest('Chargement automatique configuré', hasAutoLoad,
        hasAutoLoad ? 'Actualisation automatique activée' : 'ERREUR: Chargement automatique manquant');

} catch (error) {
    logTest('Validation frontend', false, `Erreur: ${error.message}`);
}

// 📋 RÉSUMÉ FINAL
console.log('\n📋 RÉSUMÉ FINAL');
console.log('='.repeat(60));

const successRate = Math.round((passedTests / totalTests) * 100);
console.log(`🧪 Total des tests: ${totalTests}`);
console.log(`✅ Tests réussis: ${passedTests}`);
console.log(`❌ Tests échoués: ${failedTests}`);
console.log(`📈 Taux de réussite: ${successRate}%`);

if (successRate === 100) {
    console.log('\n🎉 MIGRATION COMPLÈTEMENT RÉUSSIE!');
    console.log('🚀 SYSTÈME DE QUOTAS PAR COMPTE 100% OPÉRATIONNEL!');
    console.log('✨ ANCIEN SYSTÈME CORRECTEMENT SUPPRIMÉ!');
} else if (successRate >= 80) {
    console.log('\n✅ MIGRATION LARGEMENT RÉUSSIE!');
    console.log('⚠️  Quelques points mineurs à vérifier.');
} else {
    console.log('\n❌ MIGRATION INCOMPLÈTE!');
    console.log('🔧 Des corrections sont nécessaires.');
}

console.log('\n' + '='.repeat(60));
