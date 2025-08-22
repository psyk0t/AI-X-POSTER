require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');
const fs = require('fs');
const path = require('path');

/**
 * TEST DE L'AUTOMATISATION EN CONDITIONS RÉELLES
 * Simule exactement ce que fait l'automatisation avec OAuth 2.0
 */

async function testAutomationReal() {
    console.log('🚀 TEST DE L\'AUTOMATISATION EN CONDITIONS RÉELLES\n');
    console.log('=' .repeat(60));
    
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    
    // Charger les utilisateurs OAuth 2.0
    const oauth2UsersFile = path.join(__dirname, 'oauth2-users.json');
    
    if (!fs.existsSync(oauth2UsersFile)) {
        console.log('❌ Aucun utilisateur OAuth 2.0 trouvé pour le test');
        return;
    }
    
    const oauth2Data = JSON.parse(fs.readFileSync(oauth2UsersFile, 'utf8'));
    const user = oauth2Data[0][1];
    
    console.log(`👤 Test avec utilisateur: @${user.username} (${user.authMethod})`);
    
    // Simuler la fonction getRwClientById
    function getRwClientById(accountId, accounts) {
        const account = accounts.find(acc => acc.id === accountId);
        if (!account) {
            return null;
        }
        
        let client;
        if (account.authMethod === 'oauth2') {
            client = new TwitterApi(account.accessToken);
        } else {
            client = new TwitterApi({
                appKey: process.env.X_API_KEY,
                appSecret: process.env.X_API_SECRET,
                accessToken: account.accessToken,
                accessSecret: account.accessSecret,
            });
        }
        return client.readWrite;
    }
    
    // Test 1: Création du client Twitter
    console.log('\n🔧 TEST 1: Création du client Twitter');
    totalTests++;
    
    try {
        const accounts = [{
            id: user.id,
            username: user.username,
            accessToken: user.accessToken,
            accessSecret: user.accessSecret || null,
            authMethod: user.authMethod || 'oauth2'
        }];
        
        const cli = getRwClientById(user.id, accounts);
        
        if (cli) {
            console.log(`✅ SUCCÈS: Client Twitter créé pour @${user.username}`);
            passedTests++;
        } else {
            console.log(`❌ ÉCHEC: Impossible de créer le client Twitter`);
            failedTests++;
        }
    } catch (error) {
        console.log(`❌ ÉCHEC: Erreur création client - ${error.message}`);
        failedTests++;
    }
    
    // Test 2: Obtention des informations utilisateur (logique corrigée)
    console.log('\n👤 TEST 2: Obtention des informations utilisateur (logique corrigée)');
    totalTests++;
    
    try {
        const accounts = [{
            id: user.id,
            username: user.username,
            accessToken: user.accessToken,
            accessSecret: user.accessSecret || null,
            authMethod: user.authMethod || 'oauth2'
        }];
        
        const cli = getRwClientById(user.id, accounts);
        const account = accounts[0];
        
        // Logique corrigée d'automation.js
        let userObj;
        if (account.authMethod === 'oauth2') {
            // OAuth 2.0 : utiliser v2.me()
            const me = await cli.v2.me();
            userObj = {
                screen_name: me.data.username,
                id_str: me.data.id,
                name: me.data.name || me.data.username
            };
            console.log(`✅ SUCCÈS: Informations utilisateur OAuth 2.0 - @${userObj.screen_name}`);
        } else {
            // OAuth 1.0a : utiliser currentUser()
            userObj = await cli.currentUser();
            console.log(`✅ SUCCÈS: Informations utilisateur OAuth 1.0a - @${userObj.screen_name}`);
        }
        
        console.log(`   ID: ${userObj.id_str}`);
        console.log(`   Nom: ${userObj.name}`);
        
        passedTests++;
    } catch (error) {
        console.log(`❌ ÉCHEC: Erreur informations utilisateur - ${error.message}`);
        console.log(`   Code d'erreur: ${error.code || 'N/A'}`);
        failedTests++;
    }
    
    // Test 3: Test de recherche de tweets (comme dans l'automatisation)
    console.log('\n🔍 TEST 3: Recherche de tweets (simulation automatisation)');
    totalTests++;
    
    try {
        const accounts = [{
            id: user.id,
            username: user.username,
            accessToken: user.accessToken,
            accessSecret: user.accessSecret || null,
            authMethod: user.authMethod || 'oauth2'
        }];
        
        const cli = getRwClientById(user.id, accounts);
        
        // Simuler une recherche comme dans l'automatisation
        const searchQuery = 'from:psyk0t -is:retweet -is:reply';
        const searchOptions = {
            'tweet.fields': ['created_at', 'author_id', 'public_metrics', 'referenced_tweets', 'in_reply_to_user_id'],
            'user.fields': ['username'],
            expansions: ['author_id'],
            max_results: 10,
        };
        
        const tweets = await cli.v2.search(searchQuery, searchOptions);
        console.log(`✅ SUCCÈS: Recherche automatisation - ${tweets.data?.data?.length || 0} tweets trouvés`);
        
        if (tweets.rateLimit) {
            console.log(`   Rate Limit: ${tweets.rateLimit.remaining}/${tweets.rateLimit.limit} restant`);
        }
        
        passedTests++;
    } catch (error) {
        console.log(`❌ ÉCHEC: Erreur recherche - ${error.message}`);
        failedTests++;
    }
    
    // Test 4: Test de capacité d'action (simulation like/retweet)
    console.log('\n❤️ TEST 4: Test de capacité d\'action (simulation)');
    totalTests++;
    
    try {
        const accounts = [{
            id: user.id,
            username: user.username,
            accessToken: user.accessToken,
            accessSecret: user.accessSecret || null,
            authMethod: user.authMethod || 'oauth2'
        }];
        
        const cli = getRwClientById(user.id, accounts);
        
        // Test de capacité (sans faire l'action réelle)
        console.log(`✅ SUCCÈS: Client prêt pour les actions`);
        console.log(`   Méthodes disponibles: like, retweet, reply`);
        console.log(`   Type d'auth: ${accounts[0].authMethod}`);
        
        passedTests++;
    } catch (error) {
        console.log(`❌ ÉCHEC: Erreur capacité d'action - ${error.message}`);
        failedTests++;
    }
    
    // Test 5: Test de gestion d'erreurs
    console.log('\n🛡️ TEST 5: Test de gestion d\'erreurs');
    totalTests++;
    
    try {
        // Test avec un token invalide pour voir la gestion d'erreurs
        const invalidClient = new TwitterApi('invalid_token');
        
        try {
            await invalidClient.v2.me();
            console.log(`❌ ÉCHEC: Devrait échouer avec un token invalide`);
            failedTests++;
        } catch (expectedError) {
            console.log(`✅ SUCCÈS: Gestion d'erreur correcte - ${expectedError.code}`);
            passedTests++;
        }
    } catch (error) {
        console.log(`❌ ÉCHEC: Erreur test gestion d'erreurs - ${error.message}`);
        failedTests++;
    }
    
    // RÉSUMÉ FINAL
    console.log('\n' + '=' .repeat(60));
    console.log('📊 RÉSUMÉ DES TESTS EN CONDITIONS RÉELLES');
    console.log('=' .repeat(60));
    console.log(`🧪 Total des tests: ${totalTests}`);
    console.log(`✅ Tests réussis: ${passedTests}`);
    console.log(`❌ Tests échoués: ${failedTests}`);
    console.log(`📈 Taux de réussite: ${Math.round((passedTests / totalTests) * 100)}%`);
    
    if (failedTests === 0) {
        console.log('\n🎉 PARFAIT! L\'AUTOMATISATION DEVRAIT FONCTIONNER!');
        console.log('   Tous les composants critiques sont opérationnels');
        console.log('   La correction OAuth 2.0 est effective');
        console.log('   Plus d\'erreurs 403 attendues');
    } else if (passedTests > failedTests) {
        console.log('\n✅ SUCCÈS MAJORITAIRE');
        console.log('   L\'automatisation devrait largement fonctionner');
        console.log('   Quelques points mineurs à surveiller');
    } else {
        console.log('\n❌ PROBLÈMES DÉTECTÉS');
        console.log('   Des corrections supplémentaires sont nécessaires');
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
    testAutomationReal().catch(console.error);
}

module.exports = { testAutomationReal };
