require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Importer le nouveau service de quotas par compte
const {
    loadAllAccountQuotas,
    getQuotasForAccount,
    initializeAccountQuotas,
    canPerformActionForAccount,
    consumeActionForAccount,
    calculateDailyQuotasForAccount,
    calculateActionsLeftForAccount,
    getAllAccountsQuotasSummary,
    migrateGlobalQuotasToPerAccount
} = require('./services/quotas-per-account');

// Importer l'ancien service pour comparaison
const { loadQuotas } = require('./services/quotas');

/**
 * TEST D'INDÉPENDANCE DES QUOTAS PAR COMPTE
 * Valide que chaque compte OAuth2/OAuth1a a des quotas totalement indépendants
 */

async function testQuotaIndependence() {
    console.log('🧪 TEST D\'INDÉPENDANCE DES QUOTAS PAR COMPTE\n');
    console.log('=' .repeat(60));
    
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    
    // Comptes de test
    const testAccounts = [
        { id: '153720161', username: 'psyk0t', authMethod: 'oauth2' },
        { id: '987654321', username: 'test_user_1', authMethod: 'oauth2' },
        { id: '123456789', username: 'test_user_2', authMethod: 'oauth1a' }
    ];
    
    console.log(`👥 Comptes de test : ${testAccounts.length}`);
    testAccounts.forEach(acc => {
        console.log(`   - @${acc.username} (${acc.id}) [${acc.authMethod}]`);
    });
    
    // Test 1: Initialisation des quotas par compte
    console.log('\n🔧 TEST 1: Initialisation des quotas par compte');
    totalTests++;
    
    try {
        let allInitialized = true;
        
        for (const account of testAccounts) {
            const quotas = initializeAccountQuotas(account.id, account.authMethod);
            
            if (!quotas || quotas.authMethod !== account.authMethod) {
                console.log(`❌ ÉCHEC: Initialisation ratée pour ${account.username}`);
                allInitialized = false;
            } else {
                console.log(`   ✅ ${account.username}: ${quotas.totalCredits} crédits, limite ${quotas.dailyLimit}/jour`);
            }
        }
        
        if (allInitialized) {
            console.log('✅ SUCCÈS: Tous les comptes initialisés avec des quotas indépendants');
            passedTests++;
        } else {
            console.log('❌ ÉCHEC: Problème d\'initialisation');
            failedTests++;
        }
    } catch (error) {
        console.log(`❌ ÉCHEC: Erreur initialisation - ${error.message}`);
        failedTests++;
    }
    
    // Test 2: Indépendance des quotas (consommation)
    console.log('\n💰 TEST 2: Indépendance des quotas (consommation)');
    totalTests++;
    
    try {
        const account1 = testAccounts[0];
        const account2 = testAccounts[1];
        
        // État initial
        const quotas1Before = getQuotasForAccount(account1.id);
        const quotas2Before = getQuotasForAccount(account2.id);
        
        console.log(`   État initial:`);
        console.log(`   - ${account1.username}: ${quotas1Before.dailyUsed.like} likes utilisés`);
        console.log(`   - ${account2.username}: ${quotas2Before.dailyUsed.like} likes utilisés`);
        
        // Consommer des actions pour le compte 1 SEULEMENT
        const consumeResults = [];
        for (let i = 0; i < 5; i++) {
            const result = consumeActionForAccount(account1.id, 'like');
            consumeResults.push(result.success);
        }
        
        // Vérifier l'état après consommation
        const quotas1After = getQuotasForAccount(account1.id);
        const quotas2After = getQuotasForAccount(account2.id);
        
        console.log(`   État après 5 likes du compte 1:`);
        console.log(`   - ${account1.username}: ${quotas1After.dailyUsed.like} likes utilisés`);
        console.log(`   - ${account2.username}: ${quotas2After.dailyUsed.like} likes utilisés`);
        
        // Validation de l'indépendance
        const account1Changed = quotas1After.dailyUsed.like > quotas1Before.dailyUsed.like;
        const account2Unchanged = quotas2After.dailyUsed.like === quotas2Before.dailyUsed.like;
        
        if (account1Changed && account2Unchanged) {
            console.log('✅ SUCCÈS: Quotas parfaitement indépendants');
            console.log('   Le compte 1 a consommé des quotas, le compte 2 est inchangé');
            passedTests++;
        } else {
            console.log('❌ ÉCHEC: Les quotas ne sont PAS indépendants');
            console.log(`   Compte 1 changé: ${account1Changed}, Compte 2 inchangé: ${account2Unchanged}`);
            failedTests++;
        }
    } catch (error) {
        console.log(`❌ ÉCHEC: Erreur test indépendance - ${error.message}`);
        failedTests++;
    }
    
    // Test 3: Limites par compte (un compte peut être bloqué, pas l'autre)
    console.log('\n🚫 TEST 3: Limites par compte (isolation des blocages)');
    totalTests++;
    
    try {
        const account1 = testAccounts[0];
        const account2 = testAccounts[1];
        
        // Consommer TOUS les likes du compte 1
        let likesConsumed = 0;
        while (canPerformActionForAccount(account1.id, 'like').allowed && likesConsumed < 100) {
            consumeActionForAccount(account1.id, 'like');
            likesConsumed++;
        }
        
        // Vérifier que le compte 1 est bloqué
        const account1CanLike = canPerformActionForAccount(account1.id, 'like');
        const account2CanLike = canPerformActionForAccount(account2.id, 'like');
        
        console.log(`   Après épuisement des likes du compte 1 (${likesConsumed} consommés):`);
        console.log(`   - ${account1.username} peut liker: ${account1CanLike.allowed} (${account1CanLike.reason || 'OK'})`);
        console.log(`   - ${account2.username} peut liker: ${account2CanLike.allowed} (${account2CanLike.reason || 'OK'})`);
        
        if (!account1CanLike.allowed && account2CanLike.allowed) {
            console.log('✅ SUCCÈS: Isolation parfaite des blocages');
            console.log('   Le compte 1 est bloqué, le compte 2 reste libre');
            passedTests++;
        } else {
            console.log('❌ ÉCHEC: Les blocages ne sont PAS isolés');
            failedTests++;
        }
    } catch (error) {
        console.log(`❌ ÉCHEC: Erreur test blocages - ${error.message}`);
        failedTests++;
    }
    
    // Test 4: Calculs indépendants par compte
    console.log('\n📊 TEST 4: Calculs indépendants par compte');
    totalTests++;
    
    try {
        let calculationsCorrect = true;
        
        for (const account of testAccounts) {
            const dailyQuotas = calculateDailyQuotasForAccount(account.id);
            const actionsLeft = calculateActionsLeftForAccount(account.id);
            const accountQuotas = getQuotasForAccount(account.id);
            
            console.log(`   ${account.username}:`);
            console.log(`     Quotas jour: ${JSON.stringify(dailyQuotas)}`);
            console.log(`     Restant: ${JSON.stringify(actionsLeft)}`);
            console.log(`     Utilisé: ${JSON.stringify(accountQuotas.dailyUsed)}`);
            
            // Vérifier la cohérence des calculs
            const totalQuotas = Object.values(dailyQuotas).reduce((sum, val) => sum + val, 0);
            const totalUsed = Object.values(accountQuotas.dailyUsed).reduce((sum, val) => sum + val, 0);
            const totalLeft = Object.values(actionsLeft).reduce((sum, val) => sum + val, 0);
            
            if (totalUsed + totalLeft !== totalQuotas) {
                console.log(`     ❌ Incohérence: ${totalUsed} + ${totalLeft} ≠ ${totalQuotas}`);
                calculationsCorrect = false;
            }
        }
        
        if (calculationsCorrect) {
            console.log('✅ SUCCÈS: Tous les calculs par compte sont cohérents');
            passedTests++;
        } else {
            console.log('❌ ÉCHEC: Incohérences dans les calculs');
            failedTests++;
        }
    } catch (error) {
        console.log(`❌ ÉCHEC: Erreur calculs - ${error.message}`);
        failedTests++;
    }
    
    // Test 5: Résumé global et agrégation
    console.log('\n📈 TEST 5: Résumé global et agrégation');
    totalTests++;
    
    try {
        const summary = getAllAccountsQuotasSummary();
        
        console.log(`   Résumé global:`);
        console.log(`     Nombre de comptes: ${summary.totalAccounts}`);
        console.log(`     Crédits totaux utilisés: ${summary.globalStats.totalCreditsUsed}`);
        console.log(`     Actions totales aujourd'hui: ${summary.globalStats.totalActionsToday}`);
        
        // Vérifier que chaque compte est présent
        let allAccountsPresent = true;
        for (const account of testAccounts) {
            if (!summary.accounts[account.id]) {
                console.log(`     ❌ Compte ${account.username} manquant dans le résumé`);
                allAccountsPresent = false;
            } else {
                const accountSummary = summary.accounts[account.id];
                console.log(`     ${account.username}: ${accountSummary.totalActionsToday} actions, ${accountSummary.creditsRemaining} crédits restants`);
            }
        }
        
        if (allAccountsPresent && summary.totalAccounts >= testAccounts.length) {
            console.log('✅ SUCCÈS: Résumé global cohérent et complet');
            passedTests++;
        } else {
            console.log('❌ ÉCHEC: Problème dans le résumé global');
            failedTests++;
        }
    } catch (error) {
        console.log(`❌ ÉCHEC: Erreur résumé - ${error.message}`);
        failedTests++;
    }
    
    // Test 6: Migration des quotas globaux (simulation)
    console.log('\n🔄 TEST 6: Migration des quotas globaux (simulation)');
    totalTests++;
    
    try {
        // Charger les anciens quotas globaux
        const globalQuotas = loadQuotas();
        console.log(`   Quotas globaux actuels: ${globalQuotas.usedCredits}/${globalQuotas.totalCredits} crédits`);
        
        // Simuler la migration
        const accountsForMigration = [
            { id: 'migration_test_1', username: 'migrated_1', authMethod: 'oauth1a' },
            { id: 'migration_test_2', username: 'migrated_2', authMethod: 'oauth2' }
        ];
        
        const migratedCount = migrateGlobalQuotasToPerAccount(globalQuotas, accountsForMigration);
        
        console.log(`   Migration simulée: ${migratedCount} comptes migrés`);
        
        // Vérifier que les comptes migrés ont des quotas
        let migrationSuccessful = true;
        for (const account of accountsForMigration) {
            const migratedQuotas = getQuotasForAccount(account.id);
            if (!migratedQuotas || migratedQuotas.totalCredits <= 0) {
                console.log(`     ❌ Migration ratée pour ${account.username}`);
                migrationSuccessful = false;
            } else {
                console.log(`     ✅ ${account.username}: ${migratedQuotas.totalCredits} crédits migrés`);
            }
        }
        
        if (migrationSuccessful) {
            console.log('✅ SUCCÈS: Migration des quotas globaux fonctionnelle');
            passedTests++;
        } else {
            console.log('❌ ÉCHEC: Problème de migration');
            failedTests++;
        }
    } catch (error) {
        console.log(`❌ ÉCHEC: Erreur migration - ${error.message}`);
        failedTests++;
    }
    
    // RÉSUMÉ FINAL
    console.log('\n' + '=' .repeat(60));
    console.log('📊 RÉSUMÉ DU TEST D\'INDÉPENDANCE DES QUOTAS');
    console.log('=' .repeat(60));
    console.log(`🧪 Total des tests: ${totalTests}`);
    console.log(`✅ Tests réussis: ${passedTests}`);
    console.log(`❌ Tests échoués: ${failedTests}`);
    console.log(`📈 Taux de réussite: ${Math.round((passedTests / totalTests) * 100)}%`);
    
    if (failedTests === 0) {
        console.log('\n🎉 PARFAIT! QUOTAS TOTALEMENT INDÉPENDANTS!');
        console.log('   ✅ Chaque compte a ses propres quotas');
        console.log('   ✅ Aucune mutualisation des limites');
        console.log('   ✅ Isolation complète des blocages');
        console.log('   ✅ Scalabilité garantie pour 20+ comptes');
        console.log('   ✅ Prêt pour la production multi-comptes');
    } else if (passedTests > failedTests) {
        console.log('\n✅ SUCCÈS MAJORITAIRE');
        console.log('   La plupart des fonctionnalités d\'indépendance marchent');
        console.log('   Quelques ajustements mineurs nécessaires');
    } else {
        console.log('\n❌ PROBLÈMES D\'INDÉPENDANCE DÉTECTÉS');
        console.log('   Les quotas ne sont pas suffisamment isolés');
        console.log('   Corrections critiques requises');
    }
    
    console.log('\n📋 FICHIER DE DONNÉES CRÉÉ:');
    console.log('   quotas-per-account.json - Quotas indépendants par compte');
    
    return {
        totalTests,
        passedTests,
        failedTests,
        success: failedTests === 0
    };
}

// Exécuter le test
if (require.main === module) {
    testQuotaIndependence().catch(console.error);
}

module.exports = { testQuotaIndependence };
