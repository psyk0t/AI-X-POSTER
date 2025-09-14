#!/bin/bash

# ===========================================
# CONFIGURATION SSL (LETS ENCRYPT)
# ===========================================

echo "🔒 Installation SSL gratuit..."

# Installer Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtenir le certificat SSL
echo "⚠️ REMPLACE 'ton-domaine.com' par ton vrai domaine !"
sudo certbot --nginx -d raidforge.pro -d www.raidforge.pro

# Configurer le renouvellement automatique
sudo crontab -l | { cat; echo "0 12 * * * /usr/bin/certbot renew --quiet"; } | sudo crontab -

echo "✅ SSL configuré !"
echo ""
echo "🔒 TON SITE EST MAINTENANT EN HTTPS !"
echo "https://raidforge.pro"
