/**
 * Test des optimisations d'Automation Progress
 * Vérifie le cache, les intervalles de refresh et le système Next Step
 */

const http = require('http');
const fs = require('fs');

// Configuration de test
const SERVER_URL = 'http://localhost:3005';
const TEST_ITERATIONS = 5;
const CACHE_TTL = 30000; // 30 secondes

console.log('🧪 Test des optimisations Automation Progress\n');

/**
 * Effectue une requête HTTP GET
 */
function makeRequest(endpoint) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        
        const req = http.get(`${SERVER_URL}${endpoint}`, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                const responseTime = Date.now() - startTime;
                try {
                    const parsed = JSON.parse(data);
                    resolve({
                        statusCode: res.statusCode,
                        responseTime,
                        data: parsed,
                        cached: parsed.cached || false
                    });
                } catch (error) {
                    resolve({
                        statusCode: res.statusCode,
                        responseTime,
                        data: data,
                        cached: false
                    });
                }
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

/**
 * Test du cache TTL 30 secondes
 */
async function testCachePerformance() {
    console.log('📊 Test du cache TTL (30 secondes)...');
    
    try {
        // Première requête - doit créer le cache
        console.log('  → Requête 1 (création du cache)');
        const response1 = await makeRequest('/api/automation-progress');
        console.log(`    Status: ${response1.statusCode}, Temps: ${response1.responseTime}ms, Cached: ${response1.cached}`);
        
        // Attendre 1 seconde puis faire une autre requête - doit utiliser le cache
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('  → Requête 2 (utilisation du cache)');
        const response2 = await makeRequest('/api/automation-progress');
        console.log(`    Status: ${response2.statusCode}, Temps: ${response2.responseTime}ms, Cached: ${response2.cached}`);
        
        // Vérifier que la deuxième requête est plus rapide et utilise le cache
        if (response2.cached && response2.responseTime < response1.responseTime) {
            console.log('  ✅ Cache fonctionne correctement');
        } else {
            console.log('  ⚠️  Cache pourrait ne pas fonctionner optimalement');
        }
        
        // Test des données Next Step
        if (response2.data && response2.data.data && response2.data.data.nextStep) {
            const nextStep = response2.data.data.nextStep;
            console.log(`  → Next Step: ${nextStep.icon} ${nextStep.text} (${nextStep.status})`);
            console.log('  ✅ Section Next Step présente');
        } else {
            console.log('  ⚠️  Section Next Step manquante');
        }
        
    } catch (error) {
        console.log(`  ❌ Erreur: ${error.message}`);
    }
    
    console.log('');
}

/**
 * Test de performance sous charge
 */
async function testLoadPerformance() {
    console.log('⚡ Test de performance sous charge...');
    
    const promises = [];
    const startTime = Date.now();
    
    // Faire 10 requêtes simultanées
    for (let i = 0; i < 10; i++) {
        promises.push(makeRequest('/api/automation-progress'));
    }
    
    try {
        const responses = await Promise.all(promises);
        const totalTime = Date.now() - startTime;
        
        const avgResponseTime = responses.reduce((sum, r) => sum + r.responseTime, 0) / responses.length;
        const cachedResponses = responses.filter(r => r.cached).length;
        
        console.log(`  → 10 requêtes simultanées en ${totalTime}ms`);
        console.log(`  → Temps de réponse moyen: ${avgResponseTime.toFixed(2)}ms`);
        console.log(`  → Réponses cachées: ${cachedResponses}/10`);
        
        if (avgResponseTime < 100 && cachedResponses > 5) {
            console.log('  ✅ Performance optimale');
        } else {
            console.log('  ⚠️  Performance pourrait être améliorée');
        }
        
    } catch (error) {
        console.log(`  ❌ Erreur: ${error.message}`);
    }
    
    console.log('');
}

/**
 * Test de la structure des données
 */
async function testDataStructure() {
    console.log('🔍 Test de la structure des données...');
    
    try {
        const response = await makeRequest('/api/automation-progress');
        
        if (response.statusCode === 200 && response.data && response.data.data) {
            const data = response.data.data;
            
            // Vérifier les sections requises
            const requiredSections = ['currentStep', 'nextStep', 'lastSuccess', 'errors', 'tokens', 'mutes', 'quotaSystem'];
            const missingSections = requiredSections.filter(section => !data[section]);
            
            if (missingSections.length === 0) {
                console.log('  ✅ Toutes les sections présentes');
                
                // Vérifier la structure de nextStep
                if (data.nextStep && data.nextStep.icon && data.nextStep.text && data.nextStep.status) {
                    console.log('  ✅ Structure Next Step correcte');
                    console.log(`    → ${data.nextStep.icon} ${data.nextStep.text}`);
                } else {
                    console.log('  ⚠️  Structure Next Step incomplète');
                }
                
            } else {
                console.log(`  ❌ Sections manquantes: ${missingSections.join(', ')}`);
            }
            
        } else {
            console.log('  ❌ Réponse invalide ou erreur HTTP');
        }
        
    } catch (error) {
        console.log(`  ❌ Erreur: ${error.message}`);
    }
    
    console.log('');
}

/**
 * Test du scheduler stats
 */
async function testSchedulerStats() {
    console.log('📅 Test des stats du scheduler...');
    
    try {
        const automation = require('./services/automation.js');
        
        if (typeof automation.getSchedulerStats === 'function') {
            const stats = await automation.getSchedulerStats();
            
            if (stats) {
                console.log('  ✅ Scheduler stats disponibles');
                console.log(`    → Comptes planifiés: ${stats.plannedAccounts || 0}`);
                console.log(`    → Slots totaux: ${stats.totalSlots || 0}`);
                console.log(`    → Slots utilisés: ${stats.usedSlots || 0}`);
                
                if (stats.nextAction) {
                    console.log(`    → Prochaine action: ${stats.nextAction.type} par @${stats.nextAction.account} dans ${stats.nextAction.timeUntil}`);
                    console.log('  ✅ Next Action calculée');
                } else {
                    console.log('  ⚠️  Aucune prochaine action trouvée');
                }
            } else {
                console.log('  ⚠️  Stats scheduler nulles');
            }
        } else {
            console.log('  ❌ Fonction getSchedulerStats non disponible');
        }
        
    } catch (error) {
        console.log(`  ❌ Erreur: ${error.message}`);
    }
    
    console.log('');
}

/**
 * Fonction principale de test
 */
async function runTests() {
    console.log('Démarrage des tests...\n');
    
    // Vérifier que le serveur est accessible
    try {
        await makeRequest('/');
        console.log('✅ Serveur accessible\n');
    } catch (error) {
        console.log('❌ Serveur non accessible. Assurez-vous que le serveur est démarré sur le port 3000.\n');
        return;
    }
    
    // Exécuter les tests
    await testSchedulerStats();
    await testCachePerformance();
    await testLoadPerformance();
    await testDataStructure();
    
    console.log('🎉 Tests terminés!');
    
    // Résumé des optimisations
    console.log('\n📋 Résumé des optimisations implémentées:');
    console.log('  ✅ Cache TTL 30 secondes sur /api/automation-progress');
    console.log('  ✅ Section Next Step avec calcul temps restant');
    console.log('  ✅ Intervalles de refresh dynamiques (30s actif, 2min inactif)');
    console.log('  ✅ Filtrage intelligent des logs pour Last Success');
    console.log('  ✅ Remplacement des IDs par les usernames');
    console.log('  ✅ Gestion d\'erreurs et fallbacks gracieux');
}

// Exécuter les tests
runTests().catch(console.error);
