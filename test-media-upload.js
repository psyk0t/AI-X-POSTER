const { TwitterApi } = require('twitter-api-v2');
const fs = require('fs');
const path = require('path');

/**
 * Script de test pour vérifier l'upload d'images avec les nouveaux scopes media.write
 */
async function testMediaUpload() {
    console.log('🧪 TEST UPLOAD MÉDIA - Vérification scopes media.write\n');
    
    try {
        // Charger les utilisateurs OAuth2
        const oauth2UsersPath = path.join(__dirname, 'oauth2-users.json');
        if (!fs.existsSync(oauth2UsersPath)) {
            console.log('❌ Fichier oauth2-users.json non trouvé');
            return;
        }
        
        const oauth2Data = JSON.parse(fs.readFileSync(oauth2UsersPath, 'utf8'));
        console.log(`📋 ${oauth2Data.length} comptes OAuth2 trouvés\n`);
        
        // Vérifier les images disponibles
        const imagesDir = path.join(__dirname, 'reply-images');
        const images = fs.readdirSync(imagesDir).filter(f => 
            ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(path.extname(f).toLowerCase())
        );
        
        if (images.length === 0) {
            console.log('❌ Aucune image trouvée dans reply-images/');
            return;
        }
        
        console.log(`🖼️  ${images.length} images disponibles pour test\n`);
        
        // Tester chaque compte
        for (const [userId, userData] of oauth2Data) {
            console.log(`\n👤 Test compte: @${userData.username} (${userId})`);
            
            // Vérifier les scopes
            const hasMediaWrite = userData.scopesGranted && userData.scopesGranted.includes('media.write');
            console.log(`   📋 Scopes: ${userData.scopesGranted ? userData.scopesGranted.join(', ') : 'Non définis'}`);
            console.log(`   🔑 media.write: ${hasMediaWrite ? '✅ OUI' : '❌ NON'}`);
            
            if (!hasMediaWrite) {
                console.log('   ⚠️  Reconnexion nécessaire avec nouveaux scopes');
                continue;
            }
            
            // Créer client Twitter
            try {
                const client = new TwitterApi({
                    clientId: process.env.X_CLIENT_ID,
                    clientSecret: process.env.X_CLIENT_SECRET
                });
                
                const rwClient = client.login({
                    accessToken: userData.accessToken,
                    refreshToken: userData.refreshToken
                });
                
                // Tester upload d'une image
                const testImage = images[0];
                const imagePath = path.join(imagesDir, testImage);
                const imageBuffer = fs.readFileSync(imagePath);
                const ext = path.extname(testImage).toLowerCase();
                
                const mimeMap = {
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.png': 'image/png',
                    '.gif': 'image/gif',
                    '.webp': 'image/webp'
                };
                const mimeType = mimeMap[ext] || 'application/octet-stream';
                
                console.log(`   🧪 Test upload: ${testImage} (${mimeType})`);
                
                // Essayer API v2 d'abord
                try {
                    const uploadResult = await rwClient.v2.uploadMedia(imageBuffer, { 
                        media_type: mimeType 
                    });
                    console.log(`   ✅ Upload v2 réussi: ${uploadResult}`);
                } catch (v2Error) {
                    console.log(`   ⚠️  Échec v2: ${v2Error.message}`);
                    
                    // Fallback vers v1
                    try {
                        const uploadResult = await rwClient.v1.uploadMedia(imageBuffer, { mimeType });
                        console.log(`   ✅ Upload v1 réussi: ${uploadResult}`);
                    } catch (v1Error) {
                        console.log(`   ❌ Échec v1: ${v1Error.message}`);
                        
                        if (v1Error.message.includes('403')) {
                            console.log('   💡 Erreur 403: Permissions insuffisantes');
                        }
                    }
                }
                
            } catch (clientError) {
                console.log(`   ❌ Erreur création client: ${clientError.message}`);
            }
        }
        
        console.log('\n📋 RÉSUMÉ:');
        console.log('1. Les comptes sans media.write doivent être reconnectés');
        console.log('2. Utilisez le lien OAuth2 avec les nouveaux scopes');
        console.log('3. Une fois reconnectés, les images devraient fonctionner');
        
    } catch (error) {
        console.error('❌ Erreur durant le test:', error.message);
    }
}

// Exécuter le test
if (require.main === module) {
    require('dotenv').config();
    testMediaUpload();
}

module.exports = { testMediaUpload };
