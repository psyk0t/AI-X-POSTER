#!/bin/bash

# ===========================================
# SCRIPT DE DÉPLOIEMENT VPS - AI-X-POSTER
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
mkdir -p ~/AI-X-POSTER
cd ~/AI-X-POSTER

echo "✅ Prérequis installés !"
echo ""
echo "📋 PROCHAINES ÉTAPES :"
echo "1. Upload ton code dans ~/AI-X-POSTER/"
echo "2. Lance : ./deploy-step2.sh"
echo "3. Puis : ./deploy-step3.sh"
