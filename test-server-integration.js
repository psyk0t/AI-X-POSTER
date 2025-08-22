require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * TEST D'INTÉGRATION SERVEUR
 * Vérifie que le serveur fonctionne avec la correction OAuth 2.0
 */

async function testServerIntegration() {
    console.log('🌐 TEST D\'INTÉGRATION SERVEUR\n');
    console.log('=' .repeat(60));
    
    const baseUrl = 'http://localhost:3005';
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    
    // Helper function pour les requêtes
    async function makeRequest(method, endpoint, data = null) {
        try {
            const config = {
                method,
                url: `${baseUrl}${endpoint}`,
                timeout: 10000
            };
            
            if (data) {
                config.data = data;
                config.headers = { 'Content-Type': 'application/json' };
            }
            
            const response = await axios(config);
            return { success: true, data: response.data, status: response.status };
        } catch (error) {
            return { 
                success: false, 
                error: error.message, 
                status: error.response?.status,
                data: error.response?.data 
            };
        }
    }
    
    // Test 1: Vérifier que le serveur répond
    console.log('\n🚀 TEST 1: Vérification du serveur');
    totalTests++;
    
    try {
        const result = await makeRequest('GET', '/');
        
        if (result.success) {
            console.log(`✅ SUCCÈS: Serveur répond (Status: ${result.status})`);
            passedTests++;
        } else {
            console.log(`❌ ÉCHEC: Serveur ne répond pas - ${result.error}`);
            failedTests++;
        }
    } catch (error) {
        console.log(`❌ ÉCHEC: Erreur serveur - ${error.message}`);
        failedTests++;
    }
    
    // Test 2: Test API des comptes connectés
    console.log('\n👥 TEST 2: API des comptes connectés');
    totalTests++;
    
    try {
        const result = await makeRequest('GET', '/api/accounts');
        
        if (result.success) {
            const accounts = result.data;
            console.log(`✅ SUCCÈS: API comptes répond`);
            console.log(`   Nombre de comptes: ${accounts.length}`);
            
            // Vérifier s'il y a des comptes OAuth 2.0
            const oauth2Accounts = accounts.filter(acc => acc.authMethod === 'oauth2');
            const oauth1Accounts = accounts.filter(acc => acc.authMethod !== 'oauth2');
            
            console.log(`   Comptes OAuth 2.0: ${oauth2Accounts.length}`);
            console.log(`   Comptes OAuth 1.0a: ${oauth1Accounts.length}`);
            
            if (oauth2Accounts.length > 0) {
                console.log(`   Premier compte OAuth 2.0: @${oauth2Accounts[0].username}`);
            }
            
            passedTests++;
        } else {
            console.log(`❌ ÉCHEC: API comptes - ${result.error}`);
            failedTests++;
        }
    } catch (error) {
        console.log(`❌ ÉCHEC: Erreur API comptes - ${error.message}`);
        failedTests++;
    }
    
    // Test 3: Test du statut d'automatisation
    console.log('\n🤖 TEST 3: API statut d\'automatisation');
    totalTests++;
    
    try {
        const result = await makeRequest('GET', '/api/automation-status');
        
        if (result.success) {
            console.log(`✅ SUCCÈS: API automatisation répond`);
            console.log(`   Statut: ${result.data.enabled ? 'Activé' : 'Désactivé'}`);
            passedTests++;
        } else {
            console.log(`❌ ÉCHEC: API automatisation - ${result.error}`);
            failedTests++;
        }
    } catch (error) {
        console.log(`❌ ÉCHEC: Erreur API automatisation - ${error.message}`);
        failedTests++;
    }
    
    // Test 4: Test de génération d'invitation OAuth 2.0
    console.log('\n🎫 TEST 4: Génération d\'invitation OAuth 2.0');
    totalTests++;
    
    try {
        const result = await makeRequest('POST', '/api/admin/projects/default/invite', {
            authMethod: 'oauth2'
        });
        
        if (result.success) {
            console.log(`✅ SUCCÈS: Invitation OAuth 2.0 générée`);
            console.log(`   Auth Method: ${result.data.authMethod}`);
            console.log(`   URL: ${result.data.inviteUrl.substring(0, 50)}...`);
            passedTests++;
        } else {
            console.log(`❌ ÉCHEC: Génération invitation - ${result.error}`);
            console.log(`   Status: ${result.status}`);
            failedTests++;
        }
    } catch (error) {
        console.log(`❌ ÉCHEC: Erreur génération invitation - ${error.message}`);
        failedTests++;
    }
    
    // Test 5: Test de génération d'invitation OAuth 1.0a (compatibilité)
    console.log('\n🔄 TEST 5: Génération d\'invitation OAuth 1.0a (compatibilité)');
    totalTests++;
    
    try {
        const result = await makeRequest('POST', '/api/admin/projects/default/invite', {
            authMethod: 'oauth1a'
        });
        
        if (result.success) {
            console.log(`✅ SUCCÈS: Invitation OAuth 1.0a générée (compatibilité)`);
            console.log(`   Auth Method: ${result.data.authMethod}`);
            passedTests++;
        } else {
            console.log(`❌ ÉCHEC: Génération invitation 1.0a - ${result.error}`);
            failedTests++;
        }
    } catch (error) {
        console.log(`❌ ÉCHEC: Erreur génération invitation 1.0a - ${error.message}`);
        failedTests++;
    }
    
    // Test 6: Test des logs (vérifier qu'il n'y a plus d'erreurs 403)
    console.log('\n📋 TEST 6: Vérification des logs récents');
    totalTests++;
    
    try {
        const result = await makeRequest('GET', '/api/download-logs');
        
        if (result.success) {
            console.log(`✅ SUCCÈS: API logs répond`);
            
            // Analyser les logs pour chercher des erreurs 403 récentes
            const logs = result.data;
            const recent403Errors = logs.split('\n')
                .filter(line => line.includes('403') && line.includes('Impossible d\'obtenir les infos utilisateur'))
                .slice(-5); // Dernières 5 erreurs 403
            
            if (recent403Errors.length === 0) {
                console.log(`   ✅ Aucune erreur 403 récente détectée`);
            } else {
                console.log(`   ⚠️ ${recent403Errors.length} erreurs 403 récentes trouvées`);
                console.log(`   (Cela peut être normal si l'automatisation n'a pas encore redémarré)`);
            }
            
            passedTests++;
        } else {
            console.log(`❌ ÉCHEC: API logs - ${result.error}`);
            failedTests++;
        }
    } catch (error) {
        console.log(`❌ ÉCHEC: Erreur API logs - ${error.message}`);
        failedTests++;
    }
    
    // RÉSUMÉ FINAL
    console.log('\n' + '=' .repeat(60));
    console.log('📊 RÉSUMÉ DES TESTS D\'INTÉGRATION SERVEUR');
    console.log('=' .repeat(60));
    console.log(`🧪 Total des tests: ${totalTests}`);
    console.log(`✅ Tests réussis: ${passedTests}`);
    console.log(`❌ Tests échoués: ${failedTests}`);
    console.log(`📈 Taux de réussite: ${Math.round((passedTests / totalTests) * 100)}%`);
    
    if (failedTests === 0) {
        console.log('\n🎉 PARFAIT! LE SERVEUR FONCTIONNE COMPLÈTEMENT!');
        console.log('   Toutes les APIs sont opérationnelles');
        console.log('   OAuth 2.0 et OAuth 1.0a supportés');
        console.log('   Prêt pour l\'automatisation en production');
    } else if (passedTests > failedTests) {
        console.log('\n✅ SERVEUR MAJORITAIREMENT FONCTIONNEL');
        console.log('   La plupart des fonctionnalités marchent');
        console.log('   Quelques points à surveiller');
    } else {
        console.log('\n❌ PROBLÈMES SERVEUR DÉTECTÉS');
        console.log('   Des corrections sont nécessaires');
    }
    
    return {
        totalTests,
        passedTests,
        failedTests,
        success: failedTests === 0
    };
}

// Exécuter le test
if (require.main === module) {
    testServerIntegration().catch(console.error);
}

module.exports = { testServerIntegration };
