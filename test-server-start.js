// Test simple pour vérifier le démarrage du serveur
console.log('Test de démarrage du serveur...');

try {
    require('dotenv').config();
    console.log('✅ dotenv chargé');
    
    const express = require('express');
    console.log('✅ express chargé');
    
    const app = express();
    console.log('✅ app express créée');
    
    const PORT = process.env.PORT || 3000;
    console.log(`✅ PORT configuré: ${PORT}`);
    
    app.get('/', (req, res) => {
        res.send('Serveur de test fonctionnel');
    });
    
    app.listen(PORT, () => {
        console.log(`✅ Serveur de test démarré sur le port ${PORT}`);
        console.log(`Interface accessible sur http://localhost:${PORT}`);
    });
    
} catch (error) {
    console.error('❌ Erreur lors du démarrage:', error.message);
    console.error('Stack:', error.stack);
}
