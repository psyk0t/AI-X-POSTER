// Test minimal pour diagnostiquer le problème
console.log('=== TEST DÉMARRAGE SERVEUR ===');

try {
    console.log('1. Test des imports de base...');
    require('dotenv').config();
    const express = require('express');
    console.log('✅ Express OK');
    
    console.log('2. Test unified-logger...');
    const { getUnifiedLogger } = require('./services/unified-logger');
    console.log('✅ Import unified-logger OK');
    
    const unifiedLogger = getUnifiedLogger();
    console.log('✅ Instance unified-logger OK');
    
    console.log('3. Test logToFile...');
    unifiedLogger.logToFile('[TEST] Test de log');
    console.log('✅ logToFile OK');
    
    console.log('4. Test server.js...');
    require('./server.js');
    console.log('✅ Server.js chargé avec succès');
    
} catch (error) {
    console.error('❌ ERREUR DÉTECTÉE:');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
}
