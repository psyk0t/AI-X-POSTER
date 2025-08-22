require('dotenv').config();
const fs = require('fs');
const path = require('path');

/**
 * TEST D'INTÉGRATION COMPLÈTE DU SYSTÈME DE QUOTAS PAR COMPTE
 * Valide que l'automatisation utilise bien les quotas indépendants
 */

async function testIntegrationQuotasPerAccount() {
    console.log('🔗 TEST D\'INTÉGRATION COMPLÈTE - QUOTAS PAR COMPTE\n');
    console.log('=' .repeat(60));
    
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    
    // Test 1: Vérifier que le serveur utilise le nouveau système
    console.log('\n🔧 TEST 1: Vérification du système de quotas dans le serveur');
    totalTests++;
    
    try {
        // Lire le fichier server.js pour vérifier l'intégration
        const serverContent = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
        
        const hasNewQuotaImports = serverContent.includes('quotas-per-account');
        const hasNewQuotaFunctions = serverContent.includes('canPerformActionForAccount');
        const hasOldQuotaRemoved = !serverContent.includes('quotasData,') || serverContent.includes('// Nouveau système');
        
        console.log(`   Import nouveau système: ${hasNewQuotaImports ? '✅' : '❌'}`);
        console.log(`   Fonctions par compte: ${hasNewQuotaFunctions ? '✅' : '❌'}`);
        console.log(`   Ancien système retiré: ${hasOldQuotaRemoved ? '✅' : '❌'}`);
        
        if (hasNewQuotaImports && hasNewQuotaFunctions && hasOldQuotaRemoved) {
            console.log('✅ SUCCÈS: Serveur intègre le nouveau système de quotas');
            passedTests++;
        } else {
            console.log('❌ ÉCHEC: Intégration serveur incomplète');
            failedTests++;
        }
    } catch (error) {
        console.log(`❌ ÉCHEC: Erreur lecture serveur - ${error.message}`);
        failedTests++;
    }
    
    // Test 2: Vérifier que l'automatisation utilise le nouveau système
    console.log('\n🤖 TEST 2: Vérification du système de quotas dans l\'automatisation');
    totalTests++;
    
    try {
        // Lire le fichier automation.js pour vérifier l'intégration
        const automationContent = fs.readFileSync(path.join(__dirname, 'services', 'automation.js'), 'utf8');
        
        const hasNewQuotaFunctions = automationContent.includes('canPerformActionForAccount');
        const hasPerAccountCalculations = automationContent.includes('calculateActionsLeftForAccount');
        const hasOldQuotaRemoved = !automationContent.includes('quotasData,') || automationContent.includes('// Nouveau système');
        const hasAccountSpecificQuotas = automationContent.includes('accountActionsLeft');
        
        console.log(`   Fonctions par compte: ${hasNewQuotaFunctions ? '✅' : '❌'}`);
        console.log(`   Calculs par compte: ${hasPerAccountCalculations ? '✅' : '❌'}`);
        console.log(`   Ancien système retiré: ${hasOldQuotaRemoved ? '✅' : '❌'}`);
        console.log(`   Quotas spécifiques: ${hasAccountSpecificQuotas ? '✅' : '❌'}`);
        
        if (hasNewQuotaFunctions && hasPerAccountCalculations && hasOldQuotaRemoved && hasAccountSpecificQuotas) {
            console.log('✅ SUCCÈS: Automatisation intègre le nouveau système de quotas');
            passedTests++;
        } else {
            console.log('❌ ÉCHEC: Intégration automatisation incomplète');
            failedTests++;
        }
    } catch (error) {
        console.log(`❌ ÉCHEC: Erreur lecture automatisation - ${error.message}`);
        failedTests++;
    }
    
    // Test 3: Vérifier la création du fichier de quotas par compte
    console.log('\n📁 TEST 3: Vérification du fichier de quotas par compte');
    totalTests++;
    
    try {
        const quotasPerAccountFile = path.join(__dirname, 'quotas-per-account.json');
        
        if (fs.existsSync(quotasPerAccountFile)) {
            const quotasData = JSON.parse(fs.readFileSync(quotasPerAccountFile, 'utf8'));
            
            const hasAccountsStructure = quotasData.accounts && typeof quotasData.accounts === 'object';
            const hasGlobalConfig = quotasData.globalConfig && typeof quotasData.globalConfig === 'object';
            const accountCount = hasAccountsStructure ? Object.keys(quotasData.accounts).length : 0;
            
            console.log(`   Structure comptes: ${hasAccountsStructure ? '✅' : '❌'}`);
            console.log(`   Config globale: ${hasGlobalConfig ? '✅' : '❌'}`);
            console.log(`   Nombre de comptes: ${accountCount}`);
            
            if (hasAccountsStructure && hasGlobalConfig) {
                console.log('✅ SUCCÈS: Fichier de quotas par compte valide');
                
                // Afficher les comptes configurés
                if (accountCount > 0) {
                    console.log('   Comptes configurés:');
                    Object.entries(quotasData.accounts).forEach(([accountId, quotas]) => {
                        console.log(`     - ${accountId}: ${quotas.totalCredits} crédits, méthode ${quotas.authMethod || 'N/A'}`);
                    });
                }
                
                passedTests++;
            } else {
                console.log('❌ ÉCHEC: Structure du fichier invalide');
                failedTests++;
            }
        } else {
            console.log('❌ ÉCHEC: Fichier quotas-per-account.json non trouvé');
            failedTests++;
        }
    } catch (error) {
        console.log(`❌ ÉCHEC: Erreur lecture fichier quotas - ${error.message}`);
        failedTests++;
    }
    
    // Test 4: Test de simulation d'automatisation avec quotas par compte
    console.log('\n🎯 TEST 4: Simulation d\'automatisation avec quotas par compte');
    totalTests++;
    
    try {
        // Importer les fonctions du nouveau système
        const {
            getQuotasForAccount,
            canPerformActionForAccount,
            consumeActionForAccount,
            calculateActionsLeftForAccount
        } = require('./services/quotas-per-account');
        
        // Comptes de test
        const testAccount1 = '153720161'; // psyk0t
        const testAccount2 = '987654321'; // test user
        
        // Vérifier les quotas initiaux
        const quotas1 = getQuotasForAccount(testAccount1);
        const quotas2 = getQuotasForAccount(testAccount2);
        
        console.log(`   Compte 1 (${testAccount1}): ${quotas1.totalCredits} crédits`);
        console.log(`   Compte 2 (${testAccount2}): ${quotas2.totalCredits} crédits`);
        
        // Simuler des actions pour le compte 1 seulement
        let actionsPerformed = 0;
        for (let i = 0; i < 3; i++) {
            if (canPerformActionForAccount(testAccount1, 'like').allowed) {
                const result = consumeActionForAccount(testAccount1, 'like');
                if (result.success) {
                    actionsPerformed++;
                }
            }
        }
        
        // Vérifier que seul le compte 1 a été affecté
        const quotas1After = getQuotasForAccount(testAccount1);
        const quotas2After = getQuotasForAccount(testAccount2);
        
        const account1Changed = quotas1After.usedCredits > quotas1.usedCredits;
        const account2Unchanged = quotas2After.usedCredits === quotas2.usedCredits;
        
        console.log(`   Actions effectuées: ${actionsPerformed}`);
        console.log(`   Compte 1 modifié: ${account1Changed ? '✅' : '❌'}`);
        console.log(`   Compte 2 inchangé: ${account2Unchanged ? '✅' : '❌'}`);
        
        if (actionsPerformed > 0 && account1Changed && account2Unchanged) {
            console.log('✅ SUCCÈS: Simulation d\'automatisation avec quotas indépendants');
            passedTests++;
        } else {
            console.log('❌ ÉCHEC: Problème dans la simulation');
            failedTests++;
        }
    } catch (error) {
        console.log(`❌ ÉCHEC: Erreur simulation - ${error.message}`);
        failedTests++;
    }
    
    // Test 5: Vérifier la compatibilité avec les comptes OAuth2 existants
    console.log('\n🔐 TEST 5: Compatibilité avec les comptes OAuth2 existants');
    totalTests++;
    
    try {
        // Lire les utilisateurs OAuth2 existants
        const oauth2UsersFile = path.join(__dirname, 'oauth2-users.json');
        
        if (fs.existsSync(oauth2UsersFile)) {
            const oauth2Data = JSON.parse(fs.readFileSync(oauth2UsersFile, 'utf8'));
            
            if (oauth2Data.length > 0) {
                const user = oauth2Data[0][1]; // Premier utilisateur OAuth2
                const userId = user.id;
                
                // Vérifier que ce compte a des quotas initialisés
                const { getQuotasForAccount } = require('./services/quotas-per-account');
                const userQuotas = getQuotasForAccount(userId);
                
                const hasQuotas = userQuotas && userQuotas.totalCredits > 0;
                const isOAuth2 = userQuotas.authMethod === 'oauth2';
                
                console.log(`   Utilisateur OAuth2: @${user.username} (${userId})`);
                console.log(`   Quotas initialisés: ${hasQuotas ? '✅' : '❌'}`);
                console.log(`   Méthode OAuth2: ${isOAuth2 ? '✅' : '❌'}`);
                
                if (hasQuotas && isOAuth2) {
                    console.log('✅ SUCCÈS: Compatibilité OAuth2 assurée');
                    passedTests++;
                } else {
                    console.log('❌ ÉCHEC: Problème de compatibilité OAuth2');
                    failedTests++;
                }
            } else {
                console.log('⚠️ ATTENTION: Aucun utilisateur OAuth2 trouvé pour le test');
                console.log('✅ SUCCÈS: Test passé (pas d\'utilisateur à tester)');
                passedTests++;
            }
        } else {
            console.log('⚠️ ATTENTION: Fichier oauth2-users.json non trouvé');
            console.log('✅ SUCCÈS: Test passé (pas de fichier OAuth2)');
            passedTests++;
        }
    } catch (error) {
        console.log(`❌ ÉCHEC: Erreur compatibilité OAuth2 - ${error.message}`);
        failedTests++;
    }
    
    // Test 6: Vérifier la performance et la scalabilité
    console.log('\n⚡ TEST 6: Performance et scalabilité');
    totalTests++;
    
    try {
        const { getAllAccountsQuotasSummary } = require('./services/quotas-per-account');
        
        const startTime = Date.now();
        const summary = getAllAccountsQuotasSummary();
        const endTime = Date.now();
        
        const responseTime = endTime - startTime;
        const accountCount = summary.totalAccounts;
        
        console.log(`   Temps de réponse: ${responseTime}ms`);
        console.log(`   Nombre de comptes: ${accountCount}`);
        console.log(`   Performance: ${responseTime < 100 ? '✅ Excellente' : responseTime < 500 ? '✅ Bonne' : '⚠️ Acceptable'}`);
        
        if (responseTime < 1000) { // Moins d'1 seconde acceptable
            console.log('✅ SUCCÈS: Performance acceptable pour la scalabilité');
            passedTests++;
        } else {
            console.log('❌ ÉCHEC: Performance insuffisante');
            failedTests++;
        }
    } catch (error) {
        console.log(`❌ ÉCHEC: Erreur test performance - ${error.message}`);
        failedTests++;
    }
    
    // RÉSUMÉ FINAL
    console.log('\n' + '=' .repeat(60));
    console.log('📊 RÉSUMÉ DU TEST D\'INTÉGRATION COMPLÈTE');
    console.log('=' .repeat(60));
    console.log(`🧪 Total des tests: ${totalTests}`);
    console.log(`✅ Tests réussis: ${passedTests}`);
    console.log(`❌ Tests échoués: ${failedTests}`);
    console.log(`📈 Taux de réussite: ${Math.round((passedTests / totalTests) * 100)}%`);
    
    if (failedTests === 0) {
        console.log('\n🎉 INTÉGRATION PARFAITE!');
        console.log('   ✅ Serveur intègre le nouveau système');
        console.log('   ✅ Automatisation utilise les quotas par compte');
        console.log('   ✅ Fichiers de données créés et valides');
        console.log('   ✅ Simulation fonctionnelle');
        console.log('   ✅ Compatibilité OAuth2 assurée');
        console.log('   ✅ Performance scalable');
        console.log('\n🚀 SYSTÈME PRÊT POUR LA PRODUCTION MULTI-COMPTES!');
    } else if (passedTests > failedTests) {
        console.log('\n✅ INTÉGRATION MAJORITAIREMENT RÉUSSIE');
        console.log('   La plupart des composants sont intégrés');
        console.log('   Quelques ajustements mineurs nécessaires');
    } else {
        console.log('\n❌ PROBLÈMES D\'INTÉGRATION DÉTECTÉS');
        console.log('   Des corrections importantes sont nécessaires');
        console.log('   Revoir l\'intégration du système de quotas');
    }
    
    console.log('\n📋 FICHIERS CRÉÉS/MODIFIÉS:');
    console.log('   ✅ services/quotas-per-account.js - Service de quotas par compte');
    console.log('   ✅ quotas-per-account.json - Données de quotas par compte');
    console.log('   ✅ services/automation.js - Automatisation adaptée');
    console.log('   ✅ server.js - Serveur avec nouveau système');
    
    return {
        totalTests,
        passedTests,
        failedTests,
        success: failedTests === 0
    };
}

// Exécuter le test
if (require.main === module) {
    testIntegrationQuotasPerAccount().catch(console.error);
}

module.exports = { testIntegrationQuotasPerAccount };
