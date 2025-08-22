require('dotenv').config();
const { getOAuth2Manager } = require('./services/oauth2-manager');

/**
 * TEST DE DIAGNOSTIC - COMPTES POUR L'AUTOMATISATION
 * 
 * Ce script identifie pourquoi l'automatisation ne voit pas les comptes OAuth 2.0
 */

async function testAutomationAccounts() {
    console.log('🔍 DIAGNOSTIC - COMPTES POUR L\'AUTOMATISATION\n');
    
    // Test 1: Vérifier les comptes OAuth 2.0
    console.log('1️⃣ Comptes OAuth 2.0 disponibles...');
    try {
        const oauth2Manager = getOAuth2Manager();
        const oauth2Users = oauth2Manager.getAllUsers();
        
        console.log(`   📊 Nombre de comptes OAuth 2.0: ${oauth2Users.length}`);
        oauth2Users.forEach(user => {
            console.log(`   ✅ @${user.username} (ID: ${user.id}, connecté: ${user.connectedAt})`);
        });
        
        if (oauth2Users.length === 0) {
            console.log('   ⚠️  Aucun compte OAuth 2.0 trouvé');
        }
        
    } catch (error) {
        console.log(`   ❌ Erreur OAuth 2.0: ${error.message}`);
    }
    
    // Test 2: Vérifier les comptes OAuth 1.0a
    console.log('\n2️⃣ Comptes OAuth 1.0a disponibles...');
    try {
        const oauth1aAccounts = global.accounts || [];
        
        console.log(`   📊 Nombre de comptes OAuth 1.0a: ${oauth1aAccounts.length}`);
        oauth1aAccounts.forEach(acc => {
            console.log(`   ✅ @${acc.username} (ID: ${acc.id}, méthode: ${acc.authMethod || 'oauth1a'})`);
        });
        
        if (oauth1aAccounts.length === 0) {
            console.log('   ⚠️  Aucun compte OAuth 1.0a trouvé');
        }
        
    } catch (error) {
        console.log(`   ❌ Erreur OAuth 1.0a: ${error.message}`);
    }
    
    // Test 3: Fonction hybride de récupération
    console.log('\n3️⃣ Test de la fonction hybride...');
    try {
        // Simuler la fonction getAllConnectedAccounts
        function getAllConnectedAccounts() {
            let allAccounts = [];
            
            // 1. Comptes OAuth 1.0a (existants)
            if (global.accounts && global.accounts.length > 0) {
                allAccounts = [...global.accounts];
            }
            
            // 2. Comptes OAuth 2.0 (nouveaux)
            const oauth2Manager = getOAuth2Manager();
            const oauth2Users = oauth2Manager.getAllUsers();
            oauth2Users.forEach(user => {
                // Vérifier si le compte n'est pas déjà présent (éviter les doublons)
                const exists = allAccounts.find(acc => acc.id === user.id);
                if (!exists) {
                    allAccounts.push({
                        id: user.id,
                        username: user.username,
                        name: user.name,
                        avatar: user.name.charAt(0).toUpperCase(),
                        accessToken: user.accessToken,
                        accessSecret: null, // OAuth 2.0 n'utilise pas de secret
                        addedAt: user.connectedAt,
                        authMethod: 'oauth2',
                        projectId: user.projectId
                    });
                }
            });
            
            return allAccounts;
        }
        
        const allAccounts = getAllConnectedAccounts();
        
        console.log(`   📊 TOTAL comptes hybrides: ${allAccounts.length}`);
        allAccounts.forEach(acc => {
            console.log(`   ✅ @${acc.username} (${acc.authMethod || 'oauth1a'})`);
        });
        
        if (allAccounts.length === 0) {
            console.log('   ❌ PROBLÈME: Aucun compte trouvé par la fonction hybride');
        } else {
            console.log(`   ✅ SOLUTION: ${allAccounts.length} comptes disponibles pour l'automatisation`);
        }
        
    } catch (error) {
        console.log(`   ❌ Erreur fonction hybride: ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(60));
    
    // Recommandations
    console.log('\n💡 DIAGNOSTIC ET SOLUTION:');
    
    const oauth2Manager = getOAuth2Manager();
    const oauth2Count = oauth2Manager.getAllUsers().length;
    const oauth1aCount = (global.accounts || []).length;
    
    if (oauth2Count > 0 && oauth1aCount === 0) {
        console.log('\n🎯 PROBLÈME IDENTIFIÉ:');
        console.log('   - Comptes OAuth 2.0 présents mais non utilisés par l\'automatisation');
        console.log('   - L\'automatisation utilise probablement une variable locale "accounts"');
        console.log('   - Cette variable ne contient que les comptes OAuth 1.0a');
        
        console.log('\n🔧 SOLUTION:');
        console.log('   1. Modifier l\'injection de dépendances dans l\'automatisation');
        console.log('   2. Utiliser getAllConnectedAccounts() au lieu de la variable "accounts"');
        console.log('   3. Redémarrer l\'automatisation pour prendre en compte les nouveaux comptes');
        
    } else if (oauth2Count === 0 && oauth1aCount === 0) {
        console.log('\n⚠️  AUCUN COMPTE CONNECTÉ:');
        console.log('   - Connectez au moins un compte via OAuth 2.0 ou OAuth 1.0a');
        
    } else {
        console.log('\n✅ COMPTES DISPONIBLES:');
        console.log(`   - OAuth 1.0a: ${oauth1aCount} comptes`);
        console.log(`   - OAuth 2.0: ${oauth2Count} comptes`);
        console.log('   - L\'automatisation devrait fonctionner');
    }
}

testAutomationAccounts().catch(console.error);
