#!/bin/bash

# ===========================================
# CONFIGURATION NGINX
# ===========================================

echo "🌐 Configuration Nginx..."

# Installer Nginx
sudo apt update
sudo apt install -y nginx

# Créer la configuration du site
sudo cat > /etc/nginx/sites-available/psyk0t-raider << EOF
server {
    listen 80;
    server_name ton-domaine.com www.ton-domaine.com;

    location / {
        proxy_pass http://localhost:3005;
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

# Activer le site
sudo ln -s /etc/nginx/sites-available/psyk0t-raider /etc/nginx/sites-enabled/

# Supprimer la configuration par défaut
sudo rm /etc/nginx/sites-enabled/default

# Tester la configuration
sudo nginx -t

# Redémarrer Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx

echo "✅ Nginx configuré !"
echo ""
echo "📋 PROCHAINE ÉTAPE :"
echo "1. Modifie 'ton-domaine.com' dans /etc/nginx/sites-available/psyk0t-raider"
echo "2. Lance : ./deploy-ssl.sh pour ajouter HTTPS"
