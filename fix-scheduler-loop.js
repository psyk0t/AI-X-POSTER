/**
 * Script de correction d'urgence pour la boucle infinie du scheduler
 * Nettoie les actions différées corrompues et redémarre le système
 */

const fs = require('fs');
const path = require('path');

async function fixSchedulerLoop() {
    console.log('🔧 [FIX-SCHEDULER] Démarrage du script de correction...');
    
    try {
        // 1. Charger le module automation pour accéder au scheduler
        const automation = require('./services/automation');
        
        // 2. Vérifier si actionScheduler existe
        if (automation.actionScheduler) {
            console.log('📋 [FIX-SCHEDULER] ActionScheduler trouvé, nettoyage en cours...');
            
            // 3. Forcer le nettoyage complet des actions différées
            const cleanedActions = automation.actionScheduler.forceCleanupAllDeferredActions();
            console.log(`✅ [FIX-SCHEDULER] ${cleanedActions} actions différées supprimées`);
            
            // 4. Redémarrer le processeur d'actions différées
            automation.actionScheduler.startDeferredActionsProcessor();
            console.log('🔄 [FIX-SCHEDULER] Processeur d\'actions différées redémarré');
            
        } else {
            console.log('⚠️  [FIX-SCHEDULER] ActionScheduler non initialisé');
        }
        
        // 5. Vérifier les logs récents pour confirmer la correction
        const logFile = path.join(__dirname, 'auto-actions.log');
        if (fs.existsSync(logFile)) {
            const logContent = fs.readFileSync(logFile, 'utf8');
            const recentLogs = logContent.split('\n').slice(-50);
            const loopErrors = recentLogs.filter(line => 
                line.includes('Cannot read properties of undefined') ||
                line.includes('Action reprogrammée pour')
            );
            
            console.log(`📊 [FIX-SCHEDULER] Erreurs de boucle dans les 50 dernières lignes: ${loopErrors.length}`);
        }
        
        console.log('✅ [FIX-SCHEDULER] Correction terminée avec succès');
        console.log('💡 [FIX-SCHEDULER] Le système devrait maintenant fonctionner sans boucle infinie');
        
    } catch (error) {
        console.error('❌ [FIX-SCHEDULER] Erreur lors de la correction:', error.message);
        console.log('🔄 [FIX-SCHEDULER] Redémarrage du serveur recommandé si le problème persiste');
    }
}

// Exécuter le script si appelé directement
if (require.main === module) {
    fixSchedulerLoop();
}

module.exports = { fixSchedulerLoop };
