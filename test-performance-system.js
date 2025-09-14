/**
 * 🧪 SCRIPT DE TEST POUR LE SYSTÈME DE PERFORMANCE
 * Test rapide des nouveaux services avant intégration complète
 */

console.log('🚀 Test du système de performance optimisé...\n');

async function testServices() {
    try {
        // Test 1: UnifiedLogger
        console.log('📝 Test UnifiedLogger...');
        const { getUnifiedLogger } = require('./services/unified-logger');
        const logger = getUnifiedLogger();
        
        await logger.log('INFO', 'Test du logger unifié');
        await logger.logError('Test erreur', new Error('Erreur de test'));
        await logger.logSuccess('Test succès');
        
        const stats = logger.getStats();
        console.log(`✅ Logger: ${stats.total} logs, ${stats.cached} en cache`);
        
        // Test 2: PerformanceMonitor
        console.log('📊 Test PerformanceMonitor...');
        const { getPerformanceMonitor } = require('./services/performance-monitor');
        const monitor = getPerformanceMonitor();
        
        // Simuler quelques métriques
        monitor.recordApiCall(150, true);
        monitor.recordApiCall(200, false);
        monitor.recordAutomationScan(5000, 25, 8, true);
        
        const health = monitor.getSystemHealth();
        console.log(`✅ Monitor: Santé ${health.status}, Uptime ${health.uptime}ms`);
        
        // Test 3: ErrorHandler
        console.log('🚨 Test ErrorHandler...');
        const { getErrorHandler } = require('./services/error-handler');
        const errorHandler = getErrorHandler();
        
        const testError = new Error('Rate limit exceeded');
        testError.code = '429';
        const result = await errorHandler.handleError(testError, { operation: 'test' });
        console.log(`✅ ErrorHandler: Catégorie ${result.category}, Géré: ${result.handled}`);
        
        // Test 4: API Endpoints (simulation)
        console.log('🌐 Test API Endpoints...');
        const endpoints = require('./services/api-performance-endpoints');
        
        // Mock request/response pour test
        const mockReq = { query: { limit: 10 } };
        const mockRes = {
            json: (data) => {
                console.log(`✅ API Response: success=${data.success}, logs=${data.logs?.length || 0}`);
            },
            status: () => mockRes
        };
        
        await endpoints.getLogs(mockReq, mockRes);
        
        console.log('\n🎉 Tous les tests réussis! Le système est opérationnel.');
        
        // Nettoyage
        await logger.flush();
        monitor.cleanup();
        errorHandler.cleanup();
        
    } catch (error) {
        console.error('❌ Erreur lors des tests:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Exécuter les tests
testServices().then(() => {
    console.log('\n✅ Tests terminés avec succès');
    process.exit(0);
}).catch(error => {
    console.error('\n❌ Tests échoués:', error);
    process.exit(1);
});
