const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const fs = require('fs').promises;
const path = require('path');

// Simuler exactement le même environnement que le serveur
require('dotenv').config();

console.log('=== DEBUG COMPLET DU FLUX D\'AUTHENTIFICATION ===\n');

// 1. Vérifier les variables d'environnement
console.log('1. VARIABLES D\'ENVIRONNEMENT:');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'Présent' : 'MANQUANT');
console.log('SESSION_SECRET:', process.env.SESSION_SECRET ? 'Présent' : 'MANQUANT');
console.log('Valeur JWT_SECRET:', process.env.JWT_SECRET);

// 2. Simuler AuthManager
class TestAuthManager {
    constructor() {
        this.jwtSecret = process.env.JWT_SECRET || 'super-secret-jwt-key-for-authentication-2024';
        this.tokenExpiry = '24h';
        console.log('\n2. AUTHMANAGER INIT:');
        console.log('JWT Secret utilisé:', this.jwtSecret);
    }

    generateToken(client) {
        const payload = {
            clientId: client.clientId,
            name: client.name,
            role: client.role,
            permissions: client.permissions,
            iat: Math.floor(Date.now() / 1000)
        };

        const token = jwt.sign(payload, this.jwtSecret, { expiresIn: this.tokenExpiry });
        console.log('\n3. GÉNÉRATION TOKEN:');
        console.log('Payload:', payload);
        console.log('Token généré:', token.substring(0, 50) + '...');
        return token;
    }

    verifyToken(token) {
        try {
            console.log('\n4. VÉRIFICATION TOKEN:');
            console.log('Token reçu:', token.substring(0, 50) + '...');
            console.log('Clé utilisée pour vérification:', this.jwtSecret);
            
            const decoded = jwt.verify(token, this.jwtSecret);
            console.log('✅ Token décodé avec succès:', decoded);
            
            return { valid: true, client: decoded };
        } catch (error) {
            console.log('❌ Erreur vérification:', error.message);
            return { valid: false, message: error.message };
        }
    }
}

// 3. Test complet
async function testAuthFlow() {
    const authManager = new TestAuthManager();
    
    // Simuler un client admin
    const testClient = {
        clientId: 'admin',
        name: 'Administrateur',
        role: 'admin',
        permissions: ['all']
    };
    
    // Générer un token
    const token = authManager.generateToken(testClient);
    
    // Vérifier immédiatement
    const verification = authManager.verifyToken(token);
    
    console.log('\n5. RÉSULTAT FINAL:');
    if (verification.valid) {
        console.log('✅ AUTHENTIFICATION RÉUSSIE');
        console.log('Client validé:', verification.client.clientId);
    } else {
        console.log('❌ AUTHENTIFICATION ÉCHOUÉE');
        console.log('Erreur:', verification.message);
    }
    
    // Test avec le token de l'erreur utilisateur
    console.log('\n6. TEST TOKEN UTILISATEUR:');
    const userToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbGllbnRJZCI6ImFkbWluIiwibmFtZSI6IkFkbWluaXN0cmF0ZXVyIiwicm9sZSI6ImFkbWluIiwicGVybWlzc2lvbnMiOlsiYWxsIl0sImlhdCI6MTc1Nzg0MjY1MywiZXhwIjoxNzU3OTI5MDUzfQ.28Vx0HQQ56igLCZ8AfUe4jNXBbrxkR-q_vekUz4qtV4";
    
    const userVerification = authManager.verifyToken(userToken);
    if (userVerification.valid) {
        console.log('✅ TOKEN UTILISATEUR VALIDE');
    } else {
        console.log('❌ TOKEN UTILISATEUR INVALIDE:', userVerification.message);
    }
}

testAuthFlow().catch(console.error);
