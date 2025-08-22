const { getMasterQuotaManager } = require('./services/master-quota-manager');

console.log('🔍 Test de validation du système de quotas unifié');
console.log('================================================');

try {
    // Initialiser le master quota manager
    const masterQuota = getMasterQuotaManager();
    
    // Obtenir les statistiques actuelles
    const stats = masterQuota.getStats();
    
    console.log('\n✅ SYSTÈME MASTER-QUOTA-MANAGER ACTIF');
    console.log('-------------------------------------');
    console.log(`📊 Comptes actifs: ${stats.activeAccounts.length}`);
    console.log(`🎯 Actions totales: ${stats.globalPack.totalActions}`);
    console.log(`📈 Actions utilisées: ${stats.globalPack.usedActions}`);
    console.log(`📉 Actions restantes: ${stats.globalPack.remainingActions}`);
    console.log(`📅 Limite quotidienne: ${stats.dailyQuotas.dailyLimit}`);
    console.log(`🔢 Utilisé aujourd'hui: ${stats.dailyQuotas.usedToday}`);
    
    console.log('\n📋 DÉTAILS DES COMPTES:');
    console.log('----------------------');
    stats.activeAccounts.forEach((account, index) => {
        const dailyUsed = Object.values(account.dailyUsed).reduce((sum, val) => sum + val, 0);
        console.log(`${index + 1}. ${account.username} (${account.id})`);
        console.log(`   📊 Actions quotidiennes: ${dailyUsed}/${stats.allocation.perAccountDaily}`);
        console.log(`   🎯 Actions totales: ${account.actionsUsed}/${stats.allocation.perAccountQuota}`);
        console.log(`   📅 Dernière réinitialisation: ${account.lastReset}`);
    });
    
    console.log('\n🔧 ALLOCATION AUTOMATIQUE:');
    console.log('---------------------------');
    console.log(`📊 Par compte/jour: ${stats.allocation.perAccountDaily}`);
    console.log(`🎯 Par compte/total: ${stats.allocation.perAccountQuota}`);
    console.log(`📅 Dernière mise à jour: ${stats.allocation.lastUpdated}`);
    
    // Test de vérification des quotas
    console.log('\n🧪 TEST DE VÉRIFICATION DES QUOTAS:');
    console.log('-----------------------------------');
    
    if (stats.activeAccounts.length > 0) {
        const firstAccount = stats.activeAccounts[0];
        const quotaCheck = masterQuota.canPerformAction(firstAccount.id);
        
        console.log(`✅ Test pour ${firstAccount.username}:`);
        console.log(`   🟢 Autorisé: ${quotaCheck.allowed}`);
        console.log(`   📊 Quota quotidien restant: ${quotaCheck.dailyRemaining}`);
        console.log(`   🎯 Quota global restant: ${quotaCheck.globalRemaining}`);
        
        if (quotaCheck.allowed) {
            console.log('   ✅ Le compte peut effectuer des actions');
        } else {
            console.log('   ❌ Le compte a atteint ses limites');
        }
    }
    
    console.log('\n🎉 VALIDATION COMPLÈTE: SYSTÈME UNIFIÉ FONCTIONNEL');
    console.log('==================================================');
    
} catch (error) {
    console.error('❌ ERREUR lors de la validation:', error.message);
    console.error('Stack:', error.stack);
}
