const fs = require('fs');
const path = require('path');
const { TwitterApi } = require('twitter-api-v2');

// Test de validation des tokens et permissions
async function testTokenValidation() {
    try {
        // Charger les comptes OAuth2
        const oauth2Users = JSON.parse(fs.readFileSync('oauth2-users.json', 'utf8'));
        
        for (const [accountId, userData] of oauth2Users) {
            console.log(`\n=== TEST COMPTE: ${userData.username} ===`);
            console.log(`ID: ${accountId}`);
            console.log(`Scopes accordés: ${JSON.stringify(userData.scopesGranted)}`);
            console.log(`Token expire: ${userData.expiresAt}`);
            console.log(`Dernière actualisation: ${userData.lastRefresh || 'N/A'}`);
            
            // Vérifier si le token a expiré
            const expiresAt = new Date(userData.expiresAt);
            const now = new Date();
            const isExpired = now > expiresAt;
            console.log(`Token expiré: ${isExpired} (expire dans ${Math.round((expiresAt - now) / 1000 / 60)} min)`);
            
            if (isExpired) {
                console.log('❌ Token expiré - nécessite refresh');
                continue;
            }
            
            // Créer le client
            const client = new TwitterApi(userData.accessToken);
            
            // Test 1: Vérifier les infos utilisateur
            try {
                const userInfo = await client.v2.me();
                console.log(`✅ User info OK: @${userInfo.data.username}`);
            } catch (error) {
                console.log(`❌ User info failed: ${error.code} - ${error.message}`);
                continue;
            }
            
            // Test 2: Vérifier les permissions de tweet
            try {
                const testTweet = await client.v2.tweet({
                    text: `Test permissions - ${new Date().toISOString().slice(0, 19)}`
                });
                console.log(`✅ Tweet OK: ${testTweet.data.id}`);
                
                // Supprimer le tweet de test
                await client.v2.deleteTweet(testTweet.data.id);
                console.log(`✅ Delete tweet OK`);
                
            } catch (error) {
                console.log(`❌ Tweet failed: ${error.code} - ${error.message}`);
            }
            
            // Test 3: Tester l'upload média (le problème principal)
            if (userData.scopesGranted.includes('media.write')) {
                try {
                    // Créer un petit buffer de test (1x1 pixel PNG)
                    const testImageBuffer = Buffer.from([
                        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
                        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
                        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
                        0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0x00, 0x00, 0x00,
                        0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x37, 0x6E, 0xF9, 0x24, 0x00, 0x00,
                        0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
                    ]);
                    
                    console.log(`Test upload média (${testImageBuffer.length} bytes)...`);
                    
                    const mediaId = await client.v1.uploadMedia(testImageBuffer, { 
                        mimeType: 'image/png',
                        target: 'tweet'
                    });
                    console.log(`✅ Media upload OK: ${mediaId}`);
                    
                } catch (error) {
                    console.log(`❌ Media upload failed: ${error.code} - ${error.message}`);
                    console.log(`Error data:`, JSON.stringify(error.data || {}, null, 2));
                    
                    // Essayer avec des paramètres différents
                    try {
                        console.log('Tentative avec uploadMedia sans options...');
                        const mediaId = await client.v1.uploadMedia(testImageBuffer);
                        console.log(`✅ Media upload OK (sans options): ${mediaId}`);
                    } catch (error2) {
                        console.log(`❌ Media upload failed (sans options): ${error2.code} - ${error2.message}`);
                    }
                }
            } else {
                console.log('❌ Pas de scope media.write');
            }
            
            // Ne tester qu'un seul compte pour éviter le spam
            break;
        }
        
    } catch (error) {
        console.log(`Erreur générale: ${error.message}`);
        console.log(error.stack);
    }
}

// Lancer le test
testTokenValidation().then(() => {
    console.log('\n[TEST] Validation terminée');
    process.exit(0);
}).catch(error => {
    console.error('[TEST] Erreur fatale:', error);
    process.exit(1);
});
