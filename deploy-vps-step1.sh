#!/bin/bash

# ===========================================
# SCRIPT DE DÉPLOIEMENT VPS - PSYKO-TRAIDER
# ===========================================

echo "🚀 Début du déploiement..."

# 1. Installation Node.js (si pas déjà installé)
echo "📦 Installation Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Installation PM2
echo "⚙️ Installation PM2..."
sudo npm install -g pm2

# 3. Création du dossier projet
echo "📁 Création du dossier projet..."
mkdir -p ~/psyk0t-raider
cd ~/psyk0t-raider

echo "✅ Prérequis installés !"
echo ""
echo "📋 PROCHAINES ÉTAPES :"
echo "1. Upload ton code dans ~/psyk0t-raider/"
echo "2. Lance : ./deploy-step2.sh"
echo "3. Puis : ./deploy-step3.sh"
