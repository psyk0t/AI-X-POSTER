#!/bin/bash

# 🚀 Script de déploiement automatique VPS
# Utilisation: curl -fsSL https://raw.githubusercontent.com/your-repo/deploy.sh | bash

set -e

echo "🚀 Déploiement Twitter Automation sur VPS..."
echo "============================================"

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Vérifier si on est root
if [[ $EUID -eq 0 ]]; then
    log_warning "Exécution en tant que root détectée"
else
    log_info "Exécution avec utilisateur standard"
fi

# Variables
APP_USER="twitter-automation"
APP_DIR="/home/$APP_USER/twitter-automation"
NODE_VERSION="18"

# 1. Mise à jour système
log_info "Mise à jour du système..."
apt update && apt upgrade -y

# 2. Installation Node.js
log_info "Installation Node.js $NODE_VERSION..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
    log_success "Node.js installé: $(node --version)"
else
    log_success "Node.js déjà installé: $(node --version)"
fi

# 3. Installation PM2
log_info "Installation PM2..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
    log_success "PM2 installé"
else
    log_success "PM2 déjà installé"
fi

# 4. Création utilisateur dédié
log_info "Création utilisateur $APP_USER..."
if ! id "$APP_USER" &>/dev/null; then
    useradd -m -s /bin/bash $APP_USER
    usermod -aG sudo $APP_USER
    log_success "Utilisateur $APP_USER créé"
else
    log_success "Utilisateur $APP_USER existe déjà"
fi

# 5. Installation Git si nécessaire
if ! command -v git &> /dev/null; then
    log_info "Installation Git..."
    apt install -y git
fi

# 6. Configuration firewall
log_info "Configuration firewall..."
ufw allow 22/tcp
ufw allow 3001/tcp
ufw --force enable
log_success "Firewall configuré"

# 7. Installation Nginx (optionnel)
read -p "Installer Nginx pour reverse proxy? (y/N): " install_nginx
if [[ $install_nginx =~ ^[Yy]$ ]]; then
    log_info "Installation Nginx..."
    apt install -y nginx certbot python3-certbot-nginx
    
    read -p "Nom de domaine (ex: automation.example.com): " domain_name
    if [[ -n "$domain_name" ]]; then
        # Configuration Nginx
        cat > /etc/nginx/sites-available/twitter-automation << EOF
server {
    listen 80;
    server_name $domain_name;

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
    }
}
EOF
        
        ln -sf /etc/nginx/sites-available/twitter-automation /etc/nginx/sites-enabled/
        nginx -t && systemctl restart nginx
        log_success "Nginx configuré pour $domain_name"
        
        # SSL automatique
        read -p "Configurer SSL automatique? (y/N): " setup_ssl
        if [[ $setup_ssl =~ ^[Yy]$ ]]; then
            certbot --nginx -d $domain_name --non-interactive --agree-tos --email admin@$domain_name
            log_success "SSL configuré"
        fi
    fi
fi

# 8. Installation fail2ban
log_info "Installation fail2ban..."
apt install -y fail2ban
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
EOF
systemctl restart fail2ban
log_success "fail2ban configuré"

# 9. Déploiement application
log_info "Déploiement de l'application..."

# Passer à l'utilisateur dédié pour le reste
sudo -u $APP_USER bash << 'EOSU'
cd /home/twitter-automation

# Cloner ou mettre à jour le repo
if [ -d "twitter-automation" ]; then
    echo "Mise à jour du code existant..."
    cd twitter-automation
    git pull
else
    echo "Clonage du repository..."
    # Remplacer par votre vraie URL de repo
    echo "ATTENTION: Vous devez cloner manuellement votre repository"
    echo "Commandes à exécuter:"
    echo "  sudo su - twitter-automation"
    echo "  git clone https://github.com/your-username/your-repo.git twitter-automation"
    echo "  cd twitter-automation"
    echo "  npm install --production"
    exit 1
fi

# Installation dépendances
npm install --production

# Configuration environnement
if [ ! -f ".env" ]; then
    cp .env.example .env
    chmod 600 .env
    echo "⚠️  IMPORTANT: Configurez le fichier .env avec vos vraies credentials"
    echo "   nano .env"
fi

# Permissions sécurisées
chmod 600 .env 2>/dev/null || true
chmod 600 oauth2-users.json 2>/dev/null || true
chmod 600 encryption.key 2>/dev/null || true

# Démarrage avec PM2
pm2 delete twitter-automation 2>/dev/null || true
pm2 start server.js --name "twitter-automation"
pm2 save
pm2 startup --uid twitter-automation --gid twitter-automation

EOSU

# 10. Configuration sauvegarde
log_info "Configuration sauvegarde automatique..."
sudo -u $APP_USER bash << 'EOSU'
mkdir -p /home/twitter-automation/backups

cat > /home/twitter-automation/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/twitter-automation/backups"
mkdir -p $BACKUP_DIR

# Sauvegarder données critiques
tar -czf $BACKUP_DIR/twitter-automation-$DATE.tar.gz \
  /home/twitter-automation/twitter-automation/.env \
  /home/twitter-automation/twitter-automation/oauth2-users.encrypted.json \
  /home/twitter-automation/twitter-automation/encryption.key \
  /home/twitter-automation/twitter-automation/logs/ 2>/dev/null

# Garder seulement les 7 dernières sauvegardes
find $BACKUP_DIR -name "twitter-automation-*.tar.gz" -mtime +7 -delete
EOF

chmod +x /home/twitter-automation/backup.sh

# Cron quotidien
(crontab -l 2>/dev/null; echo "0 2 * * * /home/twitter-automation/backup.sh") | crontab -
EOSU

log_success "Sauvegarde automatique configurée"

# 11. Vérifications finales
log_info "Vérifications finales..."

# Test application
sleep 5
if curl -f http://localhost:3001/health &>/dev/null; then
    log_success "Application accessible sur http://localhost:3001"
else
    log_warning "Application non accessible - vérifiez les logs: sudo -u $APP_USER pm2 logs"
fi

# Résumé
echo ""
echo "🎉 DÉPLOIEMENT TERMINÉ!"
echo "======================"
echo ""
echo "📋 Actions nécessaires:"
echo "1. Configurer le fichier .env:"
echo "   sudo su - $APP_USER"
echo "   cd twitter-automation"
echo "   nano .env"
echo ""
echo "2. Redémarrer l'application:"
echo "   pm2 restart twitter-automation"
echo ""
echo "📊 Commandes utiles:"
echo "   sudo su - $APP_USER    # Passer à l'utilisateur app"
echo "   pm2 status             # Statut des processus"
echo "   pm2 logs               # Voir les logs"
echo "   pm2 monit              # Monitoring"
echo ""
echo "🌐 Accès:"
if [[ -n "$domain_name" ]]; then
    echo "   https://$domain_name"
fi
echo "   http://$(curl -s ifconfig.me):3001"
echo ""
log_success "Déploiement réussi! 🚀"
