/**
 * Test du système de récupération automatique des scans
 */

const { getScanRecoveryService } = require('./services/scan-recovery');

async function testScanRecovery() {
    console.log('=== TEST DU SYSTÈME DE RÉCUPÉRATION DES SCANS ===\n');
    
    const scanRecovery = getScanRecoveryService();
    
    // Test 1: Démarrer le monitoring
    console.log('1. Démarrage du monitoring...');
    scanRecovery.startMonitoring();
    
    // Test 2: Simuler un scan normal
    console.log('2. Simulation d\'un scan normal...');
    global.isAutomationScanning = true;
    scanRecovery.markScanStart();
    
    // Attendre 2 secondes puis terminer normalement
    setTimeout(() => {
        console.log('   - Fin normale du scan');
        global.isAutomationScanning = false;
        scanRecovery.markScanEnd();
    }, 2000);
    
    // Test 3: Simuler un scan bloqué après 5 secondes
    setTimeout(() => {
        console.log('3. Simulation d\'un scan bloqué...');
        global.isAutomationScanning = true;
        scanRecovery.markScanStart();
        
        // Ne pas terminer le scan - laisser le système de récupération intervenir
        console.log('   - Scan laissé en cours pour test de récupération automatique');
    }, 5000);
    
    // Test 4: Vérifier les statistiques
    setTimeout(() => {
        console.log('4. Vérification des statistiques...');
        const stats = scanRecovery.getStats();
        console.log('   Stats:', JSON.stringify(stats, null, 2));
    }, 8000);
    
    // Test 5: Test de déblocage d'urgence
    setTimeout(() => {
        console.log('5. Test de déblocage d\'urgence...');
        global.isAutomationScanning = true;
        scanRecovery.emergencyUnblock();
        console.log('   - Flag après déblocage:', global.isAutomationScanning);
    }, 12000);
    
    // Arrêter le test après 15 secondes
    setTimeout(() => {
        console.log('\n=== FIN DU TEST ===');
        scanRecovery.stopMonitoring();
        process.exit(0);
    }, 15000);
}

// Lancer le test
testScanRecovery().catch(console.error);
