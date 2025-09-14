const fs = require('fs');
const path = require('path');
const { TwitterApi } = require('twitter-api-v2');

// Test d'upload d'images avec les comptes OAuth2 valides
async function testImageUpload() {
    try {
        // Charger les comptes OAuth2
        const oauth2Users = JSON.parse(fs.readFileSync('oauth2-users.json', 'utf8'));
        console.log(`[TEST] ${oauth2Users.length} comptes OAuth2 trouvés`);
        
        // Prendre le premier compte avec media.write
        const testAccount = oauth2Users.find(([id, userData]) => {
            return userData.scopesGranted && userData.scopesGranted.includes('media.write') && userData.accessToken;
        });
        
        if (!testAccount) {
            console.log('[TEST] Aucun compte avec media.write trouvé');
            return;
        }
        
        const [accountId, userData] = testAccount;
        console.log(`[TEST] Test avec compte: ${userData.username} (${accountId})`);
        console.log(`[TEST] Scopes: ${JSON.stringify(userData.scopesGranted)}`);
        console.log(`[TEST] Token présent: ${!!userData.accessToken}`);
        
        // Créer le client Twitter
        const client = new TwitterApi(userData.accessToken);
        
        // Charger une image de test
        const imagesDir = path.join(__dirname, 'reply-images');
        const imageFiles = fs.readdirSync(imagesDir).filter(file => 
            ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(path.extname(file).toLowerCase())
        );
        
        if (imageFiles.length === 0) {
            console.log('[TEST] Aucune image trouvée dans reply-images/');
            return;
        }
        
        const testImagePath = path.join(imagesDir, imageFiles[0]);
        const imageBuffer = fs.readFileSync(testImagePath);
        const ext = path.extname(testImagePath).toLowerCase();
        
        const mimeMap = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp'
        };
        const mimeType = mimeMap[ext] || 'application/octet-stream';
        
        console.log(`[TEST] Image: ${testImagePath}`);
        console.log(`[TEST] Taille: ${imageBuffer.length} bytes`);
        console.log(`[TEST] MIME: ${mimeType}`);
        
        // Test upload avec API v2
        console.log('[TEST] === TEST API v2 ===');
        try {
            const mediaId = await client.v1.uploadMedia(imageBuffer, { mimeType });
            console.log(`[TEST] ✅ API v2 SUCCESS - Media ID: ${mediaId}`);
            
            // Test tweet avec image
            const tweet = await client.v2.tweet({
                text: `Test upload d'image - ${new Date().toISOString()}`,
                media: { media_ids: [mediaId] }
            });
            console.log(`[TEST] ✅ Tweet avec image créé: ${tweet.data.id}`);
            
        } catch (error) {
            console.log(`[TEST] ❌ API v2 FAILED: ${error.message}`);
            console.log(`[TEST] Status: ${error.code || 'N/A'}`);
            console.log(`[TEST] Data: ${JSON.stringify(error.data || {})}`);
        }
        
        // Test upload avec API v1 (fallback)
        console.log('[TEST] === TEST API v1 ===');
        try {
            const mediaId = await client.v1.uploadMedia(imageBuffer, { mimeType });
            console.log(`[TEST] ✅ API v1 SUCCESS - Media ID: ${mediaId}`);
            
        } catch (error) {
            console.log(`[TEST] ❌ API v1 FAILED: ${error.message}`);
            console.log(`[TEST] Status: ${error.code || 'N/A'}`);
            console.log(`[TEST] Data: ${JSON.stringify(error.data || {})}`);
        }
        
    } catch (error) {
        console.log(`[TEST] Erreur générale: ${error.message}`);
        console.log(error.stack);
    }
}

// Lancer le test
testImageUpload().then(() => {
    console.log('[TEST] Test terminé');
    process.exit(0);
}).catch(error => {
    console.error('[TEST] Erreur fatale:', error);
    process.exit(1);
});
