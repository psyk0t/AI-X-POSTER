#!/bin/bash

# ===========================================
# ÉTAPE 3 : INSTALLATION ET DÉMARRAGE
# ===========================================

echo "📦 Installation des dépendances..."
# Aller dans le dossier projet
cd ~/AI-X-POSTER

# Installer les dépendances
npm install --production

# Créer la clé de chiffrement si elle n'existe pas
if [ ! -f "encryption.key" ]; then
    echo "🔐 Génération de la clé de chiffrement..."
    node -e "const crypto = require('crypto'); const fs = require('fs'); fs.writeFileSync('encryption.key', crypto.randomBytes(32));"
fi

echo "✅ Dépendances installées !"

# ===========================================
# ÉTAPE 4 : CONFIGURATION PM2
# ===========================================

echo "⚙️ Configuration PM2..."

# Créer le fichier ecosystem.config.js
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'ai-x-poster',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3005
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log'
  }]
};
EOF

# Créer le dossier logs
mkdir -p logs

echo "✅ Configuration PM2 créée !"

# ===========================================
# ÉTAPE 5 : DÉMARRAGE DE L'APPLICATION
# ===========================================

echo "🚀 Démarrage de l'application..."

# Démarrer avec PM2
pm2 start ecosystem.config.js

# Sauvegarder la configuration PM2
pm2 save

echo "✅ Application démarrée !"
echo ""
echo "📊 VÉRIFICATION :"
pm2 status
pm2 logs ai-x-poster --lines 10
echo ""
echo "🌐 TON SITE EST DISPONIBLE SUR :"
echo "http://ton-ip-vps:3005"
echo ""
echo "📋 PROCHAINES ÉTAPES :"
echo "1. Teste que ça marche : curl http://localhost:3005"
echo "2. Configure Nginx : ./deploy-nginx.sh"
echo "3. Ajoute SSL : ./deploy-ssl.sh"
