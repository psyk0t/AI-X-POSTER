# 🚀 DÉPLOIEMENT VPS - ÉTAPES PAS À PAS

## 📋 PRÉREQUIS
- VPS Ubuntu 20.04+ ou Debian 11+
- Accès SSH root ou sudo
- 2GB RAM minimum
- Vos credentials Twitter/Perplexity prêts

---

## 🎯 ÉTAPE 1 : CONNEXION AU VPS

```bash
# Connectez-vous à votre VPS
ssh root@VOTRE-IP-VPS
# ou
ssh votre-user@VOTRE-IP-VPS
```

---

## 🔧 ÉTAPE 2 : MISE À JOUR SYSTÈME

```bash
# Mise à jour complète
sudo apt update && sudo apt upgrade -y
```

---

## 📦 ÉTAPE 3 : INSTALLATION NODE.JS

```bash
# Installation Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Vérification
node --version  # Doit afficher v18.x.x
npm --version
```

---

## ⚙️ ÉTAPE 4 : INSTALLATION PM2

```bash
# Installation PM2 (gestionnaire de processus)
sudo npm install -g pm2

# Vérification
pm2 --version
```

---

## 👤 ÉTAPE 5 : CRÉATION UTILISATEUR DÉDIÉ

```bash
# Créer utilisateur sécurisé
sudo useradd -m -s /bin/bash twitter-automation
sudo usermod -aG sudo twitter-automation

# Passer à cet utilisateur
sudo su - twitter-automation
cd /home/twitter-automation
```

---

## 📁 ÉTAPE 6 : CLONAGE DU PROJET

```bash
# Installer Git si nécessaire
sudo apt install -y git

# Cloner votre projet (REMPLACEZ L'URL)
git clone https://github.com/VOTRE-USERNAME/VOTRE-REPO.git twitter-automation

# Aller dans le dossier
cd twitter-automation
```

---

## 📦 ÉTAPE 7 : INSTALLATION DÉPENDANCES

```bash
# Installation des packages Node.js
npm install --production

# Vérification
ls -la  # Vous devez voir node_modules/
```

---

## 🔐 ÉTAPE 8 : CONFIGURATION ENVIRONNEMENT

```bash
# Copier le template
cp .env.example .env

# Éditer avec vos vrais credentials
nano .env
```

**Configurez ces variables OBLIGATOIRES :**
```bash
# API Twitter
X_API_KEY=votre_vraie_api_key
X_API_SECRET=votre_vrai_api_secret
X_ACCESS_TOKEN=votre_vrai_access_token
X_ACCESS_TOKEN_SECRET=votre_vrai_access_token_secret
X_BEARER_TOKEN=votre_vrai_bearer_token

# OAuth2 Twitter
X_CLIENT_ID=votre_client_id
X_CLIENT_SECRET=votre_client_secret
OAUTH2_CALLBACK_URL=http://VOTRE-IP-VPS:3001/oauth2/callback

# Perplexity AI
PERPLEXITY_API_KEY=votre_perplexity_key

# Serveur
PORT=3001
NODE_ENV=production
```

**Sauvegardez :** `Ctrl+X`, puis `Y`, puis `Entrée`

---

## 🔒 ÉTAPE 9 : SÉCURISATION FICHIERS

```bash
# Permissions sécurisées
chmod 600 .env
chmod 600 oauth2-users.json 2>/dev/null || true
```

---

## 🚀 ÉTAPE 10 : DÉMARRAGE APPLICATION

```bash
# Démarrer avec PM2
pm2 start server.js --name "twitter-automation"

# Sauvegarder la configuration PM2
pm2 save

# Configuration démarrage automatique
pm2 startup
# IMPORTANT: Copiez-collez la commande affichée et exécutez-la
```

---

## 🔥 ÉTAPE 11 : CONFIGURATION FIREWALL

```bash
# Retourner en root/sudo
exit  # Sortir de l'utilisateur twitter-automation

# Configuration firewall
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 3001/tcp  # Application
sudo ufw --force enable

# Vérification
sudo ufw status
```

---

## 🧪 ÉTAPE 12 : TEST APPLICATION

```bash
# Test local
curl http://localhost:3001

# Test externe (remplacez VOTRE-IP-VPS)
curl http://VOTRE-IP-VPS:3001
```

**Si ça marche :** Vous devez voir du HTML ou un message d'accueil

---

## 📊 ÉTAPE 13 : VÉRIFICATIONS

```bash
# Retourner à l'utilisateur app
sudo su - twitter-automation

# Vérifier PM2
pm2 status
# Doit montrer "twitter-automation" en "online"

# Voir les logs
pm2 logs twitter-automation

# Monitoring temps réel
pm2 monit
```

---

## 🌐 ÉTAPE 14 : ACCÈS WEB

Ouvrez votre navigateur :
```
http://VOTRE-IP-VPS:3001
```

Vous devez voir l'interface de votre application !

---

## 🔧 ÉTAPE 15 : COMMANDES UTILES

```bash
# Toujours en tant qu'utilisateur twitter-automation
sudo su - twitter-automation
cd twitter-automation

# Redémarrer l'app
pm2 restart twitter-automation

# Voir les logs en temps réel
pm2 logs twitter-automation --lines 50

# Arrêter l'app
pm2 stop twitter-automation

# Démarrer l'app
pm2 start twitter-automation

# Statut général
pm2 status
```

---

## 🚨 DÉPANNAGE

### Application ne démarre pas
```bash
# Vérifier les logs
pm2 logs twitter-automation

# Vérifier le fichier .env
cat .env | head -10

# Redémarrer
pm2 restart twitter-automation
```

### Port 3001 non accessible
```bash
# Vérifier le firewall
sudo ufw status

# Vérifier si l'app écoute
sudo netstat -tlnp | grep 3001
```

### Erreurs de permissions
```bash
# Réparer les permissions
chmod 600 .env
chown twitter-automation:twitter-automation .env
```

---

## ✅ CHECKLIST FINALE

- [ ] Node.js 18+ installé
- [ ] PM2 installé et configuré
- [ ] Utilisateur twitter-automation créé
- [ ] Code cloné et dépendances installées
- [ ] Fichier .env configuré avec vrais credentials
- [ ] Application démarrée avec PM2
- [ ] Firewall configuré (ports 22, 3001)
- [ ] Application accessible sur http://IP:3001
- [ ] PM2 configuré pour démarrage automatique

**🎉 DÉPLOIEMENT TERMINÉ !**

Votre système d'automation Twitter est maintenant en production sécurisée.
