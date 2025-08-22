const { getMasterQuotaManager } = require('./services/master-quota-manager');

/**
 * Script pour recalculer les allocations de quotas après correction du dailyLimit
 */

console.log('=== RECALCUL DES QUOTAS ===\n');

try {
    const masterQuota = getMasterQuotaManager();
    
    console.log('1. ÉTAT AVANT RECALCUL:');
    const dataBefore = masterQuota.data;
    console.log(`   - dailyLimit: ${dataBefore.dailyQuotas.dailyLimit}`);
    console.log(`   - perAccountDaily (ancien): ${dataBefore.allocation.perAccountDaily}`);
    console.log(`   - Comptes actifs: ${Object.values(dataBefore.connectedAccounts).filter(acc => acc.isActive).length}`);
    
    console.log('\n2. RECALCUL EN COURS...');
    const newAllocation = masterQuota.recalculateAllocation();
    
    console.log('\n3. ÉTAT APRÈS RECALCUL:');
    console.log(`   - dailyLimit: ${masterQuota.data.dailyQuotas.dailyLimit}`);
    console.log(`   - perAccountDaily (nouveau): ${newAllocation.perAccountDaily}`);
    console.log(`   - perAccountQuota: ${newAllocation.perAccountQuota}`);
    
    console.log('\n4. DÉTAIL PAR COMPTE:');
    Object.entries(masterQuota.data.connectedAccounts).forEach(([id, acc]) => {
        if (acc.isActive) {
            console.log(`   - ${acc.username}: ${newAllocation.perAccountDaily} actions/jour`);
        }
    });
    
    console.log('\n✅ Recalcul terminé avec succès !');
    console.log(`Chaque compte peut maintenant effectuer ${newAllocation.perAccountDaily} actions par jour.`);
    
} catch (error) {
    console.log(`❌ ERREUR: ${error.message}`);
}

console.log('\n=== FIN RECALCUL ===');
