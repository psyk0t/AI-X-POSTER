#!/bin/bash

# Script de déploiement pour X-AutoRaider sur VPS Ubuntu
# Usage: ./deploy.sh

set -e

echo "🚀 Déploiement X-AutoRaider sur VPS Ubuntu"
echo "=========================================="

# Variables
APP_NAME="x-autoraider"
APP_DIR="/var/www/$APP_NAME"
REPO_URL="https://github.com/votre-username/x-autoraider.git"
NODE_VERSION="18"

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Vérification des prérequis
check_prerequisites() {
    log_info "Vérification des prérequis..."
    
    # Vérifier si Node.js est installé
    if ! command -v node &> /dev/null; then
        log_error "Node.js n'est pas installé"
        exit 1
    fi
    
    # Vérifier la version de Node.js
    NODE_CURRENT=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_CURRENT" -lt "$NODE_VERSION" ]; then
        log_error "Node.js version $NODE_VERSION+ requise (version actuelle: $(node -v))"
        exit 1
    fi
    
    # Vérifier si PM2 est installé
    if ! command -v pm2 &> /dev/null; then
        log_warn "PM2 n'est pas installé. Installation..."
        npm install -g pm2
    fi
    
    # Vérifier si Git est installé
    if ! command -v git &> /dev/null; then
        log_error "Git n'est pas installé"
        exit 1
    fi
    
    log_info "Prérequis OK ✅"
}

# Installation des dépendances système
install_system_deps() {
    log_info "Installation des dépendances système..."
    
    sudo apt update
    sudo apt install -y nginx certbot python3-certbot-nginx redis-server
    
    # Démarrer et activer Redis
    sudo systemctl start redis-server
    sudo systemctl enable redis-server
    
    log_info "Dépendances système installées ✅"
}

# Cloner ou mettre à jour le repository
deploy_app() {
    log_info "Déploiement de l'application..."
    
    # Créer le répertoire de l'app si nécessaire
    sudo mkdir -p $APP_DIR
    sudo chown $USER:$USER $APP_DIR
    
    # Cloner ou mettre à jour le repository
    if [ -d "$APP_DIR/.git" ]; then
        log_info "Mise à jour du repository existant..."
        cd $APP_DIR
        git pull origin main
    else
        log_info "Clonage du repository..."
        git clone $REPO_URL $APP_DIR
        cd $APP_DIR
    fi
    
    # Installer les dépendances Node.js
    log_info "Installation des dépendances Node.js..."
    npm install --production
    
    # Créer le répertoire des logs
    mkdir -p logs
    
    log_info "Application déployée ✅"
}

# Configuration de l'environnement
setup_environment() {
    log_info "Configuration de l'environnement..."
    
    cd $APP_DIR
    
    # Copier le fichier .env.example vers .env si il n'existe pas
    if [ ! -f ".env" ]; then
        cp .env.example .env
        log_warn "Fichier .env créé. IMPORTANT: Configurez vos variables d'environnement!"
        log_warn "Éditez le fichier: nano $APP_DIR/.env"
    fi
    
    log_info "Environnement configuré ✅"
}

# Configuration de PM2
setup_pm2() {
    log_info "Configuration de PM2..."
    
    cd $APP_DIR
    
    # Arrêter l'application si elle tourne déjà
    pm2 stop $APP_NAME 2>/dev/null || true
    pm2 delete $APP_NAME 2>/dev/null || true
    
    # Démarrer l'application avec PM2
    pm2 start ecosystem.config.js --env production
    
    # Sauvegarder la configuration PM2
    pm2 save
    
    # Configurer PM2 pour démarrer au boot
    pm2 startup
    
    log_info "PM2 configuré ✅"
}

# Configuration de Nginx
setup_nginx() {
    log_info "Configuration de Nginx..."
    
    # Créer la configuration Nginx
    sudo tee /etc/nginx/sites-available/$APP_NAME > /dev/null <<EOF
server {
    listen 80;
    server_name votre-domaine.com www.votre-domaine.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }

    # Servir les fichiers statiques directement
    location /static/ {
        alias $APP_DIR/public/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

    # Activer le site
    sudo ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/
    
    # Supprimer la configuration par défaut si elle existe
    sudo rm -f /etc/nginx/sites-enabled/default
    
    # Tester la configuration Nginx
    sudo nginx -t
    
    # Redémarrer Nginx
    sudo systemctl restart nginx
    sudo systemctl enable nginx
    
    log_info "Nginx configuré ✅"
}

# Configuration du firewall
setup_firewall() {
    log_info "Configuration du firewall..."
    
    # Configurer UFW
    sudo ufw allow ssh
    sudo ufw allow 'Nginx Full'
    sudo ufw --force enable
    
    log_info "Firewall configuré ✅"
}

# Configuration SSL avec Let's Encrypt
setup_ssl() {
    log_info "Configuration SSL..."
    
    read -p "Voulez-vous configurer SSL avec Let's Encrypt? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Entrez votre domaine (ex: example.com): " domain
        read -p "Entrez votre email: " email
        
        sudo certbot --nginx -d $domain -d www.$domain --non-interactive --agree-tos --email $email
        
        log_info "SSL configuré ✅"
    else
        log_warn "SSL non configuré. Vous pouvez le faire plus tard avec: sudo certbot --nginx"
    fi
}

# Fonction principale
main() {
    log_info "Début du déploiement..."
    
    check_prerequisites
    install_system_deps
    deploy_app
    setup_environment
    setup_pm2
    setup_nginx
    setup_firewall
    setup_ssl
    
    log_info "=========================================="
    log_info "🎉 Déploiement terminé avec succès!"
    log_info "=========================================="
    log_info "Application accessible sur: http://votre-domaine.com"
    log_info "Logs PM2: pm2 logs $APP_NAME"
    log_info "Status PM2: pm2 status"
    log_info "Redémarrer: pm2 restart $APP_NAME"
    log_warn "N'oubliez pas de configurer vos variables d'environnement dans: $APP_DIR/.env"
}

# Exécuter le script principal
main "$@"
