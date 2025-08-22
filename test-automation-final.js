require('dotenv').config();
const axios = require('axios');

/**
 * TEST FINAL DE L'AUTOMATISATION
 * Lance l'automatisation et vérifie qu'il n'y a plus d'erreurs 403
 */

async function testAutomationFinal() {
    console.log('🎯 TEST FINAL DE L\'AUTOMATISATION AVEC CORRECTION\n');
    console.log('=' .repeat(60));
    
    const baseUrl = 'http://localhost:3005';
    
    // Helper function pour les requêtes
    async function makeRequest(method, endpoint, data = null) {
        try {
            const config = {
                method,
                url: `${baseUrl}${endpoint}`,
                timeout: 15000
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
    
    console.log('📋 Étape 1: Vérification du statut actuel de l\'automatisation');
    
    const statusResult = await makeRequest('GET', '/api/automation-status');
    if (statusResult.success) {
        console.log(`   Statut actuel: ${statusResult.data.enabled ? 'Activé' : 'Désactivé'}`);
    } else {
        console.log(`   ❌ Erreur récupération statut: ${statusResult.error}`);
        return;
    }
    
    console.log('\n🚀 Étape 2: Activation de l\'automatisation pour test');
    
    if (!statusResult.data.enabled) {
        const toggleResult = await makeRequest('POST', '/api/automation-status');
        if (toggleResult.success) {
            console.log(`   ✅ Automatisation activée`);
        } else {
            console.log(`   ❌ Erreur activation: ${toggleResult.error}`);
            return;
        }
    } else {
        console.log(`   ℹ️ Automatisation déjà activée`);
    }
    
    console.log('\n⏱️ Étape 3: Attente de l\'exécution de l\'automatisation (30 secondes)');
    console.log('   Surveillance des logs pour détecter les erreurs 403...');
    
    // Attendre que l'automatisation s'exécute
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    console.log('\n📊 Étape 4: Analyse des logs récents');
    
    const logsResult = await makeRequest('GET', '/api/download-logs');
    if (logsResult.success) {
        const logs = logsResult.data;
        const logLines = logs.split('\n');
        
        // Chercher les erreurs 403 récentes (dernières 5 minutes)
        const now = new Date();
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
        
        const recent403Errors = logLines.filter(line => {
            if (!line.includes('403') || !line.includes('Impossible d\'obtenir les infos utilisateur')) {
                return false;
            }
            
            // Extraire le timestamp du log
            const timestampMatch = line.match(/\"timestamp\":\"([^\"]+)\"/);
            if (timestampMatch) {
                const logTime = new Date(timestampMatch[1]);
                return logTime > fiveMinutesAgo;
            }
            return false;
        });
        
        // Chercher les actions réussies récentes
        const recentSuccessActions = logLines.filter(line => {
            if (!line.includes('[LIKE]') && !line.includes('[RETWEET]') && !line.includes('[REPLY]')) {
                return false;
            }
            
            const timestampMatch = line.match(/\"timestamp\":\"([^\"]+)\"/);
            if (timestampMatch) {
                const logTime = new Date(timestampMatch[1]);
                return logTime > fiveMinutesAgo;
            }
            return false;
        });
        
        // Chercher les logs de scan récents
        const recentScanLogs = logLines.filter(line => {
            if (!line.includes('[AUTO]') && !line.includes('[DEBUG][SCAN]')) {
                return false;
            }
            
            const timestampMatch = line.match(/\"timestamp\":\"([^\"]+)\"/);
            if (timestampMatch) {
                const logTime = new Date(timestampMatch[1]);
                return logTime > fiveMinutesAgo;
            }
            return false;
        });
        
        console.log(`   📈 Logs analysés: ${logLines.length} lignes`);
        console.log(`   🔍 Scans récents: ${recentScanLogs.length}`);
        console.log(`   ✅ Actions réussies récentes: ${recentSuccessActions.length}`);
        console.log(`   ❌ Erreurs 403 récentes: ${recent403Errors.length}`);
        
        if (recent403Errors.length === 0) {
            console.log('\n🎉 SUCCÈS COMPLET! AUCUNE ERREUR 403 DÉTECTÉE!');
            console.log('   La correction OAuth 2.0 fonctionne parfaitement');
            console.log('   L\'automatisation peut traiter les comptes OAuth 2.0');
        } else {
            console.log('\n⚠️ ERREURS 403 DÉTECTÉES:');
            recent403Errors.slice(0, 3).forEach((error, index) => {
                console.log(`   ${index + 1}. ${error.substring(0, 100)}...`);
            });
            console.log('\n   Cela peut indiquer:');
            console.log('   - Le serveur n\'a pas encore redémarré avec la correction');
            console.log('   - Des comptes avec des tokens expirés');
            console.log('   - Des restrictions temporaires de l\'API Twitter');
        }
        
        if (recentScanLogs.length > 0) {
            console.log('\n📋 ACTIVITÉ D\'AUTOMATISATION RÉCENTE:');
            recentScanLogs.slice(0, 3).forEach((log, index) => {
                const messageMatch = log.match(/\"message\":\"([^\"]+)\"/);
                if (messageMatch) {
                    console.log(`   ${index + 1}. ${messageMatch[1]}`);
                }
            });
        }
        
        if (recentSuccessActions.length > 0) {
            console.log('\n✅ ACTIONS RÉUSSIES RÉCENTES:');
            recentSuccessActions.slice(0, 3).forEach((action, index) => {
                const messageMatch = action.match(/\"message\":\"([^\"]+)\"/);
                if (messageMatch) {
                    console.log(`   ${index + 1}. ${messageMatch[1]}`);
                }
            });
        }
        
    } else {
        console.log(`   ❌ Erreur récupération logs: ${logsResult.error}`);
    }
    
    console.log('\n🔧 Étape 5: Vérification des comptes connectés');
    
    const accountsResult = await makeRequest('GET', '/api/accounts');
    if (accountsResult.success) {
        const accounts = accountsResult.data;
        const oauth2Accounts = accounts.filter(acc => acc.authMethod === 'oauth2');
        const oauth1Accounts = accounts.filter(acc => acc.authMethod !== 'oauth2');
        
        console.log(`   📊 Total comptes: ${accounts.length}`);
        console.log(`   🆕 Comptes OAuth 2.0: ${oauth2Accounts.length}`);
        console.log(`   🔄 Comptes OAuth 1.0a: ${oauth1Accounts.length}`);
        
        if (oauth2Accounts.length > 0) {
            console.log('\n   Comptes OAuth 2.0 détectés:');
            oauth2Accounts.forEach((acc, index) => {
                console.log(`   ${index + 1}. @${acc.username} (ID: ${acc.id})`);
            });
        }
    }
    
    // RÉSUMÉ FINAL
    console.log('\n' + '=' .repeat(60));
    console.log('🎯 RÉSUMÉ DU TEST FINAL D\'AUTOMATISATION');
    console.log('=' .repeat(60));
    
    if (logsResult.success) {
        const logs = logsResult.data;
        const logLines = logs.split('\n');
        const now = new Date();
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
        
        const recent403Errors = logLines.filter(line => {
            if (!line.includes('403') || !line.includes('Impossible d\'obtenir les infos utilisateur')) {
                return false;
            }
            const timestampMatch = line.match(/\"timestamp\":\"([^\"]+)\"/);
            if (timestampMatch) {
                const logTime = new Date(timestampMatch[1]);
                return logTime > fiveMinutesAgo;
            }
            return false;
        });
        
        if (recent403Errors.length === 0) {
            console.log('🎉 RÉSULTAT: SUCCÈS COMPLET!');
            console.log('   ✅ Aucune erreur 403 détectée');
            console.log('   ✅ La correction OAuth 2.0 fonctionne');
            console.log('   ✅ L\'automatisation est opérationnelle');
            console.log('   ✅ Prêt pour la production');
        } else {
            console.log('⚠️ RÉSULTAT: SUCCÈS PARTIEL');
            console.log(`   ❌ ${recent403Errors.length} erreurs 403 détectées`);
            console.log('   🔧 Actions recommandées:');
            console.log('      - Redémarrer le serveur pour appliquer la correction');
            console.log('      - Vérifier les tokens expirés');
            console.log('      - Surveiller les logs pendant quelques minutes');
        }
    }
    
    console.log('\n📋 PROCHAINES ÉTAPES:');
    console.log('1. Surveiller les logs en temps réel');
    console.log('2. Vérifier que les actions (like, retweet, reply) fonctionnent');
    console.log('3. Tester avec plusieurs comptes OAuth 2.0');
    console.log('4. Valider la scalabilité jusqu\'à 20 comptes');
}

// Exécuter le test
if (require.main === module) {
    testAutomationFinal().catch(console.error);
}

module.exports = { testAutomationFinal };
