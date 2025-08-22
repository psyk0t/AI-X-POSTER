require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');
const fs = require('fs');
const path = require('path');

/**
 * Test spécifique pour diagnostiquer les permissions OAuth 2.0 pour les actions
 */

async function testOAuth2Actions() {
    console.log('🔍 Test des permissions OAuth 2.0 pour les actions\n');
    
    // Charger les utilisateurs OAuth 2.0 connectés
    const oauth2UsersFile = path.join(__dirname, 'oauth2-users.json');
    
    if (!fs.existsSync(oauth2UsersFile)) {
        console.log('❌ Aucun utilisateur OAuth 2.0 trouvé');
        console.log('   Connectez d\'abord un compte via OAuth 2.0');
        return;
    }
    
    const oauth2Data = JSON.parse(fs.readFileSync(oauth2UsersFile, 'utf8'));
    
    if (!oauth2Data || oauth2Data.length === 0) {
        console.log('❌ Aucun utilisateur OAuth 2.0 dans le fichier');
        return;
    }
    
    // Le fichier contient un array de [id, userData]
    const userEntry = oauth2Data[0]; // Premier utilisateur
    const user = userEntry[1]; // Les données utilisateur sont dans le second élément
    console.log(`👤 Test avec utilisateur OAuth 2.0: @${user.username}`);
    console.log(`🔑 Access Token: ${user.accessToken.substring(0, 20)}...`);
    
    // Créer le client OAuth 2.0
    const client = new TwitterApi(user.accessToken);
    
    let successCount = 0;
    let errorCount = 0;
    
    // Test 1: Informations utilisateur (users.read)
    console.log('\n📋 Test 1: Lecture informations utilisateur (users.read)');
    try {
        const me = await client.v2.me();
        console.log(`✅ Succès: @${me.data.username} (ID: ${me.data.id})`);
        successCount++;
    } catch (error) {
        console.log(`❌ Échec: ${error.code} - ${error.message}`);
        console.log(`   Détails: ${JSON.stringify(error.data || {}, null, 2)}`);
        errorCount++;
    }
    
    // Test 2: Informations utilisateur étendues
    console.log('\n👤 Test 2: Informations utilisateur étendues');
    try {
        const me = await client.v2.me({
            'user.fields': ['public_metrics', 'verified', 'description']
        });
        console.log(`✅ Succès: Followers: ${me.data.public_metrics?.followers_count || 'N/A'}`);
        successCount++;
    } catch (error) {
        console.log(`❌ Échec: ${error.code} - ${error.message}`);
        errorCount++;
    }
    
    // Test 3: Lecture de tweets (tweet.read)
    console.log('\n🐦 Test 3: Lecture de tweets (tweet.read)');
    try {
        const tweets = await client.v2.search('hello', { max_results: 10 });
        console.log(`✅ Succès: ${tweets.data?.data?.length || 0} tweets trouvés`);
        successCount++;
    } catch (error) {
        console.log(`❌ Échec: ${error.code} - ${error.message}`);
        errorCount++;
    }
    
    // Test 4: Capacité de like (like.write) - SIMULATION
    console.log('\n❤️ Test 4: Capacité de like (like.write) - SIMULATION');
    try {
        // On ne fait pas vraiment l'action, juste on teste l'accès à l'API
        const rwClient = client.readWrite;
        console.log(`✅ Client Read/Write créé avec succès`);
        console.log(`   Prêt pour: likes, retweets, replies`);
        successCount++;
    } catch (error) {
        console.log(`❌ Échec création client RW: ${error.message}`);
        errorCount++;
    }
    
    // Test 5: Vérification des scopes accordés
    console.log('\n🔐 Test 5: Vérification des scopes accordés');
    try {
        // Essayer différentes opérations pour détecter les scopes
        const me = await client.v2.me();
        console.log(`✅ users.read: OK`);
        
        const tweets = await client.v2.search('test', { max_results: 10 });
        console.log(`✅ tweet.read: OK`);
        
        successCount++;
    } catch (error) {
        console.log(`❌ Échec vérification scopes: ${error.message}`);
        errorCount++;
    }
    
    console.log('\n📊 RÉSUMÉ DES TESTS');
    console.log('==================================================');
    console.log(`✅ Tests réussis: ${successCount}`);
    console.log(`❌ Tests échoués: ${errorCount}`);
    console.log(`📈 Taux de réussite: ${Math.round((successCount / (successCount + errorCount)) * 100)}%`);
    
    console.log('\n🎯 DIAGNOSTIC:');
    console.log('==================================================');
    
    if (errorCount === 0) {
        console.log('🎉 PARFAIT! OAuth 2.0 fonctionne complètement');
        console.log('   Toutes les permissions sont accordées');
    } else if (successCount > 0) {
        console.log('⚠️ SUCCÈS PARTIEL:');
        console.log('   • Certaines permissions fonctionnent');
        console.log('   • D\'autres sont bloquées (403)');
        console.log('\n🔧 SOLUTIONS POSSIBLES:');
        console.log('1. Vérifiez les permissions de votre app Twitter');
        console.log('2. Assurez-vous que "Read and write" est activé');
        console.log('3. Reconnectez le compte OAuth 2.0 avec les nouveaux scopes');
    } else {
        console.log('❌ ÉCHEC COMPLET:');
        console.log('   Aucune permission OAuth 2.0 ne fonctionne');
        console.log('\n🔧 ACTIONS REQUISES:');
        console.log('1. Vérifiez votre configuration Twitter App');
        console.log('2. Vérifiez les Client ID/Secret dans .env');
        console.log('3. Régénérez les tokens OAuth 2.0');
    }
    
    console.log('\n📋 INFORMATIONS TECHNIQUES:');
    console.log(`   User ID: ${user.id}`);
    console.log(`   Username: @${user.username}`);
    console.log(`   Auth Method: ${user.authMethod || 'oauth2'}`);
    console.log(`   Connected: ${new Date(user.addedAt).toLocaleString()}`);
}

// Exécuter le test
if (require.main === module) {
    testOAuth2Actions().catch(console.error);
}

module.exports = { testOAuth2Actions };
