// Composant bouton flottant d'automation - à inclure sur toutes les pages sauf access.html

// CSS pour le bouton flottant
const floatingButtonCSS = `
<style>
/* Floating buttons - unified styling */
.floating-btn {
    position: fixed;
    width: 45px;
    height: 45px;
    border: none;
    border-radius: 50%;
    font-size: 1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 999;
    backdrop-filter: blur(10px);
    overflow: hidden;
}

.floating-btn::before {
    content: '';
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: conic-gradient(transparent, rgba(255, 255, 255, 0.3), transparent);
    animation: spin 2s linear infinite;
    opacity: 0;
    transition: opacity 0.3s;
}

.floating-btn:hover::before {
    opacity: 1;
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
}

.floating-btn:hover {
    transform: translateY(-5px) scale(1.1);
    box-shadow: 0 10px 30px rgba(0,0,0,0.4);
}

.floating-btn:active {
    transform: translateY(-2px) scale(1.05);
}

.automation-control-btn {
    bottom: 30px;
    right: 30px;
    background: linear-gradient(45deg, #28a745, #20c997);
    color: white;
}

.automation-control-btn.stop {
    background: linear-gradient(45deg, #dc3545, #e74c3c);
}

@media (max-width: 768px) {
    .floating-btn {
        width: 38px;
        height: 38px;
        font-size: 0.9rem;
    }
    
    .automation-control-btn {
        bottom: 15px;
        right: 15px;
    }
}
</style>
`;

// HTML du bouton flottant
const floatingButtonHTML = `
<!-- Automation Control Button -->
<button class="floating-btn automation-control-btn" id="automationControlBtn" onclick="toggleAutomation()" title="Lancer/Arrêter l'automation">
    <i class="fas fa-play" id="automationIcon"></i>
</button>
`;

// JavaScript pour les fonctions du bouton
const floatingButtonJS = `
<script>
// Configuration API
const API_BASE_URL = window.API_BASE_URL || 'http://localhost:3005';

// État global de l'automation
let globalAutomationState = {
    isEnabled: false,
    lastUpdate: null
};

// Fonction pour basculer l'automation
async function toggleAutomation() {
    const btn = document.getElementById('automationControlBtn');
    const icon = document.getElementById('automationIcon');
    
    try {
        btn.disabled = true;
        const response = await fetch(\`\${API_BASE_URL}/api/automation-status\`);
        const currentData = await response.json();
        
        // Toggle automation
        const toggleResponse = await fetch(\`\${API_BASE_URL}/api/automation-status\`, { method: 'POST' });
        const newData = await toggleResponse.json();
        
        // Update button appearance immediately
        updateAutomationButton(newData.isAutomationEnabled);
        
        // Show notification if toast function exists
        if (typeof showToast === 'function') {
            showToast(
                newData.isAutomationEnabled ? 'Automation démarrée ✅' : 'Automation arrêtée ⏹️',
                newData.isAutomationEnabled ? 'success' : 'warning'
            );
        } else {
            // Fallback notification
            alert(newData.isAutomationEnabled ? 'Automation démarrée ✅' : 'Automation arrêtée ⏹️');
        }
        
        // Update global state
        globalAutomationState.isEnabled = newData.isAutomationEnabled;
        
        // Refresh status displays without overriding button
        setTimeout(() => {
            loadAutomationStatus();
        }, 100);
        
    } catch (error) {
        console.error('Erreur toggle automation:', error);
        if (typeof showToast === 'function') {
            showToast('Erreur lors du contrôle de l\\'automation', 'error');
        } else {
            alert('Erreur lors du contrôle de l\\'automation');
        }
    } finally {
        btn.disabled = false;
    }
}

// Fonction pour mettre à jour l'apparence du bouton
function updateAutomationButton(isRunning) {
    const btn = document.getElementById('automationControlBtn');
    const icon = document.getElementById('automationIcon');
    
    if (!btn || !icon) return;
    
    if (isRunning) {
        btn.classList.add('stop');
        btn.title = 'Arrêter l\\'automation';
        icon.className = 'fas fa-stop';
    } else {
        btn.classList.remove('stop');
        btn.title = 'Lancer l\\'automation';
        icon.className = 'fas fa-play';
    }
}

// Fonction pour charger le statut de l'automation
async function loadAutomationStatus() {
    try {
        const token = localStorage.getItem('clientToken') || localStorage.getItem('clientToken') || localStorage.getItem('token');
        const response = await fetch(\`\${API_BASE_URL}/api/automation-status\`, {
            headers: token ? {
                'Authorization': \`Bearer \${token}\`,
                'Accept': 'application/json'
            } : {
                'Accept': 'application/json'
            }
        });
        const data = await response.json();
        
        // Update floating button - check both possible properties
        const isEnabled = data.isAutomationEnabled || data.isEnabled || false;
        updateAutomationButton(isEnabled);
        
        // Update global state
        globalAutomationState.isEnabled = isEnabled;
        globalAutomationState.lastUpdate = new Date();
        
    } catch (error) {
        console.error('[FLOATING-BTN] Status loading error:', error);
        // In case of error, force state to false
        globalAutomationState.isEnabled = false;
        updateAutomationButton(false);
    }
}

// Initialisation du bouton flottant
function initFloatingAutomationButton() {
    // Charger le statut initial
    loadAutomationStatus();
    
    // Actualiser le statut toutes les 30 secondes
    setInterval(loadAutomationStatus, 30000);
    
    console.log('[FLOATING-BTN] Automation button initialized');
}

// Auto-initialisation quand le DOM est prêt
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        console.log('[FLOATING-BTN] DOM ready, initializing...');
        setTimeout(initFloatingAutomationButton, 100); // Petit délai pour s'assurer que tout est chargé
    });
} else {
    // DOM déjà chargé, injecter immédiatement avec délai de sécurité
    setTimeout(function() {
        console.log('[FLOATING-BTN] DOM already loaded, initializing...');
        initFloatingAutomationButton();
    }, 100);
}
</script>
`;

// Fonction pour injecter le bouton flottant dans une page
function injectFloatingAutomationButton() {
    // Vérifier si on est sur access.html
    if (window.location.pathname.includes('access.html')) {
        console.log('[FLOATING-BTN] Skipping injection on access.html');
        return; // Ne pas ajouter le bouton sur access.html
    }
    
    // Vérifier que le DOM est prêt
    if (!document.head || !document.body) {
        console.log('[FLOATING-BTN] DOM not ready, retrying...');
        // Attendre que le DOM soit prêt
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', injectFloatingAutomationButton);
            return;
        } else {
            console.error('[FLOATING-BUTTON] DOM elements not available');
            return;
        }
    }
    
    // Vérifier si le bouton n'existe pas déjà
    const existingButton = document.getElementById('automationControlBtn');
    if (existingButton) {
        console.log('[FLOATING-BTN] Button already exists, skipping injection');
        return; // Bouton déjà présent
    }
    
    console.log('[FLOATING-BTN] Injecting floating button...');
    
    // Injecter le CSS
    document.head.insertAdjacentHTML('beforeend', floatingButtonCSS);
    
    // Injecter le HTML du bouton
    document.body.insertAdjacentHTML('beforeend', floatingButtonHTML);
    
    // Injecter le JavaScript
    document.body.insertAdjacentHTML('beforeend', floatingButtonJS);
    
    console.log('[FLOATING-BTN] Injection completed');
}

// Export pour utilisation dans d'autres scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        injectFloatingAutomationButton,
        floatingButtonCSS,
        floatingButtonHTML,
        floatingButtonJS
    };
}

// Fonction pour vérifier et ré-injecter le bouton si nécessaire
function checkAndReinectButton() {
    const button = document.getElementById('automationControlBtn');
    if (!button && !window.location.pathname.includes('access.html')) {
        console.log('[FLOATING-BTN] Button missing, reinjecting...');
        injectFloatingAutomationButton();
        // Ré-initialiser après injection
        setTimeout(initFloatingAutomationButton, 200);
    }
}

// Auto-injection si le script est chargé directement
if (typeof window !== 'undefined') {
    // Attendre que le DOM soit complètement chargé
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            console.log('[FLOATING-BTN] DOM ready, starting injection...');
            // Injection en plusieurs étapes avec délais
            setTimeout(injectFloatingAutomationButton, 50);
            setTimeout(injectFloatingAutomationButton, 150);
            setTimeout(injectFloatingAutomationButton, 300);
        });
    } else {
        console.log('[FLOATING-BTN] DOM already loaded, starting injection...');
        // DOM déjà chargé, injecter immédiatement en plusieurs étapes
        setTimeout(injectFloatingAutomationButton, 50);
        setTimeout(injectFloatingAutomationButton, 150);
        setTimeout(injectFloatingAutomationButton, 300);
    }

    // Injection de secours au cas où les autres échouent
    setTimeout(function() {
        console.log('[FLOATING-BTN] Fallback injection...');
        injectFloatingAutomationButton();
    }, 1000);

    // Injection périodique pour les pages lentes
    setTimeout(function() {
        console.log('[FLOATING-BTN] Periodic injection...');
        injectFloatingAutomationButton();
    }, 2000);
}
