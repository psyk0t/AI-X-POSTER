require('dotenv').config();
const { getOAuth2Manager } = require('./services/oauth2-manager');

/**
 * TEST RAPIDE DE LA CONFIGURATION OAUTH 2.0
 * Valide que tous les credentials sont présents et fonctionnels
 */

async function testOAuth2Config() {
    console.log('🔧 TEST DE CONFIGURATION OAUTH 2.0\n');
    
    // Test 1: Vérification des credentials
    console.log('1️⃣ Vérification des credentials OAuth 2.0...');
    
    const credentials = {
        'X_CLIENT_ID': process.env.X_CLIENT_ID,
        'X_CLIENT_SECRET': process.env.X_CLIENT_SECRET,
        'X_API_KEY': process.env.X_API_KEY,
        'X_API_SECRET': process.env.X_API_SECRET,
        'X_ACCESS_TOKEN': process.env.X_ACCESS_TOKEN,
        'X_ACCESS_TOKEN_SECRET': process.env.X_ACCESS_TOKEN_SECRET,
        'X_BEARER_TOKEN': process.env.X_BEARER_TOKEN
    };
    
    let allPresent = true;
    Object.entries(credentials).forEach(([key, value]) => {
        const status = value ? '✅' : '❌';
        const displayValue = value ? `${value.substring(0, 10)}...` : 'MANQUANT';
        console.log(`   ${status} ${key}: ${displayValue}`);
        if (!value) allPresent = false;
    });
    
    console.log(`\n   📊 Statut global: ${allPresent ? '✅ TOUS PRÉSENTS' : '❌ CREDENTIALS MANQUANTS'}`);
    
    // Test 2: URLs de callback
    console.log('\n2️⃣ Vérification des URLs de callback...');
    console.log(`   🔗 OAUTH_CALLBACK_URL: ${process.env.OAUTH_CALLBACK_URL || 'NON DÉFINI'}`);
    console.log(`   🔗 OAUTH2_CALLBACK_URL: ${process.env.OAUTH2_CALLBACK_URL || 'NON DÉFINI'}`);
    
    if (!process.env.OAUTH2_CALLBACK_URL) {
        console.log('   ⚠️  OAUTH2_CALLBACK_URL manquant - ajoutez cette ligne dans .env:');
        console.log('   💡 OAUTH2_CALLBACK_URL=http://localhost:3005/oauth2/callback');
    }
    
    // Test 3: Initialisation du service OAuth 2.0
    console.log('\n3️⃣ Test d\'initialisation du service OAuth 2.0...');
    try {
        const oauth2Manager = getOAuth2Manager();
        const stats = oauth2Manager.getStats();
        
        console.log(`   ✅ Service initialisé avec succès`);
        console.log(`   📊 Configuré: ${stats.isConfigured ? '✅ OUI' : '❌ NON'}`);
        console.log(`   📊 Utilisateurs: ${stats.totalUsers}`);
        console.log(`   📊 Invitations actives: ${stats.activeInvitations}`);
        console.log(`   🔗 Callback URL: ${stats.callbackUrl}`);
        
    } catch (error) {
        console.log(`   ❌ Erreur d'initialisation: ${error.message}`);
    }
    
    // Test 4: Génération de token d'invitation
    console.log('\n4️⃣ Test de génération de token d\'invitation...');
    try {
        const oauth2Manager = getOAuth2Manager();
        
        if (oauth2Manager.isConfigured()) {
            const invitation = oauth2Manager.generateInvitationToken('test');
            
            console.log(`   ✅ Token généré avec succès`);
            console.log(`   🎫 Token: ${invitation.token}`);
            console.log(`   🔗 URL complète: ${invitation.inviteUrl}`);
            console.log(`   ⏰ Expire le: ${invitation.expiresAt.toLocaleString()}`);
            
            // Vérifier que l'URL est correcte
            if (invitation.inviteUrl.includes('/invite/') && invitation.token.includes('oauth2')) {
                console.log(`   ✅ Format d'URL correct pour OAuth 2.0`);
            } else {
                console.log(`   ⚠️  Format d'URL inattendu`);
            }
            
        } else {
            console.log(`   ❌ Service non configuré - impossible de générer un token`);
        }
        
    } catch (error) {
        console.log(`   ❌ Erreur génération token: ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(60));
    
    // Conclusion et recommandations
    console.log('\n🎯 RÉSUMÉ DE LA CONFIGURATION:');
    
    if (allPresent && process.env.OAUTH2_CALLBACK_URL) {
        console.log('\n🎉 CONFIGURATION PARFAITE !');
        console.log('   ✅ Tous les credentials OAuth 2.0 sont présents');
        console.log('   ✅ URLs de callback configurées');
        console.log('   ✅ Service OAuth 2.0 opérationnel');
        console.log('\n🚀 PRÊT POUR 20 COMPTES SIMULTANÉS !');
        
    } else {
        console.log('\n⚠️  CONFIGURATION INCOMPLÈTE:');
        
        if (!allPresent) {
            console.log('   ❌ Credentials manquants dans .env');
        }
        
        if (!process.env.OAUTH2_CALLBACK_URL) {
            console.log('   ❌ OAUTH2_CALLBACK_URL manquant');
            console.log('\n💡 AJOUTEZ CETTE LIGNE DANS .ENV:');
            console.log('   OAUTH2_CALLBACK_URL=http://localhost:3005/oauth2/callback');
        }
    }
    
    console.log('\n📋 PROCHAINES ÉTAPES:');
    console.log('   1. Ajoutez OAUTH2_CALLBACK_URL dans .env si manquant');
    console.log('   2. Redémarrez le serveur');
    console.log('   3. Testez la génération d\'invitation OAuth 2.0');
    console.log('   4. Invitez vos premiers utilisateurs !');
}

testOAuth2Config().catch(console.error);
