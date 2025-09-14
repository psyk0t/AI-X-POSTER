const fetch = require('node-fetch');

async function testLiveAuth() {
    console.log('=== TEST AUTHENTIFICATION EN DIRECT ===\n');
    
    const baseUrl = 'http://localhost:3005';
    
    // 1. Test de connexion
    console.log('1. TEST DE CONNEXION:');
    try {
        const loginResponse = await fetch(`${baseUrl}/api/client-auth`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                clientId: 'admin',
                password: 'AdminSecure123!'
            }),
            redirect: 'manual'
        });
        
        console.log('Status de connexion:', loginResponse.status);
        console.log('Headers de réponse:', Object.fromEntries(loginResponse.headers));
        
        if (loginResponse.status === 302) {
            const location = loginResponse.headers.get('location');
            console.log('Redirection vers:', location);
            
            // Extraire le token de l'URL de redirection
            const tokenMatch = location.match(/token=([^&]+)/);
            if (tokenMatch) {
                const token = decodeURIComponent(tokenMatch[1]);
                console.log('Token extrait:', token.substring(0, 50) + '...');
                
                // 2. Test d'utilisation du token
                console.log('\n2. TEST D\'UTILISATION DU TOKEN:');
                
                const apiTests = [
                    '/api/accounts',
                    '/api/dashboard/overview',
                    '/api/analytics/performance'
                ];
                
                for (const endpoint of apiTests) {
                    try {
                        console.log(`\nTest ${endpoint}:`);
                        const apiResponse = await fetch(`${baseUrl}${endpoint}`, {
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Accept': 'application/json'
                            }
                        });
                        
                        console.log(`  Status: ${apiResponse.status}`);
                        
                        if (apiResponse.status === 200) {
                            const data = await apiResponse.json();
                            console.log(`  ✅ Succès - Données reçues:`, Object.keys(data));
                        } else {
                            const errorText = await apiResponse.text();
                            console.log(`  ❌ Erreur: ${errorText}`);
                        }
                    } catch (error) {
                        console.log(`  ❌ Exception: ${error.message}`);
                    }
                }
            } else {
                console.log('❌ Aucun token trouvé dans la redirection');
            }
        } else {
            const responseText = await loginResponse.text();
            console.log('Réponse de connexion:', responseText);
        }
        
    } catch (error) {
        console.error('Erreur de connexion:', error.message);
    }
}

testLiveAuth().catch(console.error);
