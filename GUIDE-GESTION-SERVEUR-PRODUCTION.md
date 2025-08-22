# 🚀 GUIDE DE GESTION SERVEUR - PRODUCTION

## 📋 TABLE DES MATIÈRES
1. [Lancement propre du serveur](#lancement-propre-du-serveur)
2. [Gestion des quotas](#gestion-des-quotas)
3. [Remise à zéro des quotas](#remise-à-zéro-des-quotas)
4. [Maintenance quotidienne](#maintenance-quotidienne)
5. [Diagnostic et dépannage](#diagnostic-et-dépannage)
6. [Fichiers critiques](#fichiers-critiques)

---

## 🚀 LANCEMENT PROPRE DU SERVEUR

### Pré-requis avant démarrage
```bash
# 1. Vérifier que Node.js est installé
node --version

# 2. Installer les dépendances si nécessaire
npm install

# 3. Vérifier les ports disponibles
netstat -an | findstr :3005
```

### Séquence de démarrage
```bash
# 1. Nettoyer les processus existants
taskkill /f /im node.exe

# 2. Démarrer le serveur
node server.js

# 3. Vérifier le démarrage
# Aller sur http://localhost:3005
# Vérifier les logs dans la console
```

### Vérifications post-démarrage
- ✅ Serveur accessible sur port 3005
- ✅ Comptes OAuth2 connectés
- ✅ Quotas chargés correctement
- ✅ Automation fonctionnelle
- ✅ Logs s'affichent sans erreur

---

## 📊 GESTION DES QUOTAS

### Structure des quotas
Le système utilise **3 fichiers principaux** :

#### 1. `master-quota-config.json` (PRINCIPAL)
```json
{
  "globalPack": {
    "totalActions": 1000,      // 🟢 Quota total acheté (pack premium)
    "usedActions": 0,          // 🟢 Actions consommées depuis l'achat
    "remainingActions": 1000   // 🟢 Actions restantes (auto-calculé)
  },
  "dailyQuotas": {
    "dailyLimit": 200,         // 🟢 Limite quotidienne (reset à minuit)
    "usedToday": 0,           // 🟢 Actions utilisées aujourd'hui
    "distribution": {          // 🟢 Répartition des actions du jour
      "like": 34,             // 🟢 Likes effectués aujourd'hui
      "retweet": 9,           // 🟢 Retweets effectués aujourd'hui
      "reply": 60             // 🟢 Replies effectuées aujourd'hui
    }
  },
  "accounts": {
    "ACCOUNT_ID": {            // 🟢 ID unique du compte Twitter
      "actionsUsed": 0,        // 🟢 Total actions de ce compte
      "dailyUsed": {           // 🟢 Actions du jour pour ce compte
        "like": 0,             // 🟢 Likes du compte aujourd'hui
        "retweet": 0,          // 🟢 Retweets du compte aujourd'hui
        "reply": 0             // 🟢 Replies du compte aujourd'hui
      }
    }
  }
}
```

#### 2. `shared-quota-data.json` (LEGACY)
- 🟢 Utilisé pour compatibilité avec l'ancien système
- 🟢 Synchronisé automatiquement avec master-quota-config.json
- 🟢 Ne pas modifier manuellement - géré par le serveur

#### 3. `quotas-per-account.json` (BACKUP)
- 🟢 Sauvegarde individuelle par compte
- 🟢 Utilisé en cas de corruption du fichier principal
- 🟢 Restauration automatique si master-quota-config.json défaillant

---

## 🔄 REMISE À ZÉRO DES QUOTAS

### Quotas journaliers (Reset quotidien)
```bash
# MÉTHODE 1: Via l'interface web
# 🟢 Aller sur http://localhost:3005/admin.html
# 🟢 Section "Gestion des Quotas"
# 🟢 Cliquer "Reset Quotas Journaliers"

# MÉTHODE 2: Modification manuelle
```

**Éditer `master-quota-config.json`** :
```json
{
  "dailyQuotas": {
    "usedToday": 0,  // 🟢 Remettre à 0 (actions du jour)
    "distribution": {
      "like": 0,     // 🟢 Reset likes journaliers
      "retweet": 0,  // 🟢 Reset retweets journaliers
      "reply": 0     // 🟢 Reset replies journalières
    }
  },
  "accounts": {
    // 🟢 Pour chaque compte connecté :
    "ACCOUNT_ID": {
      "dailyUsed": {
        "like": 0,     // 🟢 Reset likes du compte
        "retweet": 0,  // 🟢 Reset retweets du compte
        "reply": 0     // 🟢 Reset replies du compte
      }
    }
  }
}
```

### Quotas globaux (Reset complet)
```json
{
  "globalPack": {
    "usedActions": 0,        // 🟢 Remettre à 0 (DANGER: perte historique)
    "remainingActions": 1000 // 🟢 Remettre au maximum du pack
  },
  "accounts": {
    "ACCOUNT_ID": {
      "actionsUsed": 0  // 🟢 Reset total pour chaque compte
    }
  }
}
```

### Script automatique de reset
```bash
# 🟢 Créer un fichier reset-quotas.bat
@echo off
echo Arrêt du serveur...
taskkill /f /im node.exe  # 🟢 Arrêt propre du serveur

echo Reset des quotas...
node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('master-quota-config.json'));
config.dailyQuotas.usedToday = 0;  // 🟢 Reset quotas journaliers
config.dailyQuotas.distribution = {like: 0, retweet: 0, reply: 0};  // 🟢 Reset distribution
Object.keys(config.accounts).forEach(id => {
  config.accounts[id].dailyUsed = {like: 0, retweet: 0, reply: 0};  // 🟢 Reset par compte
});
fs.writeFileSync('master-quota-config.json', JSON.stringify(config, null, 2));
console.log('Quotas journaliers remis à zéro');  // 🟢 Confirmation
"

echo Redémarrage du serveur...
start node server.js  # 🟢 Redémarrage automatique
```

---

## 🔧 MAINTENANCE QUOTIDIENNE

### Checklist quotidienne
- [ ] 🟢 Vérifier les logs d'erreur (rechercher "ERROR" dans auto-actions.log)
- [ ] 🟢 Contrôler l'usage des quotas (admin.html ou master-quota-config.json)
- [ ] 🟢 Vérifier les comptes connectés (interface principale)
- [ ] 🟢 Nettoyer les logs anciens (> 7 jours pour économiser l'espace)
- [ ] 🟢 Sauvegarder les données importantes (quotas + oauth2-users.json)

### Commandes utiles
```bash
# 🟢 Voir les logs en temps réel
tail -f auto-actions.log

# 🟢 Vérifier l'espace disque utilisé par les logs
dir *.log

# 🟢 Nettoyer les anciens logs (> 7 jours)
forfiles /m *.log /d -7 /c "cmd /c del @path"

# 🟢 Sauvegarder les quotas avec timestamp
copy master-quota-config.json backup-quotas-%date%.json
```

---

## 🔍 DIAGNOSTIC ET DÉPANNAGE

### Problèmes fréquents

#### 1. Serveur ne démarre pas
```bash
# Vérifier le port
netstat -an | findstr :3005

# Tuer les processus
taskkill /f /im node.exe

# Vérifier les dépendances
npm install
```

#### 2. Quotas incohérents
```bash
# Vérifier les fichiers de quotas
type master-quota-config.json
type shared-quota-data.json

# Recalculer les quotas
node -e "require('./services/master-quota-manager').recalculateQuotas()"
```

#### 3. Comptes déconnectés
```bash
# Vérifier les tokens OAuth2
type oauth2-users.json

# Reconnecter via l'interface
# http://localhost:3005 → "Connecter Comptes"
```

#### 4. Automation arrêtée
```bash
# Vérifier les erreurs 429
grep "429" auto-actions.log

# Redémarrer l'automation
# http://localhost:3005 → "Start Automation"
```

### Logs importants
```bash
# Logs d'automation
tail -50 auto-actions.log

# Logs système
tail -50 system.log

# Erreurs critiques
grep "ERROR" *.log
```

---

## 📁 FICHIERS CRITIQUES

### Configuration
- `master-quota-config.json` - **Quotas principaux**
- `oauth2-users.json` - **Tokens des comptes**
- `.env` - **Variables d'environnement**

### Données
- `actions-history-persistent.json` - **Historique des actions**
- `performed-actions.json` - **Actions en cours**
- `watch-accounts.json` - **Comptes surveillés**

### Logs
- `auto-actions.log` - **Logs d'automation**
- `system.log` - **Logs système**
- `rate-limit.log` - **Erreurs de rate limit**

### Sauvegarde recommandée
```bash
# Créer un dossier de sauvegarde quotidienne
mkdir backup-%date%

# Copier les fichiers critiques
copy master-quota-config.json backup-%date%/
copy oauth2-users.json backup-%date%/
copy actions-history-persistent.json backup-%date%/
copy watch-accounts.json backup-%date%/
```

---

## 🚨 PROCÉDURES D'URGENCE

### Serveur planté
```bash
# 1. Arrêter tous les processus
taskkill /f /im node.exe

# 2. Sauvegarder les données
copy master-quota-config.json backup-emergency.json

# 3. Redémarrer proprement
node server.js
```

### Quotas corrompus
```bash
# 1. Arrêter le serveur
taskkill /f /im node.exe

# 2. Restaurer depuis une sauvegarde
copy backup-quotas-YYYY-MM-DD.json master-quota-config.json

# 3. Redémarrer
node server.js
```

### Perte de connexion comptes
```bash
# 1. Vérifier oauth2-users.json
type oauth2-users.json

# 2. Reconnecter manuellement
# http://localhost:3005 → "Connecter Comptes"

# 3. Vérifier dans l'admin
# http://localhost:3005/admin.html
```

---

## 📞 CONTACTS ET RESSOURCES

### URLs importantes
- **Interface principale** : http://localhost:3005
- **Administration** : http://localhost:3005/admin.html
- **Historique** : http://localhost:3005/actions-history.html
- **Analytics** : http://localhost:3005/analytics.html

### Commandes rapides
```bash
# Démarrage rapide
start-server.bat

# Reset quotas
reset-quotas.bat

# Sauvegarde
backup-data.bat

# Diagnostic
check-health.bat
```

---

**📅 Dernière mise à jour** : 2025-08-20  
**🔧 Version serveur** : 2.0.0  
**👨‍💻 Maintenu par** : Developer
