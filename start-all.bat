@echo off
REM Script de démarrage automatique du projet AutoRaider

REM 1. Installation des dépendances si besoin
if not exist node_modules (
    echo Installation des dépendances Node.js...
    npm install
)

REM 2. Lancement du backend en arrière-plan
start "AutoRaider Backend" cmd /k "node server.js"

REM 3. Ouverture du frontend dans le navigateur par défaut
start "" index.html

echo.
echo Frontend et backend lancés !
echo Fermez cette fenêtre pour arrêter le backend (ou fermez la fenêtre du serveur manuellement).
pause
