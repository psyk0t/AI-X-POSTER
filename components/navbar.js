/**
 * Navigation Header Component
 * Composant réutilisable pour le header avec menu burger
 */

function createNavbar() {
    return `
    <!-- Navigation Header -->
    <nav class="navbar">
        <div class="nav-container">
            <div class="nav-brand">
                <i class="fas fa-rocket"></i>
                X-AutoRaider
            </div>
            
            <!-- Desktop Menu -->
            <div class="nav-menu">
                <a href="dashboard.html" class="nav-link">
                    <i class="fas fa-tachometer-alt"></i>
                    Dashboard & Stats
                </a>
                <a href="actions-history.html" class="nav-link">
                    <i class="fas fa-history"></i>
                    Actions History
                </a>
                <a href="help.html" class="nav-link">
                    <i class="fas fa-question-circle"></i>
                    Help
                </a>
                <a href="feedback.html" class="nav-link">
                    <i class="fas fa-comment"></i>
                    Feedback
                </a>
                <a href="index.html" class="nav-link home-btn">
                    <i class="fas fa-home"></i>
                    Home
                </a>
            </div>
            
            <!-- User Section -->
            <div class="nav-user">
                <span id="nav-username">Admin</span>
                <button class="logout-btn" onclick="logout()">
                    <i class="fas fa-sign-out-alt"></i>
                    Disconnect
                </button>
            </div>
            
            <!-- Hamburger Menu -->
            <div class="hamburger" onclick="toggleMobileMenu()">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
        
        <!-- Mobile Menu -->
        <div class="mobile-menu" id="mobileMenu">
            <a href="dashboard.html" class="mobile-nav-link">
                <i class="fas fa-tachometer-alt"></i>
                Dashboard
            </a>
            <a href="actions-history.html" class="mobile-nav-link">
                <i class="fas fa-history"></i>
                Actions History
            </a>
            <a href="help.html" class="mobile-nav-link">
                <i class="fas fa-question-circle"></i>
                Help
            </a>
            <a href="feedback.html" class="mobile-nav-link">
                <i class="fas fa-comment"></i>
                Feedback
            </a>
            <a href="index.html" class="mobile-nav-link home-btn-mobile">
                <i class="fas fa-home"></i>
                Home
            </a>
            
            <div class="mobile-user">
                <span id="mobile-nav-username">Admin</span>
                <button class="mobile-logout-btn" onclick="logout()">
                    <i class="fas fa-sign-out-alt"></i>
                    Disconnect
                </button>
            </div>
        </div>
    </nav>
    `;
}

function getNavbarStyles() {
    return `
        /* Navigation Styles */
        .navbar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.95) 100%);
            backdrop-filter: blur(25px);
            border-bottom: 1px solid rgba(226, 232, 240, 0.8);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
            z-index: 1000;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .nav-container {
            display: flex;
            align-items: center;
            justify-content: space-between;
            max-width: 1400px;
            margin: 0 auto;
            padding: 0 2rem;
            height: 70px;
        }

        .nav-brand {
            font-size: 1.6rem;
            font-weight: 700;
            background: linear-gradient(135deg, #1da1f2 0%, #0d8bd9 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            display: flex;
            align-items: center;
            gap: 0.6rem;
            text-shadow: 0 2px 4px rgba(29, 161, 242, 0.1);
        }
        
        .nav-brand i {
            background: linear-gradient(135deg, #1da1f2 0%, #0d8bd9 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            filter: drop-shadow(0 2px 4px rgba(29, 161, 242, 0.2));
        }

        .nav-menu {
            display: flex;
            align-items: center;
            gap: 2rem;
        }

        .nav-link {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            color: #64748b;
            text-decoration: none;
            font-weight: 500;
            padding: 0.6rem 1.2rem;
            border-radius: 12px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
        }

        .nav-link:hover {
            color: #1da1f2;
            background: rgba(29, 161, 242, 0.08);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(29, 161, 242, 0.15);
        }

        .nav-link:before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
            transition: left 0.5s;
        }

        .nav-link:hover:before {
            left: 100%;
        }

        /* Bouton Home spécial */
        .home-btn {
            background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
            border: 1px solid rgba(29, 161, 242, 0.2);
            color: #1da1f2 !important;
            font-weight: 600;
            box-shadow: 0 2px 8px rgba(29, 161, 242, 0.1);
        }

        .home-btn:hover {
            background: linear-gradient(135deg, #1da1f2 0%, #0d8bd9 100%);
            color: white !important;
            border-color: #1da1f2;
            transform: translateY(-3px);
            box-shadow: 0 6px 20px rgba(29, 161, 242, 0.3);
        }

        .home-btn i {
            transition: transform 0.3s ease;
        }

        .home-btn:hover i {
            transform: scale(1.1);
        }

        .nav-user {
            display: flex;
            align-items: center;
            gap: 1rem;
        }

        #nav-username {
            color: var(--text-primary);
            font-weight: 500;
        }

        .logout-btn {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            background: var(--danger-color);
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
            transition: var(--transition);
        }

        .logout-btn:hover {
            background: #c53030;
            transform: translateY(-1px);
        }

        /* Hamburger Menu */
        .hamburger {
            display: none;
            flex-direction: column;
            cursor: pointer;
            padding: 5px;
        }

        .hamburger span {
            width: 25px;
            height: 3px;
            background: #1da1f2;
            margin: 3px 0;
            transition: 0.3s;
            border-radius: 2px;
        }

        .hamburger.active span:nth-child(1) {
            transform: rotate(-45deg) translate(-5px, 6px);
        }

        .hamburger.active span:nth-child(2) {
            opacity: 0;
        }

        .hamburger.active span:nth-child(3) {
            transform: rotate(45deg) translate(-5px, -6px);
        }

        /* Mobile Menu */
        .mobile-menu {
            display: none;
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: rgba(255, 255, 255, 0.98);
            backdrop-filter: blur(20px);
            border-bottom: 1px solid var(--border-color);
            padding: 1rem 2rem;
            flex-direction: column;
            gap: 1rem;
        }

        .mobile-menu.active {
            display: flex;
        }

        .mobile-nav-link {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            color: var(--text-secondary);
            text-decoration: none;
            font-weight: 500;
            padding: 0.75rem 1rem;
            border-radius: 8px;
            transition: var(--transition);
        }

        .mobile-nav-link:hover {
            color: #1da1f2;
            background: rgba(29, 161, 242, 0.08);
        }

        /* Bouton Home mobile spécial */
        .home-btn-mobile {
            background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
            border: 1px solid rgba(29, 161, 242, 0.2);
            color: #1da1f2 !important;
            font-weight: 600;
            box-shadow: 0 2px 8px rgba(29, 161, 242, 0.1);
            border-radius: 12px;
        }

        .home-btn-mobile:hover {
            background: linear-gradient(135deg, #1da1f2 0%, #0d8bd9 100%);
            color: white !important;
            border-color: #1da1f2;
            box-shadow: 0 4px 12px rgba(29, 161, 242, 0.3);
        }

        .mobile-user {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-top: 1rem;
            border-top: 1px solid var(--border-color);
            margin-top: 1rem;
        }

        .mobile-logout-btn {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            background: var(--danger-color);
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
            transition: var(--transition);
        }

        /* Responsive */
        @media (max-width: 768px) {
            .nav-menu, .nav-user {
                display: none;
            }
            
            .hamburger {
                display: flex;
            }
        }

        /* Adjust main content for fixed navbar */
        .main-container {
            margin-top: 80px;
        }
    `;
}

function initNavbar() {
    // Injecter le HTML de la navbar
    document.body.insertAdjacentHTML('afterbegin', createNavbar());
    
    // Ajouter les styles si pas déjà présents
    if (!document.getElementById('navbar-styles')) {
        const styleSheet = document.createElement('style');
        styleSheet.id = 'navbar-styles';
        styleSheet.textContent = getNavbarStyles();
        document.head.appendChild(styleSheet);
    }
    
    // Ajouter la classe main-container au contenu principal
    const container = document.querySelector('.container');
    if (container) {
        container.classList.add('main-container');
    }
}

// Fonction pour le menu hamburger
function toggleMobileMenu() {
    const hamburger = document.querySelector('.hamburger');
    const mobileMenu = document.getElementById('mobileMenu');
    
    hamburger.classList.toggle('active');
    mobileMenu.classList.toggle('active');
}

// Fermer le menu mobile si on clique en dehors
document.addEventListener('click', function(event) {
    const hamburger = document.querySelector('.hamburger');
    const mobileMenu = document.getElementById('mobileMenu');
    const navbar = document.querySelector('.navbar');
    
    if (navbar && !navbar.contains(event.target)) {
        if (hamburger) hamburger.classList.remove('active');
        if (mobileMenu) mobileMenu.classList.remove('active');
    }
});

// Fonction de déconnexion
function logout() {
    if (confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) {
        window.location.href = 'login.html';
    }
}

// Auto-initialisation si le DOM est déjà chargé
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavbar);
} else {
    initNavbar();
}
