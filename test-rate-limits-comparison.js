require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');

async function compareRateLimits() {
    console.log('🔍 Comparaison des rate limits OAuth 1.0a vs OAuth 2.0\n');
    
    // Test OAuth 1.0a (votre configuration actuelle)
    console.log('📊 OAuth 1.0a (configuration actuelle) :');
    try {
        const clientOAuth1 = new TwitterApi({
            appKey: process.env.X_API_KEY,
            appSecret: process.env.X_API_SECRET,
            accessToken: process.env.X_ACCESS_TOKEN,
            accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
        });
        
        // Test recherche avec rate limit info
        const searchResult1 = await clientOAuth1.v2.search('from:psyk0t', {
            max_results: 10,
            'tweet.fields': ['created_at']
        });
        
        console.log(`   ✅ Recherche réussie - ${searchResult1.data?.data?.length || 0} tweets`);
        console.log(`   📈 Rate limit restant: ${searchResult1.rateLimit?.remaining}/${searchResult1.rateLimit?.limit}`);
        console.log(`   ⏰ Reset dans: ${Math.round((searchResult1.rateLimit?.reset - Date.now()/1000)/60)} minutes`);
        
    } catch (error) {
        console.log(`   ❌ Erreur OAuth 1.0a: ${error.code} - ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    // Test OAuth 2.0 (Bearer Token)
    console.log('📊 OAuth 2.0 (Bearer Token) :');
    try {
        const clientOAuth2 = new TwitterApi(process.env.X_BEARER_TOKEN);
        
        const searchResult2 = await clientOAuth2.v2.search('from:psyk0t', {
            max_results: 10,
            'tweet.fields': ['created_at']
        });
        
        console.log(`   ✅ Recherche réussie - ${searchResult2.data?.data?.length || 0} tweets`);
        console.log(`   📈 Rate limit restant: ${searchResult2.rateLimit?.remaining}/${searchResult2.rateLimit?.limit}`);
        console.log(`   ⏰ Reset dans: ${Math.round((searchResult2.rateLimit?.reset - Date.now()/1000)/60)} minutes`);
        
    } catch (error) {
        console.log(`   ❌ Erreur OAuth 2.0: ${error.code} - ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    // Recommandations
    console.log('💡 RECOMMANDATIONS :');
    console.log('');
    console.log('✅ OAuth 1.0a (actuel) si :');
    console.log('   - Vos rate limits actuels sont suffisants');
    console.log('   - Vous voulez la simplicité');
    console.log('   - Votre automatisation fonctionne bien');
    console.log('');
    console.log('🚀 OAuth 2.0 si :');
    console.log('   - Vous voulez plus de rate limits');
    console.log('   - Vous planifiez une montée en charge');
    console.log('   - Vous voulez accès aux nouvelles fonctionnalités');
    console.log('');
    console.log('🎯 VERDICT : Testez les deux et comparez les limites !');
}

compareRateLimits().catch(console.error);
