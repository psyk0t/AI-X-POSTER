/**
 * 🔍 SCRIPT DE VÉRIFICATION D'INTÉGRATION
 * Vérifie que tous les nouveaux services s'intègrent correctement sans erreurs
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Vérification de l\'intégration du système optimisé...\n');

let errors = [];
let warnings = [];
let success = [];

// Fonction utilitaire pour vérifier l'existence des fichiers
function checkFile(filePath, description) {
    if (fs.existsSync(filePath)) {
        success.push(`✅ ${description}: ${path.basename(filePath)}`);
        return true;
    } else {
        errors.push(`❌ ${description} manquant: ${filePath}`);
        return false;
    }
}

// Fonction pour vérifier les imports/exports
function checkModuleExports(filePath, expectedExports) {
    try {
        const module = require(filePath);
        const missing = [];
        
        expectedExports.forEach(exportName => {
            if (typeof module[exportName] === 'undefined') {
                missing.push(exportName);
            }
        });
        
        if (missing.length === 0) {
            success.push(`✅ Exports corrects dans ${path.basename(filePath)}`);
        } else {
            warnings.push(`⚠️ Exports manquants dans ${path.basename(filePath)}: ${missing.join(', ')}`);
        }
        
        return missing.length === 0;
    } catch (error) {
        errors.push(`❌ Erreur de chargement ${path.basename(filePath)}: ${error.message}`);
        return false;
    }
}

async function verifyIntegration() {
    console.log('📁 Vérification des fichiers créés...');
    
    // Vérifier les nouveaux services
    const serviceFiles = [
        ['./services/unified-logger.js', 'Service UnifiedLogger'],
        ['./services/performance-monitor.js', 'Service PerformanceMonitor'],
        ['./services/error-handler.js', 'Service ErrorHandler'],
        ['./services/api-performance-endpoints.js', 'Endpoints API Performance']
    ];
    
    serviceFiles.forEach(([file, desc]) => {
        checkFile(file, desc);
    });
    
    // Vérifier les fichiers d'interface
    checkFile('./performance-dashboard.html', 'Dashboard Performance');
    checkFile('./RESUME-OPTIMISATIONS.md', 'Documentation');
    
    console.log('\n🔧 Vérification des exports de modules...');
    
    // Vérifier les exports des services
    if (fs.existsSync('./services/unified-logger.js')) {
        checkModuleExports('./services/unified-logger.js', ['UnifiedLogger', 'getUnifiedLogger', 'logToFile']);
    }
    
    if (fs.existsSync('./services/performance-monitor.js')) {
        checkModuleExports('./services/performance-monitor.js', ['PerformanceMonitor', 'getPerformanceMonitor']);
    }
    
    if (fs.existsSync('./services/error-handler.js')) {
        checkModuleExports('./services/error-handler.js', ['ErrorHandler', 'getErrorHandler', 'withErrorHandling']);
    }
    
    if (fs.existsSync('./services/api-performance-endpoints.js')) {
        checkModuleExports('./services/api-performance-endpoints.js', [
            'getSystemMetrics', 'getAutomationMetrics', 'getApiMetrics', 
            'getErrorMetrics', 'getSystemHealth', 'getLogs'
        ]);
    }
    
    console.log('\n⚙️ Vérification de l\'intégration server.js...');
    
    // Vérifier les modifications dans server.js
    try {
        const serverContent = fs.readFileSync('./server.js', 'utf8');
        
        // Vérifier les imports des nouveaux services
        if (serverContent.includes("require('./services/unified-logger')")) {
            success.push('✅ Import UnifiedLogger dans server.js');
        } else {
            warnings.push('⚠️ Import UnifiedLogger manquant dans server.js');
        }
        
        if (serverContent.includes("require('./services/performance-monitor')")) {
            success.push('✅ Import PerformanceMonitor dans server.js');
        } else {
            warnings.push('⚠️ Import PerformanceMonitor manquant dans server.js');
        }
        
        if (serverContent.includes("require('./services/error-handler')")) {
            success.push('✅ Import ErrorHandler dans server.js');
        } else {
            warnings.push('⚠️ Import ErrorHandler manquant dans server.js');
        }
        
        // Vérifier les nouveaux endpoints
        const expectedEndpoints = [
            '/api/performance/system',
            '/api/performance/automation',
            '/api/performance/health',
            '/api/logs'
        ];
        
        expectedEndpoints.forEach(endpoint => {
            if (serverContent.includes(endpoint)) {
                success.push(`✅ Endpoint ${endpoint} configuré`);
            } else {
                warnings.push(`⚠️ Endpoint ${endpoint} manquant`);
            }
        });
        
        // Vérifier le lazy loading
        if (serverContent.includes('getUnifiedLoggerInstance')) {
            success.push('✅ Lazy loading configuré pour les nouveaux services');
        } else {
            warnings.push('⚠️ Lazy loading non configuré');
        }
        
        // Vérifier le cleanup dans gracefulShutdown
        if (serverContent.includes('unified-logger cleanup')) {
            success.push('✅ Cleanup des nouveaux services configuré');
        } else {
            warnings.push('⚠️ Cleanup des nouveaux services manquant');
        }
        
    } catch (error) {
        errors.push(`❌ Erreur lecture server.js: ${error.message}`);
    }
    
    console.log('\n🌐 Vérification du dashboard...');
    
    // Vérifier le contenu du dashboard
    if (fs.existsSync('./performance-dashboard.html')) {
        try {
            const dashboardContent = fs.readFileSync('./performance-dashboard.html', 'utf8');
            
            if (dashboardContent.includes('/api/performance/')) {
                success.push('✅ Dashboard connecté aux APIs performance');
            } else {
                warnings.push('⚠️ Dashboard non connecté aux APIs');
            }
            
            if (dashboardContent.includes('common.css')) {
                success.push('✅ Dashboard utilise le style unifié');
            } else {
                warnings.push('⚠️ Dashboard sans style unifié');
            }
            
        } catch (error) {
            errors.push(`❌ Erreur lecture dashboard: ${error.message}`);
        }
    }
    
    console.log('\n🧪 Test de chargement des modules...');
    
    // Test de chargement basique des nouveaux services
    try {
        const { getUnifiedLogger } = require('./services/unified-logger');
        const logger = getUnifiedLogger();
        if (logger && typeof logger.log === 'function') {
            success.push('✅ UnifiedLogger se charge correctement');
        } else {
            warnings.push('⚠️ UnifiedLogger chargé mais interface incorrecte');
        }
    } catch (error) {
        errors.push(`❌ Erreur chargement UnifiedLogger: ${error.message}`);
    }
    
    try {
        const { getPerformanceMonitor } = require('./services/performance-monitor');
        const monitor = getPerformanceMonitor();
        if (monitor && typeof monitor.getMetrics === 'function') {
            success.push('✅ PerformanceMonitor se charge correctement');
        } else {
            warnings.push('⚠️ PerformanceMonitor chargé mais interface incorrecte');
        }
    } catch (error) {
        errors.push(`❌ Erreur chargement PerformanceMonitor: ${error.message}`);
    }
    
    try {
        const { getErrorHandler } = require('./services/error-handler');
        const errorHandler = getErrorHandler();
        if (errorHandler && typeof errorHandler.handleError === 'function') {
            success.push('✅ ErrorHandler se charge correctement');
        } else {
            warnings.push('⚠️ ErrorHandler chargé mais interface incorrecte');
        }
    } catch (error) {
        errors.push(`❌ Erreur chargement ErrorHandler: ${error.message}`);
    }
    
    // Afficher le résumé
    console.log('\n' + '='.repeat(60));
    console.log('📊 RÉSUMÉ DE LA VÉRIFICATION');
    console.log('='.repeat(60));
    
    if (success.length > 0) {
        console.log('\n🎉 SUCCÈS:');
        success.forEach(msg => console.log(`  ${msg}`));
    }
    
    if (warnings.length > 0) {
        console.log('\n⚠️ AVERTISSEMENTS:');
        warnings.forEach(msg => console.log(`  ${msg}`));
    }
    
    if (errors.length > 0) {
        console.log('\n❌ ERREURS:');
        errors.forEach(msg => console.log(`  ${msg}`));
    }
    
    console.log('\n' + '='.repeat(60));
    
    if (errors.length === 0) {
        console.log('✅ INTÉGRATION RÉUSSIE - Le système est prêt à être utilisé!');
        console.log('\n📋 PROCHAINES ÉTAPES:');
        console.log('  1. Lancer le serveur: node server.js');
        console.log('  2. Ouvrir: http://localhost:3005');
        console.log('  3. Tester le dashboard: performance-dashboard.html');
        console.log('  4. Vérifier les APIs: /api/performance/health');
        
        if (warnings.length > 0) {
            console.log('\n⚠️ Note: Des avertissements sont présents mais n\'empêchent pas le fonctionnement');
        }
        
        return true;
    } else {
        console.log('❌ INTÉGRATION INCOMPLÈTE - Corriger les erreurs avant utilisation');
        return false;
    }
}

// Exécuter la vérification
verifyIntegration().then(success => {
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('\n💥 Erreur fatale lors de la vérification:', error);
    process.exit(1);
});
