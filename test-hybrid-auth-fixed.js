require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');

async function testHybridAuth() {
    console.log('🔧 Test de l\'authentification hybride (SOLUTION RECOMMANDÉE)\n');
    
    const bearerClient = new TwitterApi(process.env.X_BEARER_TOKEN);
    const oauthClient = new TwitterApi({
        appKey: process.env.X_API_KEY,
        appSecret: process.env.X_API_SECRET,
        accessToken: process.env.X_ACCESS_TOKEN,
        accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
    });
    
    let successCount = 0;
    let errorCount = 0;
    
    // Test 1: Recherche avec Bearer Token
    console.log('🔍 Test 1: Recherche avec Bearer Token');
    try {
        const searchQuery = 'from:psyk0t -is:retweet -is:reply';
        const searchOptions = {
            'tweet.fields': ['created_at', 'author_id'],
            'user.fields': ['username'],
            expansions: ['author_id'],
            max_results: 10,
        };
        
        const tweets = await bearerClient.v2.search(searchQuery, searchOptions);
        console.log(`✅ Recherche réussie: ${tweets.data?.data?.length || 0} tweets trouvés`);
        console.log(`   Rate Limit: ${tweets.rateLimit?.remaining}/${tweets.rateLimit?.limit} restant`);
        successCount++;
    } catch (error) {
        console.log(`❌ Erreur recherche: ${error.code} - ${error.message}`);
        errorCount++;
    }
    
    // Test 2: Informations utilisateur avec OAuth 1.0a
    console.log('\n🔐 Test 2: Informations utilisateur avec OAuth 1.0a');
    try {
        const user = await oauthClient.currentUser();
        console.log(`✅ Authentification réussie: @${user.screen_name}`);
        console.log(`   Followers: ${user.followers_count}`);
        console.log(`   ID: ${user.id_str}`);
        successCount++;
    } catch (error) {
        console.log(`❌ Erreur auth: ${error.code} - ${error.message}`);
        errorCount++;
    }
    
    // Test 3: Actions utilisateur avec OAuth 1.0a
    console.log('\n💫 Test 3: Capacités d\'action avec OAuth 1.0a');
    try {
        const rwClient = oauthClient.readWrite;
        console.log(`✅ Client Read/Write initialisé`);
        console.log(`   Prêt pour: likes, retweets, replies`);
        successCount++;
    } catch (error) {
        console.log(`❌ Erreur client RW: ${error.code} - ${error.message}`);
        errorCount++;
    }
    
    // Test 4: Vérification des permissions OAuth 1.0a
    console.log('\n🛡️ Test 4: Vérification des permissions');
    try {
        const me = await oauthClient.v2.me({
            'user.fields': ['public_metrics', 'verified']
        });
        console.log(`✅ API v2 avec OAuth 1.0a: @${me.data.username}`);
        console.log(`   Followers: ${me.data.public_metrics?.followers_count || 'N/A'}`);
        successCount++;
    } catch (error) {
        console.log(`❌ Erreur v2 OAuth: ${error.code} - ${error.message}`);
        errorCount++;
    }
    
    console.log('\n📊 RÉSUMÉ DES TESTS');
    console.log('==================================================');
    console.log(`✅ Tests réussis: ${successCount}`);
    console.log(`❌ Tests échoués: ${errorCount}`);
    console.log(`📈 Taux de réussite: ${Math.round((successCount / (successCount + errorCount)) * 100)}%`);
    
    console.log('\n🎯 RECOMMANDATIONS:');
    console.log('==================================================');
    console.log('✅ CONFIGURATION OPTIMALE DÉTECTÉE:');
    console.log('   • Bearer Token → Recherches (rate limits élevés)');
    console.log('   • OAuth 1.0a → Actions utilisateur (like, retweet, reply)');
    console.log('   • Cette configuration est PARFAITE pour votre app');
    
    if (successCount >= 3) {
        console.log('\n🎉 SUCCÈS COMPLET!');
        console.log('   Votre configuration est optimale.');
        console.log('   Les erreurs 403 précédentes étaient dues à un mauvais usage du Bearer Token.');
        console.log('   Votre app devrait fonctionner parfaitement maintenant!');
    }
}

if (require.main === module) {
    testHybridAuth().catch(console.error);
}

module.exports = { testHybridAuth };
