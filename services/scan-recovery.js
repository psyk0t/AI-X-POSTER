/**
 * Service de récupération automatique des scans bloqués
 * Évite les redémarrages serveur en cas de blocage du flag isAutomationScanning
 */

const { logSystem } = require('./log-manager');

class ScanRecoveryService {
    constructor() {
        this.recoveryInterval = null;
        this.maxScanDuration = 600000; // 10 minutes
        this.checkInterval = 60000; // Vérifier toutes les minutes
        this.lastScanStart = null;
        this.isMonitoring = false;
    }

    /**
     * Démarre le monitoring des scans
     */
    startMonitoring() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        logSystem('[SCAN-RECOVERY] Monitoring des scans démarré', 'scan-recovery', 'info');
        
        this.recoveryInterval = setInterval(() => {
            this.checkScanHealth();
        }, this.checkInterval);
    }

    /**
     * Arrête le monitoring
     */
    stopMonitoring() {
        if (this.recoveryInterval) {
            clearInterval(this.recoveryInterval);
            this.recoveryInterval = null;
        }
        this.isMonitoring = false;
        logSystem('[SCAN-RECOVERY] Monitoring des scans arrêté', 'scan-recovery', 'info');
    }

    /**
     * Marque le début d'un scan
     */
    markScanStart() {
        this.lastScanStart = Date.now();
        logSystem('[SCAN-RECOVERY] Scan démarré - monitoring activé', 'scan-recovery', 'debug');
    }

    /**
     * Marque la fin d'un scan
     */
    markScanEnd() {
        this.lastScanStart = null;
        logSystem('[SCAN-RECOVERY] Scan terminé - monitoring désactivé', 'scan-recovery', 'debug');
    }

    /**
     * Vérifie la santé du scan en cours
     */
    checkScanHealth() {
        // Vérifier si un scan est marqué comme en cours
        if (!global.isAutomationScanning) {
            return; // Pas de scan en cours
        }

        // Vérifier si on a un timestamp de début
        if (!this.lastScanStart) {
            // Scan marqué en cours mais pas de timestamp - situation anormale
            logSystem('[SCAN-RECOVERY] Scan marqué en cours sans timestamp - récupération', 'scan-recovery', 'warn');
            this.forceScanRecovery('No start timestamp');
            return;
        }

        // Vérifier la durée du scan
        const scanDuration = Date.now() - this.lastScanStart;
        
        if (scanDuration > this.maxScanDuration) {
            logSystem(`[SCAN-RECOVERY] Scan bloqué détecté (${Math.round(scanDuration/60000)}min) - récupération forcée`, 'scan-recovery', 'error');
            this.forceScanRecovery(`Timeout after ${Math.round(scanDuration/60000)} minutes`);
        } else if (scanDuration > 300000) { // 5 minutes
            logSystem(`[SCAN-RECOVERY] Scan long détecté (${Math.round(scanDuration/60000)}min) - surveillance renforcée`, 'scan-recovery', 'warn');
        }
    }

    /**
     * Force la récupération d'un scan bloqué
     */
    forceScanRecovery(reason) {
        logSystem(`[SCAN-RECOVERY] RÉCUPÉRATION FORCÉE: ${reason}`, 'scan-recovery', 'error');
        
        // Débloquer le flag global
        global.isAutomationScanning = false;
        this.lastScanStart = null;
        
        // Log de récupération
        logSystem('[SCAN-RECOVERY] Flag isAutomationScanning remis à false', 'scan-recovery', 'info');
        logSystem('[SCAN-RECOVERY] Système débloqué - prochains scans autorisés', 'scan-recovery', 'info');
        
        // Optionnel: déclencher une notification ou un webhook
        this.notifyRecovery(reason);
    }

    /**
     * Notifie la récupération (peut être étendu pour webhooks, emails, etc.)
     */
    notifyRecovery(reason) {
        const recoveryInfo = {
            timestamp: new Date().toISOString(),
            reason: reason,
            action: 'Automatic scan recovery performed',
            status: 'System unblocked'
        };
        
        logSystem(`[SCAN-RECOVERY] Recovery completed: ${JSON.stringify(recoveryInfo)}`, 'scan-recovery', 'info');
    }

    /**
     * Obtient les statistiques du service
     */
    getStats() {
        return {
            isMonitoring: this.isMonitoring,
            maxScanDuration: this.maxScanDuration,
            checkInterval: this.checkInterval,
            currentScanStart: this.lastScanStart,
            currentScanDuration: this.lastScanStart ? Date.now() - this.lastScanStart : null,
            globalScanFlag: global.isAutomationScanning || false
        };
    }

    /**
     * Méthode d'urgence pour débloquer manuellement
     */
    emergencyUnblock() {
        logSystem('[SCAN-RECOVERY] DÉBLOCAGE D\'URGENCE MANUEL', 'scan-recovery', 'error');
        global.isAutomationScanning = false;
        this.lastScanStart = null;
        logSystem('[SCAN-RECOVERY] Système débloqué manuellement', 'scan-recovery', 'info');
    }
}

// Instance singleton
let scanRecoveryInstance = null;

/**
 * Obtient l'instance du service de récupération
 */
function getScanRecoveryService() {
    if (!scanRecoveryInstance) {
        scanRecoveryInstance = new ScanRecoveryService();
    }
    return scanRecoveryInstance;
}

module.exports = {
    getScanRecoveryService,
    ScanRecoveryService
};
