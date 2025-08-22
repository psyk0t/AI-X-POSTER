require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');

/**
 * Test des différentes méthodes d'authentification pour l'API v2
 * Pour diagnostiquer les erreurs 403 persistantes
 */

async function testAuthMethods() {
    console.log('🔐 Test des méthodes d\'authentification API v2\n');
    
    // Vérifier les variables d'environnement disponibles
    console.log('📋 Variables d\'environnement disponibles:');
    const envVars = [
        'X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 
        'X_ACCESS_TOKEN_SECRET', 'X_BEARER_TOKEN',
        'X_CLIENT_ID', 'X_CLIENT_SECRET'
    ];
    
    const availableVars = {};
    envVars.forEach(varName => {
        const value = process.env[varName];
        if (value) {
            console.log(`✅ ${varName}: ${value.substring(0, 10)}...`);
            availableVars[varName] = value;
        } else {
            console.log(`❌ ${varName}: MANQUANT`);
        }
    });
    console.log('');
    
    // Test 1: Bearer Token (API v2 - lecture seule)
    console.log('🔍 Test 1: Bearer Token (lecture seule)');
    if (availableVars.X_BEARER_TOKEN) {
        try {
            const bearerClient = new TwitterApi(availableVars.X_BEARER_TOKEN);
            const me = await bearerClient.v2.me();
            console.log(`✅ Bearer Token OK: @${me.data.username} (ID: ${me.data.id})`);
            
            // Test de recherche
            const searchResult = await bearerClient.v2.search('from:psyk0t', { max_results: 3 });
            console.log(`✅ Recherche OK: ${searchResult.data?.data?.length || 0} tweets trouvés`);
            
        } catch (error) {
            console.log(`❌ Bearer Token ÉCHEC: ${error.code} - ${error.message}`);
        }
    } else {
        console.log('❌ Bearer Token manquant');
    }
    console.log('');
    
    // Test 2: OAuth 1.0a (API v1/v2 - lecture/écriture)
    console.log('🔍 Test 2: OAuth 1.0a (lecture/écriture)');
    if (availableVars.X_API_KEY && availableVars.X_API_SECRET && 
        availableVars.X_ACCESS_TOKEN && availableVars.X_ACCESS_TOKEN_SECRET) {
        try {
            const oauthClient = new TwitterApi({
                appKey: availableVars.X_API_KEY,
                appSecret: availableVars.X_API_SECRET,
                accessToken: availableVars.X_ACCESS_TOKEN,
                accessSecret: availableVars.X_ACCESS_TOKEN_SECRET,
            });
            
            // Test avec API v1 (plus permissive)
            const userV1 = await oauthClient.currentUser();
            console.log(`✅ OAuth 1.0a (v1) OK: @${userV1.screen_name}`);
            
            // Test avec API v2
            try {
                const meV2 = await oauthClient.v2.me();
                console.log(`✅ OAuth 1.0a (v2) OK: @${meV2.data.username}`);
            } catch (v2Error) {
                console.log(`❌ OAuth 1.0a (v2) ÉCHEC: ${v2Error.code} - ${v2Error.message}`);
                console.log('   💡 Cela suggère que OAuth 1.0a n\'est pas suffisant pour l\'API v2');
            }
            
        } catch (error) {
            console.log(`❌ OAuth 1.0a ÉCHEC: ${error.code} - ${error.message}`);
        }
    } else {
        console.log('❌ Tokens OAuth 1.0a manquants');
    }
    console.log('');
    
    // Test 3: OAuth 2.0 (API v2 - moderne)
    console.log('🔍 Test 3: OAuth 2.0 avec Client ID/Secret');
    if (availableVars.X_CLIENT_ID && availableVars.X_CLIENT_SECRET) {
        try {
            const oauth2Client = new TwitterApi({
                clientId: availableVars.X_CLIENT_ID,
                clientSecret: availableVars.X_CLIENT_SECRET,
            });
            
            console.log('✅ Client OAuth 2.0 créé');
            console.log('   💡 Pour les actions, il faudrait un Access Token OAuth 2.0');
            console.log('   💡 Différent des tokens OAuth 1.0a');
            
        } catch (error) {
            console.log(`❌ OAuth 2.0 ÉCHEC: ${error.code} - ${error.message}`);
        }
    } else {
        console.log('❌ Client ID/Secret manquants');
        console.log('   💡 Vous devriez les ajouter à votre .env:');
        console.log('   X_CLIENT_ID=votre_client_id');
        console.log('   X_CLIENT_SECRET=votre_client_secret');
    }
    console.log('');
    
    // Recommandations basées sur les résultats
    console.log('💡 RECOMMANDATIONS:');
    console.log('='.repeat(50));
    
    if (!availableVars.X_CLIENT_ID || !availableVars.X_CLIENT_SECRET) {
        console.log('🔧 SOLUTION PROBABLE:');
        console.log('1. Allez sur https://developer.twitter.com/en/portal/dashboard');
        console.log('2. Sélectionnez votre app');
        console.log('3. Onglet "Keys and tokens"');
        console.log('4. Copiez le "Client ID" et "Client Secret"');
        console.log('5. Ajoutez-les à votre .env:');
        console.log('   X_CLIENT_ID=votre_client_id');
        console.log('   X_CLIENT_SECRET=votre_client_secret');
        console.log('');
        console.log('📝 Pour l\'API v2, Twitter recommande OAuth 2.0 plutôt qu\'OAuth 1.0a');
    }
    
    if (availableVars.X_BEARER_TOKEN) {
        console.log('✅ Votre Bearer Token fonctionne pour la lecture');
        console.log('❌ Mais il ne permet pas les actions (like, retweet, reply)');
        console.log('💡 Il faut OAuth 2.0 pour les actions d\'écriture en API v2');
    }
    
    console.log('');
    console.log('🔗 Documentation officielle:');
    console.log('   https://developer.twitter.com/en/docs/authentication/oauth-2-0');
    
    console.log('\n✅ Test terminé!');
}

// Exécuter le test
if (require.main === module) {
    testAuthMethods().catch(console.error);
}

module.exports = { testAuthMethods };
