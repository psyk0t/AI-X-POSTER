# 🚀 Guide de déploiement X-AutoRaider

## ✅ État actuel - Prêt pour déploiement

Votre projet est **prêt à être déployé** ! Tous les fichiers nécessaires ont été créés.

## 📋 Checklist avant déploiement

### Sur votre machine locale :
- [ ] Git installé
- [ ] Compte GitHub créé
- [ ] Clés SSH configurées pour GitHub
- [ ] Accès SSH à votre VPS Ubuntu

### Sur le VPS Ubuntu :
- [ ] Ubuntu 20.04+ 
- [ ] Accès root ou sudo
- [ ] Domaine pointant vers le VPS (optionnel)

## 🔧 Étapes de déploiement

### 1. Pousser sur GitHub

```bash
# Dans le dossier de votre projet
git init
git add .
git commit -m "Initial commit - X-AutoRaider ready for deployment"

# Créer un repo sur GitHub puis :
git remote add origin https://github.com/VOTRE-USERNAME/x-autoraider.git
git branch -M main
git push -u origin main
```

### 2. Déploiement automatique sur VPS

```bash
# Sur votre VPS Ubuntu
wget https://raw.githubusercontent.com/VOTRE-USERNAME/x-autoraider/main/deploy.sh
chmod +x deploy.sh

# Modifier les variables dans le script si nécessaire
nano deploy.sh

# Lancer le déploiement
./deploy.sh
```

### 3. Configuration post-déploiement

```bash
# Configurer les variables d'environnement
sudo nano /var/www/x-autoraider/.env

# Redémarrer l'application
pm2 restart x-autoraider
```

## 🔑 Variables d'environnement critiques

Configurez ces variables dans `/var/www/x-autoraider/.env` :

```env
# OBLIGATOIRE - API X (Twitter)
X_API_KEY=votre_api_key_ici
X_API_SECRET=votre_secret_ici
X_ACCESS_TOKEN=votre_token_ici
X_ACCESS_TOKEN_SECRET=votre_token_secret_ici
X_BEARER_TOKEN=votre_bearer_token_ici

# OBLIGATOIRE - IA
PERPLEXITY_API_KEY=votre_perplexity_key_ici

# Configuration serveur
PORT=3001
NODE_ENV=production

# Redis (recommandé)
REDIS_HOST=localhost
REDIS_PORT=6379
```

## 🌐 Configuration domaine (optionnel)

Si vous avez un domaine, modifiez dans le script `deploy.sh` :
```bash
# Remplacer
server_name votre-domaine.com www.votre-domaine.com;
```

## 📊 Vérification du déploiement

```bash
# Status de l'application
pm2 status

# Logs en temps réel
pm2 logs x-autoraider

# Tester l'application
curl http://localhost:3001
# ou
curl http://votre-domaine.com
```

## 🔧 Commandes utiles post-déploiement

```bash
# Redémarrer l'app
pm2 restart x-autoraider

# Voir les logs
pm2 logs x-autoraider --lines 100

# Monitoring
pm2 monit

# Mise à jour depuis GitHub
cd /var/www/x-autoraider
git pull origin main
npm install --production
pm2 restart x-autoraider
```

## 🚨 Dépannage

### L'app ne démarre pas
```bash
# Vérifier les logs d'erreur
pm2 logs x-autoraider --err

# Vérifier la configuration
pm2 describe x-autoraider

# Vérifier les variables d'environnement
cat /var/www/x-autoraider/.env
```

### Problèmes Nginx
```bash
# Tester la config
sudo nginx -t

# Redémarrer Nginx
sudo systemctl restart nginx

# Logs Nginx
sudo tail -f /var/log/nginx/error.log
```

### Problèmes SSL
```bash
# Renouveler le certificat
sudo certbot renew

# Tester le certificat
sudo certbot certificates
```

## 📞 Support

Si vous rencontrez des problèmes :
- Telegram: [@psyk0t](https://t.me/psyk0t)
- X: [@psyk0t](https://x.com/psyk0t)

## 🎉 Félicitations !

Une fois déployé, votre X-AutoRaider sera accessible 24/7 sur votre VPS avec :
- ✅ HTTPS automatique
- ✅ Redémarrage automatique
- ✅ Logs centralisés
- ✅ Monitoring intégré
- ✅ Sécurité renforcée
