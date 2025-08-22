// Script de correction définitive pour le dashboard analytics
// Ce script va forcer la mise à jour des données analytics

console.log('🚀 CORRECTION ANALYTICS - DÉBUT');

async function forceRefreshAnalytics() {
    try {
        console.log('📡 Appel API analytics...');
        const response = await fetch('http://localhost:3005/api/analytics/dashboard');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('📊 Données reçues:', data);
        
        if (data.success && data.metrics) {
            // Mise à jour forcée des éléments
            const updates = [
                { id: 'analyticsLikesCount', value: data.metrics.summary.likes?.total || 0 },
                { id: 'analyticsRetweetsCount', value: data.metrics.summary.retweets?.total || 0 },
                { id: 'analyticsCommentsCount', value: data.metrics.summary.comments?.total || 0 },
                { id: 'analyticsTotalCount', value: data.metrics.summary.total?.total || 0 },
                { id: 'analyticsSuccessRate', value: `${Math.round((data.metrics.performance.successRate || 0) * 100)}%` },
                { id: 'analyticsResponseTime', value: `${Math.round(data.metrics.performance.averageResponseTime || 0)}ms` },
                { id: 'analyticsErrorCount', value: data.metrics.performance.errorCount || 0 },
                { id: 'analyticsActiveAccounts', value: data.metrics.topAccounts?.length || 0 },
                { id: 'analyticsQuotaEfficiency', value: `${Math.round(data.metrics.quotaEfficiency || 0)}%` }
            ];
            
            let successCount = 0;
            updates.forEach(update => {
                const element = document.getElementById(update.id);
                if (element) {
                    element.textContent = update.value;
                    console.log(`✅ ${update.id}: ${update.value}`);
                    successCount++;
                } else {
                    console.warn(`⚠️ Élément non trouvé: ${update.id}`);
                }
            });
            
            // Mise à jour de l'heure
            const lastUpdateEl = document.getElementById('analyticsLastUpdate');
            if (lastUpdateEl) {
                lastUpdateEl.textContent = new Date().toLocaleTimeString('fr-FR');
                console.log('🕒 Heure mise à jour');
            }
            
            console.log(`🎉 SUCCÈS! ${successCount}/${updates.length} éléments mis à jour`);
            
            // Notification visuelle de succès
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #4CAF50;
                color: white;
                padding: 15px 20px;
                border-radius: 8px;
                z-index: 9999;
                font-weight: bold;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            `;
            notification.innerHTML = `✅ Analytics mis à jour! (${successCount} éléments)`;
            document.body.appendChild(notification);
            
            setTimeout(() => notification.remove(), 3000);
            
        } else {
            throw new Error('Données analytics invalides');
        }
        
    } catch (error) {
        console.error('❌ Erreur:', error);
        
        // Notification d'erreur
        const errorNotification = document.createElement('div');
        errorNotification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #f44336;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            z-index: 9999;
            font-weight: bold;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        errorNotification.innerHTML = `❌ Erreur Analytics: ${error.message}`;
        document.body.appendChild(errorNotification);
        
        setTimeout(() => errorNotification.remove(), 5000);
    }
}

// Exécution immédiate
forceRefreshAnalytics();

// Répétition toutes les 30 secondes
setInterval(forceRefreshAnalytics, 30000);

console.log('🔄 Script de correction analytics activé (répétition toutes les 30s)');
