require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');

/**
 * Test spécifique pour valider la correction de la syntaxe de recherche API v2
 */

async function testSearchFix() {
    console.log('🔍 Test de la correction de recherche API v2...\n');
    
    try {
        const client = new TwitterApi(process.env.X_BEARER_TOKEN);
        
        // Test 1: Ancienne syntaxe (incorrecte) - pour comparaison
        console.log('❌ Test 1: Ancienne syntaxe (incorrecte)');
        try {
            const oldParams = {
                query: 'from:psyk0t -is:retweet -is:reply',
                'tweet.fields': 'created_at,author_id,public_metrics',
                'user.fields': 'username',
                expansions: 'author_id',
                max_results: 5,
            };
            
            // Cette syntaxe devrait échouer
            const oldResult = await client.v2.search(oldParams);
            console.log('   Résultat inattendu: la syntaxe incorrecte a fonctionné');
        } catch (error) {
            console.log(`   ✅ Erreur attendue: ${error.message}`);
        }
        
        // Test 2: Nouvelle syntaxe (correcte)
        console.log('\n✅ Test 2: Nouvelle syntaxe (correcte)');
        try {
            const searchQuery = 'from:psyk0t -is:retweet -is:reply';
            const searchOptions = {
                'tweet.fields': ['created_at', 'author_id', 'public_metrics'],
                'user.fields': ['username'],
                expansions: ['author_id'],
                max_results: 5,
            };
            
            console.log(`   Requête: ${searchQuery}`);
            console.log(`   Options: ${JSON.stringify(searchOptions, null, 2)}`);
            
            const result = await client.v2.search(searchQuery, searchOptions);
            
            console.log(`   ✅ Succès! ${result.data?.data?.length || 0} tweets trouvés`);
            
            if (result.data?.data?.length > 0) {
                const tweet = result.data.data[0];
                console.log(`   Premier tweet: "${tweet.text.substring(0, 60)}..."`);
                console.log(`   Créé le: ${tweet.created_at}`);
                console.log(`   Auteur ID: ${tweet.author_id}`);
            }
            
            // Vérifier les informations de rate limit
            if (result.rateLimit) {
                console.log(`   Rate Limit - Restant: ${result.rateLimit.remaining}/${result.rateLimit.limit}`);
            }
            
        } catch (error) {
            console.log(`   ❌ Erreur: ${error.code || error.status} - ${error.message}`);
            if (error.code === 403) {
                console.log('   💡 Erreur 403: Vérifiez les permissions de votre app Twitter');
            }
        }
        
        // Test 3: Test avec différents types de requêtes
        console.log('\n🔍 Test 3: Différents types de requêtes');
        
        const testQueries = [
            'from:psyk0t',
            '#bitcoin',
            'crypto -is:retweet',
            'from:psyk0t OR from:elonmusk'
        ];
        
        for (const query of testQueries) {
            try {
                console.log(`   Testing: "${query}"`);
                const result = await client.v2.search(query, {
                    max_results: 3,
                    'tweet.fields': ['created_at']
                });
                
                console.log(`   ✅ ${result.data?.data?.length || 0} résultats`);
                
                // Délai pour éviter le rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.log(`   ❌ Erreur pour "${query}": ${error.message}`);
            }
        }
        
    } catch (error) {
        console.log(`❌ Erreur générale: ${error.message}`);
    }
    
    console.log('\n💡 Résumé des corrections apportées:');
    console.log('1. ✅ Séparation de la requête et des options');
    console.log('2. ✅ Utilisation de tableaux pour les champs multiples');
    console.log('3. ✅ Syntaxe correcte: client.v2.search(query, options)');
    console.log('4. ✅ Délais augmentés entre les actions (120-300s)');
    console.log('5. ✅ Gestion améliorée des erreurs 403 et 429');
    
    console.log('\n✅ Test terminé!');
}

// Exécuter le test
if (require.main === module) {
    testSearchFix().catch(console.error);
}

module.exports = { testSearchFix };
