/**
 * Script de migration pour initialiser le cache persistant des statistiques d'actions
 * À exécuter une seule fois pour migrer les données existantes
 */

const { recalculateFromLogs, getStats } = require('./services/actions-stats');
const { getFilteredLogsFromFile } = require('./services/logs-optimized');

console.log('🔄 Migration des statistiques d\'actions vers le cache persistant...');

// Lire tous les logs disponibles pour la migration
console.log('📖 Lecture des logs existants...');
const logs = getFilteredLogsFromFile(10000, 0); // Lire beaucoup de logs pour la migration

console.log(`📊 ${logs.logs.length} logs trouvés, ${logs.total} au total`);

// Recalculer les statistiques
console.log('🧮 Recalcul des statistiques...');
recalculateFromLogs(logs);

// Afficher le résultat
const finalStats = getStats();
console.log('✅ Migration terminée !');
console.log('📈 Statistiques finales:');
console.log('   - All-time:', finalStats.allTime);
console.log('   - Today:', finalStats.today);
console.log('   - This hour:', finalStats.thisHour);
console.log('   - Dernière mise à jour:', finalStats.lastUpdate);

console.log('\n🎯 Le cache persistant est maintenant configuré.');
console.log('   Les statistiques résisteront aux redémarrages du serveur.');
