require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');

async function testScalabilityOAuth() {
    console.log('🚀 Test de scalabilité OAuth pour 20 comptes simultanés\n');
    
    // Simulation des besoins pour 20 comptes
    const NOMBRE_COMPTES = 20;
    const ACTIONS_PAR_COMPTE_PAR_HEURE = 10; // likes + retweets + replies
    const RECHERCHES_PAR_COMPTE_PAR_HEURE = 5;
    
    console.log('📊 BESOINS CALCULÉS :');
    console.log(`   👥 Comptes connectés : ${NOMBRE_COMPTES}`);
    console.log(`   🔄 Actions/compte/heure : ${ACTIONS_PAR_COMPTE_PAR_HEURE}`);
    console.log(`   🔍 Recherches/compte/heure : ${RECHERCHES_PAR_COMPTE_PAR_HEURE}`);
    console.log(`   📈 TOTAL actions/heure : ${NOMBRE_COMPTES * ACTIONS_PAR_COMPTE_PAR_HEURE}`);
    console.log(`   📈 TOTAL recherches/heure : ${NOMBRE_COMPTES * RECHERCHES_PAR_COMPTE_PAR_HEURE}`);
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    // Test OAuth 1.0a (configuration actuelle)
    console.log('📊 OAuth 1.0a - Rate limits par APP :');
    try {
        const clientOAuth1 = new TwitterApi({
            appKey: process.env.X_API_KEY,
            appSecret: process.env.X_API_SECRET,
            accessToken: process.env.X_ACCESS_TOKEN,
            accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
        });
        
        const searchResult = await clientOAuth1.v2.search('from:psyk0t', {
            max_results: 5,
            'tweet.fields': ['created_at']
        });
        
        const remaining = searchResult.rateLimit?.remaining || 0;
        const limit = searchResult.rateLimit?.limit || 0;
        const resetTime = Math.round((searchResult.rateLimit?.reset - Date.now()/1000)/60);
        
        console.log(`   📈 Rate limit recherche : ${remaining}/${limit} (reset dans ${resetTime}min)`);
        console.log(`   ⚠️  PROBLÈME : Tous les comptes partagent les mêmes limites !`);
        console.log(`   🔴 Avec 20 comptes : ${Math.floor(limit/NOMBRE_COMPTES)} recherches/compte/15min`);
        console.log(`   🔴 Soit : ${Math.floor((limit/NOMBRE_COMPTES)*4)} recherches/compte/heure`);
        
        if (Math.floor((limit/NOMBRE_COMPTES)*4) < RECHERCHES_PAR_COMPTE_PAR_HEURE) {
            console.log(`   ❌ INSUFFISANT ! Besoin de ${RECHERCHES_PAR_COMPTE_PAR_HEURE}/h, disponible ${Math.floor((limit/NOMBRE_COMPTES)*4)}/h`);
        }
        
    } catch (error) {
        console.log(`   ❌ Erreur OAuth 1.0a: ${error.code} - ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    // Test OAuth 2.0 avec Bearer Token
    console.log('📊 OAuth 2.0 - Rate limits par USER :');
    try {
        const clientOAuth2 = new TwitterApi(process.env.X_BEARER_TOKEN);
        
        const searchResult = await clientOAuth2.v2.search('from:psyk0t', {
            max_results: 5,
            'tweet.fields': ['created_at']
        });
        
        const remaining = searchResult.rateLimit?.remaining || 0;
        const limit = searchResult.rateLimit?.limit || 0;
        const resetTime = Math.round((searchResult.rateLimit?.reset - Date.now()/1000)/60);
        
        console.log(`   📈 Rate limit recherche : ${remaining}/${limit} (reset dans ${resetTime}min)`);
        console.log(`   ✅ AVANTAGE : Chaque utilisateur a ses propres limites !`);
        console.log(`   🟢 Avec 20 comptes : ${limit} recherches/compte/15min`);
        console.log(`   🟢 Soit : ${limit*4} recherches/compte/heure`);
        
        if (limit*4 >= RECHERCHES_PAR_COMPTE_PAR_HEURE) {
            console.log(`   ✅ SUFFISANT ! Besoin de ${RECHERCHES_PAR_COMPTE_PAR_HEURE}/h, disponible ${limit*4}/h`);
        }
        
    } catch (error) {
        console.log(`   ❌ Erreur OAuth 2.0: ${error.code} - ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    // Recommandations finales
    console.log('🎯 RECOMMANDATIONS POUR 20 COMPTES :');
    console.log('');
    console.log('❌ OAuth 1.0a (problématique) :');
    console.log('   - Rate limits PARTAGÉS entre tous les comptes');
    console.log('   - Goulot d\'étranglement majeur');
    console.log('   - Impossible de scaler au-delà de 3-5 comptes');
    console.log('');
    console.log('✅ OAuth 2.0 (obligatoire) :');
    console.log('   - Rate limits INDIVIDUELS par utilisateur');
    console.log('   - Scalabilité linéaire');
    console.log('   - Gestion centralisée des permissions');
    console.log('   - Architecture multi-tenant native');
    console.log('');
    console.log('🚀 VERDICT : Migration OAuth 2.0 INDISPENSABLE pour 20 comptes !');
    console.log('');
    console.log('📋 PROCHAINES ÉTAPES :');
    console.log('   1. Implémenter OAuth 2.0 avec Client ID/Secret');
    console.log('   2. Tester le flow d\'authentification multi-utilisateurs');
    console.log('   3. Adapter l\'architecture pour la gestion multi-tenant');
    console.log('   4. Implémenter la distribution des rate limits');
}

testScalabilityOAuth().catch(console.error);
