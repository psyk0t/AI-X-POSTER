/**
 * Script de verification simple pour l'integration
 */

const fs = require('fs');
const path = require('path');

console.log('Verification de l\'integration du systeme optimise...\n');

let errors = [];
let warnings = [];
let success = [];

// Verifier les fichiers crees
const filesToCheck = [
    './services/unified-logger.js',
    './services/performance-monitor.js', 
    './services/error-handler.js',
    './services/api-performance-endpoints.js',
    './performance-dashboard.html'
];

console.log('Verification des fichiers...');
filesToCheck.forEach(file => {
    if (fs.existsSync(file)) {
        success.push(`OK: ${path.basename(file)}`);
    } else {
        errors.push(`MANQUANT: ${file}`);
    }
});

// Verifier server.js
console.log('\nVerification de server.js...');
try {
    const serverContent = fs.readFileSync('./server.js', 'utf8');
    
    if (serverContent.includes('unified-logger')) {
        success.push('OK: Import unified-logger dans server.js');
    } else {
        warnings.push('ATTENTION: Import unified-logger manquant');
    }
    
    if (serverContent.includes('/api/performance/')) {
        success.push('OK: Endpoints performance configures');
    } else {
        warnings.push('ATTENTION: Endpoints performance manquants');
    }
    
} catch (error) {
    errors.push(`ERREUR: Impossible de lire server.js - ${error.message}`);
}

// Test de chargement des modules
console.log('\nTest de chargement des modules...');
try {
    const logger = require('./services/unified-logger');
    success.push('OK: unified-logger se charge');
} catch (error) {
    errors.push(`ERREUR: unified-logger - ${error.message}`);
}

try {
    const monitor = require('./services/performance-monitor');
    success.push('OK: performance-monitor se charge');
} catch (error) {
    errors.push(`ERREUR: performance-monitor - ${error.message}`);
}

try {
    const errorHandler = require('./services/error-handler');
    success.push('OK: error-handler se charge');
} catch (error) {
    errors.push(`ERREUR: error-handler - ${error.message}`);
}

try {
    const endpoints = require('./services/api-performance-endpoints');
    success.push('OK: api-performance-endpoints se charge');
} catch (error) {
    errors.push(`ERREUR: api-performance-endpoints - ${error.message}`);
}

// Afficher le resume
console.log('\n' + '='.repeat(50));
console.log('RESUME DE LA VERIFICATION');
console.log('='.repeat(50));

if (success.length > 0) {
    console.log('\nSUCCES:');
    success.forEach(msg => console.log(`  ${msg}`));
}

if (warnings.length > 0) {
    console.log('\nAVERTISSEMENTS:');
    warnings.forEach(msg => console.log(`  ${msg}`));
}

if (errors.length > 0) {
    console.log('\nERREURS:');
    errors.forEach(msg => console.log(`  ${msg}`));
}

console.log('\n' + '='.repeat(50));

if (errors.length === 0) {
    console.log('INTEGRATION REUSSIE - Le systeme est pret!');
    console.log('\nPROCHAINES ETAPES:');
    console.log('  1. Lancer: node server.js');
    console.log('  2. Ouvrir: http://localhost:3005');
    console.log('  3. Tester: performance-dashboard.html');
} else {
    console.log('INTEGRATION INCOMPLETE - Corriger les erreurs');
}

process.exit(errors.length === 0 ? 0 : 1);
