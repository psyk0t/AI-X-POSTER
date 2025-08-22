# X-AutoRaider 🚀

Application d'automatisation pour X (Twitter) avec IA intégrée pour la gestion de communautés crypto.

## 🌟 Fonctionnalités

- **Automation intelligente** : Likes, retweets, et replies automatiques
- **IA intégrée** : Génération de contenu contextuel avec Perplexity AI
- **Gestion multi-comptes** : Support OAuth2 pour plusieurs comptes X
- **Anti-shadowban** : Système de quotas et délais intelligents
- **Monitoring temps réel** : Dashboard avec logs et analytics
- **Sécurité** : Chiffrement des tokens et gestion sécurisée des données

## 📋 Prérequis

### Développement local
- Node.js 18+
- npm ou yarn
- Redis (optionnel)

### Production (VPS Ubuntu)
- Ubuntu 20.04+
- Node.js 18+
- PM2
- Nginx
- Redis
- Certificat SSL (Let's Encrypt)

## 🚀 Installation rapide

### 1. Cloner le repository
```bash
git clone https://github.com/votre-username/x-autoraider.git
cd x-autoraider
```

### 2. Installer les dépendances
```bash
npm install
```

### 3. Configuration
```bash
cp .env.example .env
# Éditez .env avec vos clés API
```

### 4. Démarrer en développement
```bash
npm run dev
```

## 🔧 Configuration

### Variables d'environnement requises

```env
# API X (Twitter)
X_API_KEY=votre_api_key
X_API_SECRET=votre_api_secret
X_ACCESS_TOKEN=votre_access_token
X_ACCESS_TOKEN_SECRET=votre_access_token_secret
X_BEARER_TOKEN=votre_bearer_token

# IA Perplexity
PERPLEXITY_API_KEY=votre_perplexity_key

# Serveur
PORT=3001

# Redis (optionnel)
REDIS_HOST=localhost
REDIS_PORT=6379
```

## 🌐 Déploiement sur VPS Ubuntu

### Méthode automatique (recommandée)
```bash
chmod +x deploy.sh
./deploy.sh
```

### Méthode manuelle

1. **Installer Node.js et PM2**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2
```

2. **Installer Redis et Nginx**
```bash
sudo apt update
sudo apt install -y redis-server nginx
```

3. **Cloner et configurer l'app**
```bash
sudo mkdir -p /var/www/x-autoraider
sudo chown $USER:$USER /var/www/x-autoraider
git clone https://github.com/votre-username/x-autoraider.git /var/www/x-autoraider
cd /var/www/x-autoraider
npm install --production
cp .env.example .env
# Configurer .env
```

4. **Démarrer avec PM2**
```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

5. **Configurer Nginx**
```bash
sudo cp nginx.conf /etc/nginx/sites-available/x-autoraider
sudo ln -s /etc/nginx/sites-available/x-autoraider /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

6. **SSL avec Let's Encrypt**
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d votre-domaine.com
```

## 📊 Monitoring

### Logs PM2
```bash
pm2 logs x-autoraider
pm2 monit
```

### Status de l'application
```bash
pm2 status
pm2 restart x-autoraider
```

### Logs Nginx
```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

## 🔒 Sécurité

- Tokens chiffrés avec AES-256-CBC
- Variables d'environnement sécurisées
- Rate limiting intégré
- Firewall UFW configuré
- SSL/TLS avec Let's Encrypt

## 🛠️ Scripts disponibles

- `npm start` : Démarrer en production
- `npm run dev` : Démarrer en développement avec nodemon
- `./deploy.sh` : Script de déploiement automatique

## 📁 Structure du projet

```
x-autoraider/
├── server.js              # Serveur principal
├── services/              # Services modulaires
│   ├── ai.js             # Service IA
│   ├── automation.js     # Logic d'automation
│   ├── cache.js          # Cache Redis
│   └── encryption.js     # Chiffrement
├── public/               # Fichiers statiques
├── Content/              # Images et assets
├── reply-images/         # Images pour replies
├── .env.example          # Template environnement
├── ecosystem.config.js   # Configuration PM2
└── deploy.sh            # Script de déploiement
```

## 🐛 Dépannage

### L'application ne démarre pas
```bash
# Vérifier les logs
pm2 logs x-autoraider

# Vérifier la configuration
pm2 describe x-autoraider
```

### Problèmes de permissions
```bash
sudo chown -R $USER:$USER /var/www/x-autoraider
```

### Redis non disponible
L'application fonctionne en mode dégradé sans Redis.

## 📞 Support

- Telegram: [@psyk0t](https://t.me/psyk0t)
- X (Twitter): [@psyk0t](https://x.com/psyk0t)
- Email: support@watchpick.fr

## 📄 License

ISC License - Voir le fichier LICENSE pour plus de détails.

---

**⚠️ Avertissement :** Respectez les conditions d'utilisation de X (Twitter) et utilisez cette application de manière responsable.
