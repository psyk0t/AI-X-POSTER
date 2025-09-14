/**
 * Navigation Header Component
 * Composant réutilisable pour le header avec menu burger
 */

function createNavbar() {
    return `
    <!-- Navigation Header -->
    <nav class="navbar">
        <div class="nav-container">
            <div class="nav-brand" onclick="window.location.href='index.html'" style="cursor: pointer;">
                <i class="fas fa-rocket"></i>
                X-AutoRaider
            </div>
            
            <!-- Desktop Menu -->
            <div class="nav-menu">
                <a href="dashboard.html" class="nav-link dashboard-btn">
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
            <div class="nav-actions">
                <div class="nav-user">
                    <span id="nav-username">Admin</span>
                    <button class="logout-btn" onclick="logout()">Logout</button>
                </div>
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
            <a href="dashboard.html" class="mobile-nav-link dashboard-btn-mobile">
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
                <button class="mobile-logout-btn" onclick="logout()">
                    <i class="fas fa-sign-out-alt"></i>
                    Logout
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
            background: rgba(255, 255, 255, 0.98);
            backdrop-filter: blur(10px);
            border-bottom: 1px solid #e2e8f0;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            z-index: 1000;
            transition: all 0.2s ease;
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
            color: #1da1f2;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-family: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .nav-brand:hover {
            color: #0d8bd9;
            transform: translateY(-1px);
        }
        
        .nav-brand i {
            color: #1da1f2;
        }

        .nav-menu {
            display: flex;
            align-items: center;
            gap: 1.5rem;
        }

        .nav-link {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            color: #475569;
            text-decoration: none;
            font-weight: 500;
            padding: 0.75rem 1rem;
            border-radius: 8px;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
            font-family: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }

        .nav-link:hover {
            color: #1da1f2;
            background: rgba(29, 161, 242, 0.1);
            transform: translateY(-1px);
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
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
            background: #f8fafc;
            border: 1px solid rgba(29, 161, 242, 0.2);
            color: #1da1f2 !important;
            font-weight: 600;
            box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
        }

        .home-btn:hover {
            background: #1da1f2;
            color: white !important;
            border-color: #1da1f2;
            transform: translateY(-2px);
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }

        .home-btn i {
            transition: transform 0.3s ease;
        }

        .home-btn:hover i {
            transform: scale(1.1);
        }

        /* Bouton Dashboard spécial */
        .dashboard-btn {
            background: #f59e0b;
            border: 1px solid rgba(245, 158, 11, 0.2);
            color: white !important;
            font-weight: 600;
            box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
        }

        .dashboard-btn:hover {
            background: #d97706;
            color: white !important;
            border-color: #d97706;
            transform: translateY(-2px);
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }

        .dashboard-btn i {
            transition: transform 0.3s ease;
        }

        .dashboard-btn:hover i {
            transform: scale(1.1);
        }

        .nav-user {
            display: flex;
            align-items: center;
            gap: 1rem;
        }

        #nav-username {
            display: none;
        }

        .logout-btn {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            background: #ef4444;
            color: white;
            border: none;
            padding: 0.75rem 1rem;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            font-family: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }

        .logout-btn:hover {
            background: #dc2626;
            transform: translateY(-1px);
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
        }
        
        .logout-btn:active {
            transform: translateY(0) scale(0.98);
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
            background: #f8fafc;
            border: 1px solid rgba(29, 161, 242, 0.2);
            color: #1da1f2 !important;
            font-weight: 600;
            box-shadow: 0 2px 8px rgba(29, 161, 242, 0.1);
            border-radius: 12px;
        }

        .home-btn-mobile:hover {
            background: #1da1f2;
            color: white !important;
            border-color: #1da1f2;
            box-shadow: 0 4px 12px rgba(29, 161, 242, 0.3);
        }

        /* Bouton Dashboard mobile spécial */
        .dashboard-btn-mobile {
            background: #f59e0b;
            border: 1px solid rgba(245, 158, 11, 0.2);
            color: white !important;
            font-weight: 600;
            box-shadow: 0 2px 8px rgba(245, 158, 11, 0.1);
            border-radius: 12px;
        }

        .dashboard-btn-mobile:hover {
            background: #d97706;
            color: white !important;
            border-color: #d97706;
            box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
        }

        .mobile-user {
            display: flex;
            align-items: center;
            justify-content: center;
            padding-top: 1rem;
            border-top: 1px solid #e2e8f0;
            margin-top: 1rem;
        }

        .mobile-logout-btn {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            background: #ef4444;
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s ease;
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
        localStorage.removeItem('clientToken');
        localStorage.removeItem('clientId');
        window.location.href = '/access.html';
    }
}


// Auto-initialisation si le DOM est déjà chargé
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initNavbar();
    });
} else {
    initNavbar();
}
