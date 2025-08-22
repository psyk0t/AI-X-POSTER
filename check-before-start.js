require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');

/**
 * Script de vérification rapide avant de lancer l'automatisation
 * À exécuter avec : node check-before-start.js
 */

async function quickCheck() {
    console.log('🔍 Vérification rapide avant lancement de l\'automatisation...\n');
    
    let allGood = true;
    
    // Test 1: Authentification (OAuth 1.0a - fonctionne avec API v2)
    console.log('1️⃣ Test d\'authentification...');
    try {
        const client = new TwitterApi({
            appKey: process.env.X_API_KEY,
            appSecret: process.env.X_API_SECRET,
            accessToken: process.env.X_ACCESS_TOKEN,
            accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
        });
        const me = await client.v2.me();
        console.log(`   ✅ OK - Connecté en tant que @${me.data.username}`);
    } catch (error) {
        console.log(`   ❌ ÉCHEC - ${error.code}: ${error.message}`);
        allGood = false;
    }
    
    // Test 2: Recherche (OAuth 1.0a - syntaxe corrigée)
    console.log('\n2️⃣ Test de recherche...');
    try {
        const client = new TwitterApi({
            appKey: process.env.X_API_KEY,
            appSecret: process.env.X_API_SECRET,
            accessToken: process.env.X_ACCESS_TOKEN,
            accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
        });
        const result = await client.v2.search('from:psyk0t', {
            max_results: 5,
            'tweet.fields': ['created_at']
        });
        console.log(`   ✅ OK - ${result.data?.data?.length || 0} tweets trouvés`);
    } catch (error) {
        console.log(`   ❌ ÉCHEC - ${error.code}: ${error.message}`);
        allGood = false;
    }
    
    // Test 3: Rate Limit
    console.log('\n3️⃣ Vérification des rate limits...');
    try {
        const client = new TwitterApi(process.env.X_BEARER_TOKEN);
        const result = await client.v2.search('test', { max_results: 1 });
        
        if (result.rateLimit) {
            const remaining = result.rateLimit.remaining;
            const limit = result.rateLimit.limit;
            const percentage = Math.round((remaining / limit) * 100);
            
            if (percentage > 50) {
                console.log(`   ✅ OK - ${remaining}/${limit} requêtes restantes (${percentage}%)`);
            } else if (percentage > 20) {
                console.log(`   ⚠️  ATTENTION - ${remaining}/${limit} requêtes restantes (${percentage}%)`);
                console.log('      Vous devriez attendre un peu avant de lancer l\'automatisation');
            } else {
                console.log(`   ❌ CRITIQUE - ${remaining}/${limit} requêtes restantes (${percentage}%)`);
                console.log('      ATTENDEZ avant de lancer l\'automatisation !');
                allGood = false;
            }
        }
    } catch (error) {
        console.log(`   ❌ ÉCHEC - Impossible de vérifier les rate limits`);
    }
    
    // Résultat final
    console.log('\n' + '='.repeat(60));
    if (allGood) {
        console.log('🎉 TOUT EST OK ! Vous pouvez lancer l\'automatisation.');
        console.log('\n📋 Prochaines étapes :');
        console.log('   1. Lancez : node server.js');
        console.log('   2. Ouvrez : http://localhost:3005');
        console.log('   3. Activez l\'automatisation dans l\'interface');
        console.log('\n💡 Surveillez les logs pour détecter d\'éventuelles erreurs 403');
    } else {
        console.log('❌ PROBLÈMES DÉTECTÉS ! Ne lancez PAS l\'automatisation.');
        console.log('\n🔧 Actions recommandées :');
        console.log('   1. Vérifiez vos tokens dans le fichier .env');
        console.log('   2. Contrôlez les permissions dans Twitter Developer Portal');
        console.log('   3. Attendez si les rate limits sont épuisés');
        console.log('   4. Relancez ce test : node check-before-start.js');
        console.log('\n🔍 Pour un diagnostic détaillé, lancez : node test-403-fix.js');
    }
    
    console.log('\n✅ Vérification terminée !');
    return allGood;
}

// Exécuter la vérification
if (require.main === module) {
    quickCheck().catch(console.error);
}

module.exports = { quickCheck };
