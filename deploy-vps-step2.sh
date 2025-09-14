#!/bin/bash

# ===========================================
# ÉTAPE 2 : CONFIGURATION ENVIRONNEMENT
# ===========================================

echo "🔧 Configuration des variables d'environnement..."
cd ~/psyk0t-raider

# Créer le fichier .env avec les vraies clés
cat > .env << EOF
# Configuration API X (Twitter) - REMPLACE AVEC TES VRAIES CLÉS !
X_ACCESS_TOKEN=153720161-qlWb3dJr4IoJWThp6SMSrD5aBmdlGTuE8Xo3GPlW
X_ACCESS_TOKEN_SECRET=r4ewLNhJTI5G6CfV2Z005Pd1o2wqc7ER5EYef75neY8Z1
X_API_KEY=qEmgKR0Odt4pjnl2aHKr8d2EZ 
X_API_SECRET=ysgeQT9e7gwyEPIUaOi0zufS6Ho00khSSZfh6uLRkaBrOZQV0B 
X_BEARER_TOKEN=AAAAAAAAAAAAAAAAAAAAAD3H4AEAAAAAJaivJL1uqyzC63J2MWVYll4IWLY%3DYTAKMrlLSUrCGm3kA9oUbwYIqn7Cvzis1j3EhY8eFdwO0PdXeR 
X_CLIENT_ID=N1JmajBKaVVOU1VJQ1JjeThBLVQ6MTpjaQ 
X_CLIENT_SECRET=51O75ypAaGcJp1EQI79KlhDmJTO4GX0c3q5-On78LUHY7dppIq 

# Configuration du serveur
PORT=3005
NODE_ENV=production

# Configuration Redis (optionnel)
REDIS_URL=redis://localhost:6379
REDIS_ENABLED=false

# Secrets de sécurité (GÉNÈRE DES NOUVEAUX !)
SESSION_SECRET=super-secret-session-key-change-ça
JWT_SECRET=super-secret-jwt-key-change-ça-aussi

# Configuration Perplexity
PERPLEXITY_API_KEY=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

# Autres paramètres
ACTION_DELAY_FACTOR=1
POLL_INTERVAL_MS=1800000
OAUTH2_CALLBACK_URL=http://167.88.42.37:3005/oauth2/callback

# Logs
LOG_LEVEL=INFO
LOG_FILTER_DETAILS=false
LOG_BATCH_SUMMARY=true
LOG_FORMAT=unified
EOF

echo "✅ Variables d'environnement configurées !"
echo ""
echo "⚠️ IMPORTANT :"
echo "- Modifie les clés API avec tes vraies clés Twitter !"
echo "- Change SESSION_SECRET et JWT_SECRET !"
echo "- Modifie OAUTH2_CALLBACK_URL avec ton domaine !"
echo ""
echo "📋 PROCHAINE ÉTAPE :"
echo "Lance : ./deploy-step3.sh"
