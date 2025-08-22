require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');
const { getOAuth2Manager } = require('./services/oauth2-manager');

/**
 * TEST DES PERMISSIONS OAUTH 2.0
 * 
 * Ce script teste les permissions du compte OAuth 2.0 connecté
 */

async function testOAuth2Permissions() {
    console.log('🔐 TEST DES PERMISSIONS OAUTH 2.0\n');
    
    try {
        // Récupérer le compte OAuth 2.0
        const oauth2Manager = getOAuth2Manager();
        const oauth2Users = oauth2Manager.getAllUsers();
        
        if (oauth2Users.length === 0) {
            console.log('❌ Aucun compte OAuth 2.0 trouvé');
            console.log('💡 Reconnectez un compte via l\'interface web');
            return;
        }
        
        const user = oauth2Users[0];
        console.log(`👤 Test du compte: @${user.username} (ID: ${user.id})`);
        console.log(`🔑 Token: ${user.accessToken.substring(0, 20)}...`);
        
        // Créer le client OAuth 2.0
        const client = new TwitterApi(user.accessToken);
        
        // Test 1: Informations utilisateur
        console.log('\n1️⃣ Test: Informations utilisateur...');
        try {
            const me = await client.v2.me();
            console.log(`   ✅ Succès: @${me.data.username} (${me.data.name})`);
        } catch (error) {
            console.log(`   ❌ Échec: ${error.message}`);
            if (error.message.includes('403')) {
                console.log('   💡 Scope manquant: users.read');
            }
        }
        
        // Test 2: Lecture de tweets
        console.log('\n2️⃣ Test: Lecture de tweets...');
        try {
            const tweets = await client.v2.search('base', { max_results: 10 });
            console.log(`   ✅ Succès: ${tweets.data?.data?.length || 0} tweets trouvés`);
        } catch (error) {
            console.log(`   ❌ Échec: ${error.message}`);
            if (error.message.includes('403')) {
                console.log('   💡 Scope manquant: tweet.read');
            }
        }
        
        // Test 3: Créer un like (test non destructif)
        console.log('\n3️⃣ Test: Permissions de like...');
        try {
            // Test avec un tweet qui n'existe pas pour éviter de vraiment liker
            await client.v2.like('9999999999999999999');
        } catch (error) {
            if (error.message.includes('404')) {
                console.log('   ✅ Permissions de like: OK (tweet non trouvé, mais permission accordée)');
            } else if (error.message.includes('403')) {
                console.log(`   ❌ Permissions de like: REFUSÉES`);
                console.log('   💡 Scope manquant: like.write');
            } else {
                console.log(`   ⚠️  Erreur inattendue: ${error.message}`);
            }
        }
        
        // Test 4: Permissions d'écriture
        console.log('\n4️⃣ Test: Permissions d\'écriture...');
        try {
            // Test avec un contenu vide pour éviter de vraiment tweeter
            await client.v2.tweet('');
        } catch (error) {
            if (error.message.includes('400')) {
                console.log('   ✅ Permissions d\'écriture: OK (contenu vide, mais permission accordée)');
            } else if (error.message.includes('403')) {
                console.log(`   ❌ Permissions d'écriture: REFUSÉES`);
                console.log('   💡 Scope manquant: tweet.write');
            } else {
                console.log(`   ⚠️  Erreur inattendue: ${error.message}`);
            }
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('\n💡 RECOMMANDATIONS:');
        
        console.log('\n🔧 Si vous avez des erreurs 403:');
        console.log('1. Vérifiez les permissions de votre app Twitter:');
        console.log('   - Allez sur https://developer.twitter.com/en/portal/dashboard');
        console.log('   - Sélectionnez votre app');
        console.log('   - Onglet "Settings" → "User authentication settings"');
        console.log('   - App permissions: "Read and Write" minimum');
        console.log('   - Type of App: "Web App, Automated App or Bot"');
        
        console.log('\n2. Reconnectez le compte avec les nouveaux scopes:');
        console.log('   - Supprimez le compte @' + user.username + ' depuis l\'interface');
        console.log('   - Générez un nouveau token d\'invitation');
        console.log('   - Reconnectez-vous pour appliquer les nouveaux scopes');
        
        console.log('\n3. Vérifiez que tous ces scopes sont cochés:');
        console.log('   ✓ tweet.read, tweet.write');
        console.log('   ✓ users.read');
        console.log('   ✓ like.read, like.write');
        console.log('   ✓ follows.read, follows.write');
        console.log('   ✓ offline.access');
        
    } catch (error) {
        console.error('❌ Erreur lors du test:', error.message);
    }
}

testOAuth2Permissions().catch(console.error);
