# 🚀 GUIDE DE DÉPLOIEMENT VPS SÉCURISÉ

## 📋 PRÉREQUIS VPS

### Système requis
- **Ubuntu 20.04+** ou **Debian 11+**
- **Node.js 18+** et **npm**
- **2GB RAM minimum** (4GB recommandé)
- **10GB espace disque**
- **Accès SSH root ou sudo**

### Ports nécessaires
- **3001** : Application principale
- **22** : SSH (sécurisé)
- **80/443** : HTTP/HTTPS (optionnel avec reverse proxy)

## 🔧 INSTALLATION AUTOMATIQUE

### 1. Script de déploiement rapide
```bash
# Sur votre VPS, exécuter en tant que root ou avec sudo
curl -fsSL https://raw.githubusercontent.com/your-repo/deploy.sh | bash
```

### 2. Installation manuelle

#### A. Préparer le système
```bash
# Mise à jour système
sudo apt update && sudo apt upgrade -y

# Installer Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Installer PM2 pour la gestion des processus
sudo npm install -g pm2

# Créer utilisateur dédié (sécurité)
sudo useradd -m -s /bin/bash twitter-automation
sudo usermod -aG sudo twitter-automation
```

#### B. Déployer l'application
```bash
# Se connecter en tant qu'utilisateur dédié
sudo su - twitter-automation

# Cloner le projet
git clone https://github.com/your-repo/twitter-automation.git
cd twitter-automation

# Installer les dépendances
npm install --production

# Copier et configurer l'environnement
cp .env.example .env
nano .env  # Configurer vos vraies credentials
```

#### C. Configuration sécurisée
```bash
# Permissions sécurisées
chmod 600 .env
chmod 600 oauth2-users.json 2>/dev/null || true

# Configuration firewall
sudo ufw allow 22/tcp
sudo ufw allow 3001/tcp
sudo ufw --force enable

# Configuration PM2
pm2 start server.js --name "twitter-automation"
pm2 save
pm2 startup
```

## 🔐 CONFIGURATION SÉCURISÉE

### Variables d'environnement (.env)
```bash
# API Twitter (OBLIGATOIRE)
X_API_KEY=your_real_twitter_api_key
X_API_SECRET=your_real_twitter_api_secret
X_ACCESS_TOKEN=your_real_access_token
X_ACCESS_TOKEN_SECRET=your_real_access_token_secret
X_BEARER_TOKEN=your_real_bearer_token

# OAuth2 Twitter (OBLIGATOIRE)
X_CLIENT_ID=your_oauth2_client_id
X_CLIENT_SECRET=your_oauth2_client_secret
OAUTH2_CALLBACK_URL=https://your-domain.com/oauth2/callback

# Perplexity AI (OBLIGATOIRE)
PERPLEXITY_API_KEY=your_perplexity_api_key

# Chiffrement (GÉNÉRÉ AUTOMATIQUEMENT)
ENCRYPTION_KEY=auto_generated_256_bit_key

# Serveur
PORT=3001
NODE_ENV=production

# Redis (OPTIONNEL)
REDIS_HOST=localhost
REDIS_PORT=6379

# Alertes (OPTIONNEL)
ALERT_EMAIL_ENABLED=true
ALERT_EMAIL_HOST=smtp.gmail.com
ALERT_EMAIL_USER=your-alerts@gmail.com
ALERT_EMAIL_PASS=your-app-password
```

### Sécurisation SSH
```bash
# Désactiver login root
sudo sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config

# Changer port SSH (optionnel)
sudo sed -i 's/#Port 22/Port 2222/' /etc/ssh/sshd_config

# Redémarrer SSH
sudo systemctl restart ssh
```

## 🌐 REVERSE PROXY (NGINX)

### Installation Nginx + SSL
```bash
# Installer Nginx
sudo apt install nginx certbot python3-certbot-nginx -y

# Configuration Nginx
sudo tee /etc/nginx/sites-available/twitter-automation << 'EOF'
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# Activer le site
sudo ln -s /etc/nginx/sites-available/twitter-automation /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# SSL automatique
sudo certbot --nginx -d your-domain.com
```

## 📊 MONITORING ET MAINTENANCE

### Commandes PM2 essentielles
```bash
# Statut des processus
pm2 status

# Logs en temps réel
pm2 logs twitter-automation

# Redémarrer l'application
pm2 restart twitter-automation

# Monitoring avancé
pm2 monit
```

### Logs système
```bash
# Logs application
tail -f logs/auto-actions-$(date +%Y-%m-%d).log

# Logs système
sudo journalctl -u nginx -f
sudo tail -f /var/log/auth.log
```

### Sauvegarde automatique
```bash
# Script de sauvegarde
sudo tee /home/twitter-automation/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/twitter-automation/backups"
mkdir -p $BACKUP_DIR

# Sauvegarder données critiques
tar -czf $BACKUP_DIR/twitter-automation-$DATE.tar.gz \
  /home/twitter-automation/twitter-automation/.env \
  /home/twitter-automation/twitter-automation/oauth2-users.encrypted.json \
  /home/twitter-automation/twitter-automation/encryption.key \
  /home/twitter-automation/twitter-automation/logs/

# Garder seulement les 7 dernières sauvegardes
find $BACKUP_DIR -name "twitter-automation-*.tar.gz" -mtime +7 -delete
EOF

chmod +x /home/twitter-automation/backup.sh

# Cron quotidien
echo "0 2 * * * /home/twitter-automation/backup.sh" | crontab -
```

## 🚨 SÉCURITÉ PRODUCTION

### Checklist sécurité
- [ ] **Firewall configuré** (ports 22, 3001 uniquement)
- [ ] **SSH sécurisé** (pas de root, clés SSH)
- [ ] **Utilisateur dédié** (pas de root pour l'app)
- [ ] **Variables d'environnement** chiffrées
- [ ] **HTTPS activé** (certificat SSL)
- [ ] **Sauvegardes automatiques**
- [ ] **Monitoring actif**

### Alertes de sécurité
```bash
# Installer fail2ban
sudo apt install fail2ban -y

# Configuration fail2ban
sudo tee /etc/fail2ban/jail.local << 'EOF'
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

sudo systemctl restart fail2ban
```

## 🎯 DÉMARRAGE RAPIDE

### Commande unique de déploiement
```bash
# Exécuter sur votre VPS
wget -O deploy.sh https://raw.githubusercontent.com/your-repo/deploy.sh
chmod +x deploy.sh
sudo ./deploy.sh
```

### Vérification post-déploiement
```bash
# Vérifier que tout fonctionne
curl http://localhost:3001/health
pm2 status
sudo systemctl status nginx
```

## 📞 SUPPORT

En cas de problème :
1. **Vérifier les logs** : `pm2 logs twitter-automation`
2. **Vérifier le statut** : `pm2 status`
3. **Redémarrer** : `pm2 restart twitter-automation`
4. **Vérifier la config** : `nginx -t`

Le système est maintenant prêt pour la production sécurisée ! 🚀
