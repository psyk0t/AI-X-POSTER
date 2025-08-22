/**
 * Script de configuration d'un client
 * Usage: node setup-client.js 890 300
 * Paramètres: [totalCredits] [dailyLimit]
 */

const { loadQuotas, saveQuotas, addCredits } = require('./services/quotas');

function setupClient(totalCredits, dailyLimit = 300) {
    console.log(`🎯 Configuration d'un nouveau client :`);
    console.log(`   - Crédits totaux : ${totalCredits}`);
    console.log(`   - Limite journalière : ${dailyLimit}`);
    
    // Charger les quotas existants
    let quotas = loadQuotas();
    
    // Réinitialiser pour un nouveau client
    quotas.totalCredits = totalCredits;
    quotas.usedCredits = 0;
    quotas.dailyLimit = dailyLimit;
    quotas.dailyUsed = { like: 0, retweet: 0, reply: 0 };
    quotas.lastReset = new Date().toISOString().split('T')[0];
    
    // Configuration par défaut optimisée
    quotas.distribution = {
        like: 50,    // 50% des actions
        retweet: 20, // 20% des actions  
        reply: 30    // 30% des actions
    };
    
    quotas.enabledActions = ['like', 'retweet', 'reply'];
    
    // Optionnel : Ajouter l'historique d'achat
    if (!quotas.purchaseHistory) quotas.purchaseHistory = [];
    quotas.purchaseHistory.push({
        date: new Date().toISOString(),
        credits: totalCredits,
        pack: `custom-${totalCredits}`,
        price: null, // À remplir si nécessaire
        clientId: `client-${Date.now()}`
    });
    
    // Sauvegarder
    saveQuotas(quotas);
    
    console.log(`✅ Client configuré avec succès !`);
    console.log(`📊 Répartition journalière :`);
    console.log(`   - Likes : ${Math.floor(dailyLimit * 50 / 100)} (50%)`);
    console.log(`   - Retweets : ${Math.floor(dailyLimit * 20 / 100)} (20%)`);
    console.log(`   - Replies : ${Math.floor(dailyLimit * 30 / 100)} (30%)`);
    console.log(`💾 Fichier sauvegardé : quotas-data.json`);
    
    return quotas;
}

// Utilisation en ligne de commande
if (require.main === module) {
    const args = process.argv.slice(2);
    const totalCredits = parseInt(args[0]) || 890;
    const dailyLimit = parseInt(args[1]) || 300;
    
    setupClient(totalCredits, dailyLimit);
}

module.exports = { setupClient };
