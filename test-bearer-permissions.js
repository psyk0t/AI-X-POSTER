require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');

/**
 * Test spécifique pour diagnostiquer les permissions Bearer Token
 */

async function testBearerPermissions() {
    console.log('🔍 Diagnostic des permissions Bearer Token\n');
    
    const bearerClient = new TwitterApi(process.env.X_BEARER_TOKEN);
    
    // Test 1: Informations de base (devrait marcher)
    console.log('📋 Test 1: Informations utilisateur de base');
    try {
        const me = await bearerClient.v2.me();
        console.log(`✅ Succès: @${me.data.username} (ID: ${me.data.id})`);
    } catch (error) {
        console.log(`❌ Échec: ${error.code} - ${error.message}`);
        console.log(`   Détails: ${JSON.stringify(error.data || {}, null, 2)}`);
    }
    
    // Test 2: Informations étendues (peut échouer selon permissions)
    console.log('\n🔐 Test 2: Informations utilisateur étendues');
    try {
        const me = await bearerClient.v2.me({
            'user.fields': ['created_at', 'description', 'public_metrics', 'verified']
        });
        console.log(`✅ Succès: Informations étendues récupérées`);
        console.log(`   Followers: ${me.data.public_metrics?.followers_count || 'N/A'}`);
    } catch (error) {
        console.log(`❌ Échec: ${error.code} - ${error.message}`);
        console.log(`   Détails: ${JSON.stringify(error.data || {}, null, 2)}`);
    }
    
    // Test 3: Recherche simple (devrait marcher)
    console.log('\n🔍 Test 3: Recherche simple');
    try {
        const tweets = await bearerClient.v2.search('hello', { max_results: 10 });
        console.log(`✅ Succès: ${tweets.data?.data?.length || 0} tweets trouvés`);
    } catch (error) {
        console.log(`❌ Échec: ${error.code} - ${error.message}`);
        console.log(`   Détails: ${JSON.stringify(error.data || {}, null, 2)}`);
    }
    
    // Test 4: Vérification des rate limits
    console.log('\n⏱️ Test 4: Rate limits');
    try {
        const response = await bearerClient.v2.search('test', { max_results: 10 });
        const rateLimit = response.rateLimit;
        if (rateLimit) {
            console.log(`✅ Rate limit info disponible:`);
            console.log(`   Limite: ${rateLimit.limit}`);
            console.log(`   Restant: ${rateLimit.remaining}`);
            console.log(`   Reset: ${new Date(rateLimit.reset * 1000).toLocaleString()}`);
        } else {
            console.log(`⚠️ Pas d'info de rate limit disponible`);
        }
    } catch (error) {
        console.log(`❌ Échec: ${error.code} - ${error.message}`);
    }
    
    console.log('\n📋 DIAGNOSTIC COMPLET');
    console.log('==================================================');
    console.log('Si tous les tests échouent avec 403:');
    console.log('1. Vérifiez les permissions dans le dashboard Twitter');
    console.log('2. Changez vers "Read and write and Direct message"');
    console.log('3. Régénérez vos tokens');
    console.log('4. Mettez à jour votre .env');
    console.log('\nSi seuls certains tests échouent:');
    console.log('1. Les permissions de base sont OK');
    console.log('2. Certaines fonctions nécessitent des permissions étendues');
}

// Exécuter le test
if (require.main === module) {
    testBearerPermissions().catch(console.error);
}

module.exports = { testBearerPermissions };
