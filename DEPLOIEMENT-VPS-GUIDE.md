# 🚀 GUIDE DÉPLOIEMENT VPS - PSYKO-TRAIDER
# ==============================================

## 📋 PRÉREQUIS
- VPS Ubuntu/Debian avec accès SSH
- Domaine pointant vers ton VPS
- Tes clés API Twitter

## 🎯 ÉTAPE PAR ÉTAPE

### ÉTAPE 1 : CONNEXION SSH À TON VPS
```bash
ssh user@vps-ip-adresse
# Exemple : ssh ubuntu@123.456.789.0
```

### ÉTAPE 2 : UPLOAD DE TON CODE
**Méthode 1 - SCP (Simple) :**
```bash
# Sur ton ordinateur local (pas sur le VPS) :
scp -r /chemin/vers/ton/projet ubuntu@vps-ip:/home/ubuntu/psyk0t-raider
```

**Méthode 2 - Git (Recommandé) :**
```bash
# Sur le VPS :
cd ~
git clone https://github.com/ton-compte/ton-repo.git psyk0t-raider
cd psyk0t-raider
```

**Méthode 3 - SFTP (FileZilla) :**
- Utilise FileZilla pour uploader tout le dossier
- Host: ton-ip-vps
- Username: ubuntu (ou ton user)
- Destination: /home/ubuntu/psyk0t-raider

### ÉTAPE 3 : PRÉPARATION DU SERVEUR
```bash
cd ~/psyk0t-raider
chmod +x deploy-vps-step1.sh
./deploy-vps-step1.sh
```

### ÉTAPE 4 : CONFIGURATION
```bash
chmod +x deploy-vps-step2.sh
./deploy-vps-step2.sh

# ⚠️ ÉDITION REQUISE :
nano .env
# Modifie :
# - Tes vraies clés Twitter
# - SESSION_SECRET et JWT_SECRET (change-les !)
# - OAUTH2_CALLBACK_URL = https://ton-domaine.com/oauth2/callback
```

### ÉTAPE 5 : DÉMARRAGE
```bash
chmod +x deploy-vps-step3.sh
./deploy-vps-step3.sh
```

### ÉTAPE 6 : NGINX (OPTIONNEL)
```bash
chmod +x deploy-nginx.sh
./deploy-nginx.sh

# Modifie le domaine :
sudo nano /etc/nginx/sites-available/psyk0t-raider
# Remplace 'ton-domaine.com' par ton vrai domaine
sudo systemctl restart nginx
```

### ÉTAPE 7 : SSL HTTPS (OPTIONNEL)
```bash
chmod +x deploy-ssl.sh
./deploy-ssl.sh

# Remplace 'ton-domaine.com' par ton vrai domaine
sudo certbot --nginx -d ton-domaine.com -d www.ton-domaine.com
```

## 🔧 COMMANDES UTILES

### Vérifier que ça marche :
```bash
# Status de l'app
pm2 status

# Logs en temps réel
pm2 logs psyk0t-raider

# Redémarrer l'app
pm2 restart psyk0t-raider

# Test de l'API
curl http://localhost:3005/api/accounts
```

### Monitoring :
```bash
# Utilisation CPU/Mémoire
pm2 monit

# Liste des processus
pm2 list

# Sauvegarde configuration
pm2 save
```

## 🚨 DÉPANNAGE

### Problème : Port 3005 occupé
```bash
sudo lsof -i :3005
sudo kill -9 PID_NUMBER
```

### Problème : Nginx ne démarre pas
```bash
sudo nginx -t
sudo systemctl status nginx
```

### Problème : PM2 ne démarre pas
```bash
pm2 delete all
pm2 start ecosystem.config.js
```

## 📞 SUPPORT

Si problème :
1. Vérifie les logs : `pm2 logs psyk0t-raider`
2. Test local : `curl http://localhost:3005`
3. Vérifie firewall : `sudo ufw status`

## 🎉 RÉSULTAT FINAL

Ton site sera accessible sur :
- **Sans domaine** : `http://ton-ip-vps:3005`
- **Avec domaine** : `https://ton-domaine.com`

Bonne chance ! 🚀
