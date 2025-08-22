require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');

/**
 * Script de test pour valider l'utilisation correcte de l'API v2 de Twitter
 * et diagnostiquer les erreurs 403
 */

async function testTwitterAPIv2() {
    console.log('🔍 Test de l\'API v2 de Twitter...\n');
    
    // Vérification des variables d'environnement
    const requiredEnvVars = [
        'X_API_KEY',
        'X_API_SECRET', 
        'X_ACCESS_TOKEN',
        'X_ACCESS_TOKEN_SECRET',
        'X_BEARER_TOKEN'
    ];
    
    console.log('📋 Vérification des variables d\'environnement:');
    for (const envVar of requiredEnvVars) {
        const value = process.env[envVar];
        if (value) {
            console.log(`✅ ${envVar}: ${value.substring(0, 10)}...`);
        } else {
            console.log(`❌ ${envVar}: MANQUANT`);
            return;
        }
    }
    console.log('');
    
    // Test 1: Authentification avec Bearer Token (API v2)
    console.log('🔐 Test 1: Authentification Bearer Token (API v2)');
    try {
        const bearerClient = new TwitterApi(process.env.X_BEARER_TOKEN);
        const me = await bearerClient.v2.me();
        console.log(`✅ Authentification réussie: @${me.data.username} (ID: ${me.data.id})`);
        console.log(`   Nom: ${me.data.name}`);
    } catch (error) {
        console.log(`❌ Erreur d'authentification Bearer: ${error.code || error.status} - ${error.message}`);
        if (error.code === 403) {
            console.log('   💡 Erreur 403: Vérifiez les permissions de votre app Twitter');
            console.log('   💡 Assurez-vous d\'avoir "Read and Write" permissions');
        }
    }
    console.log('');
    
    // Test 2: Authentification OAuth 1.0a (pour les actions)
    console.log('🔐 Test 2: Authentification OAuth 1.0a');
    try {
        const oauthClient = new TwitterApi({
            appKey: process.env.X_API_KEY,
            appSecret: process.env.X_API_SECRET,
            accessToken: process.env.X_ACCESS_TOKEN,
            accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
        });
        
        const user = await oauthClient.currentUser();
        console.log(`✅ OAuth réussi: @${user.screen_name} (ID: ${user.id_str})`);
        console.log(`   Followers: ${user.followers_count}`);
    } catch (error) {
        console.log(`❌ Erreur OAuth: ${error.code || error.status} - ${error.message}`);
        if (error.code === 403) {
            console.log('   💡 Erreur 403: Tokens OAuth invalides ou permissions insuffisantes');
        }
    }
    console.log('');
    
    // Test 3: Recherche de tweets (API v2)
    console.log('🔍 Test 3: Recherche de tweets (API v2)');
    try {
        const searchClient = new TwitterApi(process.env.X_BEARER_TOKEN);
        const searchResult = await searchClient.v2.search('from:psyk0t', {
            max_results: 5,
            'tweet.fields': ['created_at', 'author_id', 'public_metrics']
        });
        
        console.log(`✅ Recherche réussie: ${searchResult.data?.data?.length || 0} tweets trouvés`);
        if (searchResult.data?.data?.length > 0) {
            const tweet = searchResult.data.data[0];
            console.log(`   Premier tweet: "${tweet.text.substring(0, 50)}..."`);
        }
    } catch (error) {
        console.log(`❌ Erreur de recherche: ${error.code || error.status} - ${error.message}`);
        if (error.code === 403) {
            console.log('   💡 Erreur 403: Accès refusé pour la recherche');
        }
    }
    console.log('');
    
    // Test 4: Limites de taux (Rate Limits)
    console.log('📊 Test 4: Vérification des limites de taux');
    try {
        const rateLimitClient = new TwitterApi(process.env.X_BEARER_TOKEN);
        const searchResult = await rateLimitClient.v2.search('test', { max_results: 10 });
        
        if (searchResult.rateLimit) {
            const { limit, remaining, reset } = searchResult.rateLimit;
            console.log(`✅ Rate Limit Info:`);
            console.log(`   Limite: ${limit}`);
            console.log(`   Restant: ${remaining}`);
            console.log(`   Reset: ${new Date(reset * 1000).toLocaleString()}`);
            
            if (remaining < 10) {
                console.log('   ⚠️  ATTENTION: Peu de requêtes restantes!');
            }
        }
    } catch (error) {
        console.log(`❌ Erreur rate limit: ${error.code || error.status} - ${error.message}`);
    }
    console.log('');
    
    // Recommandations
    console.log('💡 Recommandations pour éviter les erreurs 403:');
    console.log('1. Vérifiez les permissions de votre app dans le Twitter Developer Portal');
    console.log('2. Assurez-vous d\'avoir "Read and Write" permissions minimum');
    console.log('3. Utilisez des délais plus longs entre les actions (2-5 minutes)');
    console.log('4. Surveillez les rate limits et respectez-les');
    console.log('5. Vérifiez que vos tokens ne sont pas expirés');
    console.log('');
    
    console.log('✅ Test terminé!');
}

// Exécuter le test
if (require.main === module) {
    testTwitterAPIv2().catch(console.error);
}

module.exports = { testTwitterAPIv2 };
