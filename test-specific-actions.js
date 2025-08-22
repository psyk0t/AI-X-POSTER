require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');

/**
 * Test des actions spécifiques pour identifier la source des erreurs 403
 */

async function testSpecificActions() {
    console.log('🎯 Test des actions spécifiques pour identifier les erreurs 403\n');
    
    // Configuration du client comme dans l'application
    const client = new TwitterApi({
        appKey: process.env.X_API_KEY,
        appSecret: process.env.X_API_SECRET,
        accessToken: process.env.X_ACCESS_TOKEN,
        accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
    });
    
    let successCount = 0;
    let errorCount = 0;
    
    // Test 1: Obtenir les informations utilisateur
    console.log('👤 Test 1: Informations utilisateur');
    try {
        const user = await client.currentUser();
        console.log(`✅ currentUser() OK: @${user.screen_name} (${user.followers_count} followers)`);
        successCount++;
        
        // Test API v2 pour les infos utilisateur
        const meV2 = await client.v2.me();
        console.log(`✅ v2.me() OK: @${meV2.data.username} (ID: ${meV2.data.id})`);
        successCount++;
        
    } catch (error) {
        console.log(`❌ Informations utilisateur ÉCHEC: ${error.code} - ${error.message}`);
        errorCount++;
    }
    
    // Test 2: Recherche de tweets (comme dans l'automation)
    console.log('\n🔍 Test 2: Recherche de tweets');
    try {
        const searchQuery = 'from:psyk0t -is:retweet -is:reply';
        const searchOptions = {
            'tweet.fields': ['created_at', 'author_id', 'public_metrics'],
            'user.fields': ['username'],
            expansions: ['author_id'],
            max_results: 5,
        };
        
        console.log(`   Requête: ${searchQuery}`);
        const result = await client.v2.search(searchQuery, searchOptions);
        console.log(`✅ Recherche v2 OK: ${result.data?.data?.length || 0} tweets trouvés`);
        successCount++;
        
    } catch (error) {
        console.log(`❌ Recherche ÉCHEC: ${error.code} - ${error.message}`);
        if (error.code === 403) {
            console.log('   💡 Erreur 403 sur la recherche - vérifiez les permissions de lecture');
        }
        errorCount++;
    }
    
    // Test 3: Test d'action LIKE (simulation seulement)
    console.log('\n❤️  Test 3: Capacité de LIKE (simulation)');
    try {
        const user = await client.currentUser();
        const userId = user.id_str;
        
        console.log(`   User ID pour likes: ${userId}`);
        console.log('   💡 Test de simulation - pas de like réel effectué');
        console.log('   💡 Dans l\'app, cela utiliserait: client.v2.like(userId, tweetId)');
        
        // Vérifier si l'utilisateur a les permissions pour liker
        if (userId) {
            console.log('✅ Simulation LIKE OK: User ID disponible');
            successCount++;
        }
        
    } catch (error) {
        console.log(`❌ Simulation LIKE ÉCHEC: ${error.code} - ${error.message}`);
        errorCount++;
    }
    
    // Test 4: Test d'action RETWEET (simulation seulement)
    console.log('\n🔄 Test 4: Capacité de RETWEET (simulation)');
    try {
        const user = await client.currentUser();
        const userId = user.id_str;
        
        console.log('   💡 Test de simulation - pas de retweet réel effectué');
        console.log('   💡 Dans l\'app, cela utiliserait: client.v2.retweet(userId, tweetId)');
        
        if (userId) {
            console.log('✅ Simulation RETWEET OK: User ID disponible');
            successCount++;
        }
        
    } catch (error) {
        console.log(`❌ Simulation RETWEET ÉCHEC: ${error.code} - ${error.message}`);
        errorCount++;
    }
    
    // Test 5: Vérification des rate limits actuels
    console.log('\n📊 Test 5: Rate limits actuels');
    try {
        const result = await client.v2.search('test', { max_results: 1 });
        
        if (result.rateLimit) {
            const { remaining, limit, reset } = result.rateLimit;
            const percentage = Math.round((remaining / limit) * 100);
            
            console.log(`✅ Rate limits: ${remaining}/${limit} (${percentage}%)`);
            console.log(`   Reset: ${new Date(reset * 1000).toLocaleString()}`);
            
            if (percentage < 20) {
                console.log('   ⚠️  ATTENTION: Rate limits très bas!');
                console.log('   💡 Cela pourrait expliquer les erreurs 403 nocturnes');
            }
            successCount++;
        }
        
    } catch (error) {
        console.log(`❌ Rate limits ÉCHEC: ${error.message}`);
        errorCount++;
    }
    
    // Test 6: Vérification des permissions d'app
    console.log('\n🔑 Test 6: Permissions d\'application');
    try {
        // Tenter une opération qui révèle les permissions
        const user = await client.currentUser();
        
        console.log('✅ Lecture des données utilisateur: OK');
        console.log(`   Compte: @${user.screen_name}`);
        console.log(`   Créé le: ${user.created_at}`);
        console.log(`   Vérifié: ${user.verified ? 'Oui' : 'Non'}`);
        
        // Les permissions d'écriture ne peuvent être testées qu'avec de vraies actions
        console.log('   💡 Permissions d\'écriture: À tester avec de vraies actions');
        successCount++;
        
    } catch (error) {
        console.log(`❌ Permissions ÉCHEC: ${error.code} - ${error.message}`);
        if (error.code === 403) {
            console.log('   💡 Erreur 403: Permissions insuffisantes dans l\'app Twitter');
        }
        errorCount++;
    }
    
    // Résumé et diagnostic
    console.log('\n📊 RÉSUMÉ DES TESTS');
    console.log('='.repeat(60));
    console.log(`✅ Tests réussis: ${successCount}`);
    console.log(`❌ Tests échoués: ${errorCount}`);
    console.log(`📈 Taux de réussite: ${Math.round((successCount / (successCount + errorCount)) * 100)}%`);
    
    console.log('\n🔍 DIAGNOSTIC DES ERREURS 403:');
    if (errorCount === 0) {
        console.log('✅ Aucune erreur détectée dans les tests');
        console.log('💡 Les erreurs 403 nocturnes pourraient être dues à:');
        console.log('   - Rate limiting intensif pendant l\'automatisation');
        console.log('   - Actions sur des tweets protégés/supprimés');
        console.log('   - Changements temporaires de permissions Twitter');
    } else {
        console.log('❌ Erreurs détectées - à corriger avant l\'automatisation');
    }
    
    console.log('\n💡 RECOMMANDATIONS:');
    console.log('1. Surveillez les rate limits pendant l\'automatisation');
    console.log('2. Implémentez une gestion robuste des tweets supprimés/protégés');
    console.log('3. Ajoutez des délais plus longs si les rate limits sont épuisés');
    console.log('4. Loggez tous les codes d\'erreur pour identifier les patterns');
    
    console.log('\n✅ Test terminé!');
}

// Exécuter le test
if (require.main === module) {
    testSpecificActions().catch(console.error);
}

module.exports = { testSpecificActions };
