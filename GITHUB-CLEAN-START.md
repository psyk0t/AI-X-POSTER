# 🚀 GUIDE NETTOYAGE GITHUB - REPARTIR DE ZÉRO

## ⚠️ ATTENTION : CECI SUPPRIME DÉFINITIVEMENT TON REPO ACTUEL !

### Étape 1 : SUPPRESSION DU REPO EXISTANT
1. Va sur https://github.com/TON-COMPTE/TON-REPO
2. Clique "Settings" (engrenage)
3. Descends tout en bas
4. Clique "Delete this repository"
5. Tape le nom du repo pour confirmer
6. Clique "I understand the consequences, delete this repository"

### Étape 2 : CRÉATION NOUVEAU REPO
1. Clique le "+" en haut à droite → "New repository"
2. Nom : `psyk0t-raider` (ou ce que tu veux)
3. Description : "Psyko Traider - Automation Twitter"
4. **⚠️ IMPORTANT : NE COCHE PAS "Add a README file"**
5. **⚠️ IMPORTANT : NE COCHE PAS ".gitignore"**
6. Clique "Create repository"

### Étape 3 : CONFIGURATION LOCALE
```bash
# Dans ton dossier projet (remplace TON-COMPTE et TON-REPO)
cd /chemin/vers/ton/projet/psyk0t-raider

# Supprimer l'ancien historique Git
rm -rf .git

# Initialiser nouveau repo
git init
git add .
git commit -m "Initial commit - Psyko Traider v2.0"

# Lier au nouveau repo GitHub
git remote add origin https://github.com/TON-COMPTE/TON-REPO.git
git push -u origin main
```

### Étape 4 : VÉRIFICATION
```bash
# Vérifier que tout est poussé
git status
git log --oneline

# Vérifier sur GitHub que les fichiers sont là
```

## ✅ RÉSULTAT :
- ✅ Repo GitHub propre et vide
- ✅ Code poussé depuis zéro
- ✅ Historique propre
- ✅ Prêt pour déploiement VPS

## 🚀 PROCHAINE ÉTAPE :
Une fois poussé, tu peux déployer sur VPS :
```bash
ssh user@ton-vps
git clone https://github.com/TON-COMPTE/TON-REPO.git
cd TON-REPO
./deploy-vps-step1.sh
./deploy-vps-step2.sh
./deploy-vps-step3.sh
```

**ATTENTION :** Cette action est IRRÉVERSIBLE ! Sauvegarde ce qui est important avant ! 🔒
