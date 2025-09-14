const jwt = require('jsonwebtoken');

// Token de l'erreur
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbGllbnRJZCI6ImFkbWluIiwibmFtZSI6IkFkbWluaXN0cmF0ZXVyIiwicm9sZSI6ImFkbWluIiwicGVybWlzc2lvbnMiOlsiYWxsIl0sImlhdCI6MTc1Nzg0MjY1MywiZXhwIjoxNzU3OTI5MDUzfQ.28Vx0HQQ56igLCZ8AfUe4jNXBbrxkR-q_vekUz4qtV4";

console.log('=== ANALYSE DU TOKEN JWT ===');

// Décoder sans vérification pour voir le contenu
try {
    const decoded = jwt.decode(token);
    console.log('Token décodé (sans vérification):', decoded);
    
    // Vérifier les timestamps
    const now = Math.floor(Date.now() / 1000);
    console.log('Timestamp actuel:', now);
    console.log('Token iat (issued at):', decoded.iat);
    console.log('Token exp (expires at):', decoded.exp);
    console.log('Token expiré?', now > decoded.exp);
    
    // Dates lisibles
    console.log('Date émission:', new Date(decoded.iat * 1000));
    console.log('Date expiration:', new Date(decoded.exp * 1000));
    console.log('Date actuelle:', new Date());
    
} catch (error) {
    console.error('Erreur décodage:', error.message);
}

// Tester avec différentes clés JWT
const possibleSecrets = [
    'super-secret-jwt-key-for-authentication-2024',
    'lateubducul',
    'default-secret',
    process.env.JWT_SECRET,
    process.env.SESSION_SECRET
];

console.log('\n=== TEST AVEC DIFFÉRENTES CLÉS ===');
possibleSecrets.forEach((secret, index) => {
    if (!secret) return;
    
    try {
        const verified = jwt.verify(token, secret);
        console.log(`✅ Clé ${index + 1} (${secret.substring(0, 20)}...): VALIDE`);
        console.log('Données vérifiées:', verified);
    } catch (error) {
        console.log(`❌ Clé ${index + 1} (${secret.substring(0, 20)}...): ${error.message}`);
    }
});
