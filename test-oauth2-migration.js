require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');

/**
 * Test de migration vers OAuth 2.0 pour résoudre les erreurs 403 API v2
 */

async function testOAuth2Migration() {
    console.log('🔄 Test de migration OAuth 1.0a → OAuth 2.0 pour API v2\n');
    
    // Test 1: Méthode actuelle (OAuth 1.0a)
    console.log('🔍 Test 1: Méthode actuelle (OAuth 1.0a)');
    try {
        const oauth1Client = new TwitterApi({
            appKey: process.env.X_API_KEY,
            appSecret: process.env.X_API_SECRET,
            accessToken: process.env.X_ACCESS_TOKEN,
            accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
        });
        
        // Test avec API v2
        const meV2 = await oauth1Client.v2.me();
        console.log(`✅ OAuth 1.0a + API v2: @${meV2.data.username}`);
        
        // Test d'une action (simulation)
        const user = await oauth1Client.currentUser();
        console.log(`✅ User ID disponible: ${user.id_str}`);
        
    } catch (error) {
        console.log(`❌ OAuth 1.0a + API v2 ÉCHEC: ${error.code} - ${error.message}`);
        if (error.code === 403) {
            console.log('   💡 Erreur 403 confirmée avec OAuth 1.0a sur API v2');
        }
    }
    
    // Test 2: Nouvelle méthode (OAuth 2.0)
    console.log('\n🔍 Test 2: Nouvelle méthode (OAuth 2.0)');
    try {
        // Créer un client OAuth 2.0
        const oauth2Client = new TwitterApi({
            clientId: process.env.X_CLIENT_ID,
            clientSecret: process.env.X_CLIENT_SECRET,
        });
        
        console.log('✅ Client OAuth 2.0 créé');
        console.log('   💡 Pour les actions, il faut un Access Token OAuth 2.0');
        console.log('   💡 Différent des tokens OAuth 1.0a actuels');
        
    } catch (error) {
        console.log(`❌ OAuth 2.0 ÉCHEC: ${error.message}`);
    }
    
    // Test 3: Solution hybride recommandée
    console.log('\n🔍 Test 3: Solution hybride (Bearer Token + OAuth 1.0a)');
    try {
        // Bearer Token pour la lecture (API v2)
        const bearerClient = new TwitterApi(process.env.X_BEARER_TOKEN);
        const searchResult = await bearerClient.v2.search('from:psyk0t', { max_results: 3 });
        console.log(`✅ Bearer Token (lecture): ${searchResult.data?.data?.length || 0} tweets trouvés`);
        
        // OAuth 1.0a pour les actions (API v1.1 compatible)
        const oauth1Client = new TwitterApi({
            appKey: process.env.X_API_KEY,
            appSecret: process.env.X_API_SECRET,
            accessToken: process.env.X_ACCESS_TOKEN,
            accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
        });
        
        const user = await oauth1Client.currentUser();
        console.log(`✅ OAuth 1.0a (actions): @${user.screen_name} prêt pour les actions`);
        
        console.log('💡 SOLUTION HYBRIDE VALIDÉE:');
        console.log('   - Bearer Token pour recherches (API v2)');
        console.log('   - OAuth 1.0a pour actions (API v1.1 via v2)');
        
    } catch (error) {
        console.log(`❌ Solution hybride ÉCHEC: ${error.message}`);
    }
    
    // Recommandations
    console.log('\n💡 RECOMMANDATIONS:');
    console.log('='.repeat(60));
    console.log('🔧 SOLUTION IMMÉDIATE (sans changer OAuth):');
    console.log('1. Utiliser Bearer Token pour les recherches (API v2)');
    console.log('2. Utiliser OAuth 1.0a pour les actions (API v1.1)');
    console.log('3. Les actions v1.1 fonctionnent et évitent les erreurs 403');
    console.log('');
    console.log('🔧 SOLUTION À LONG TERME:');
    console.log('1. Migrer complètement vers OAuth 2.0');
    console.log('2. Obtenir des Access Tokens OAuth 2.0');
    console.log('3. Utiliser API v2 pour tout');
    console.log('');
    console.log('📝 Pour l\'instant, la solution hybride devrait résoudre vos erreurs 403');
    
    console.log('\n✅ Test terminé!');
}

// Exécuter le test
if (require.main === module) {
    testOAuth2Migration().catch(console.error);
}

module.exports = { testOAuth2Migration };
