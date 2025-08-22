@echo off
REM ========================================
REM SCRIPTS DE MAINTENANCE SERVEUR PSYK0T
REM ========================================

:MENU
cls
echo.
echo ========================================
echo   GESTION SERVEUR PSYK0T - MAINTENANCE
echo ========================================
echo.
echo 1. Demarrer le serveur proprement
echo 2. Arreter le serveur
echo 3. Reset quotas journaliers
echo 4. Reset quotas globaux (DANGER)
echo 5. Sauvegarder les donnees
echo 6. Diagnostiquer le serveur
echo 7. Nettoyer les logs anciens
echo 8. Voir les logs en temps reel
echo 9. Quitter
echo.
set /p choice="Choisissez une option (1-9): "

if "%choice%"=="1" goto START_SERVER
if "%choice%"=="2" goto STOP_SERVER
if "%choice%"=="3" goto RESET_DAILY
if "%choice%"=="4" goto RESET_GLOBAL
if "%choice%"=="5" goto BACKUP
if "%choice%"=="6" goto DIAGNOSTIC
if "%choice%"=="7" goto CLEAN_LOGS
if "%choice%"=="8" goto VIEW_LOGS
if "%choice%"=="9" goto EXIT
goto MENU

:START_SERVER
echo.
echo [INFO] Demarrage propre du serveur...
echo [1/3] Arret des processus existants...
taskkill /f /im node.exe >nul 2>&1
timeout /t 2 >nul

echo [2/3] Verification des dependances...
if not exist "node_modules" (
    echo [WARN] Installation des dependances...
    npm install
)

echo [3/3] Demarrage du serveur...
start "Serveur Psyk0t" cmd /k "node server.js"
timeout /t 3 >nul

echo [SUCCESS] Serveur demarre sur http://localhost:3005
pause
goto MENU

:STOP_SERVER
echo.
echo [INFO] Arret du serveur...
taskkill /f /im node.exe
echo [SUCCESS] Serveur arrete
pause
goto MENU

:RESET_DAILY
echo.
echo [WARNING] Reset des quotas journaliers...
echo Cette action va remettre a zero tous les quotas du jour.
set /p confirm="Confirmer (O/N): "
if /i not "%confirm%"=="O" goto MENU

echo [INFO] Arret du serveur...
taskkill /f /im node.exe >nul 2>&1

echo [INFO] Reset des quotas journaliers...
node -e "const fs=require('fs');const config=JSON.parse(fs.readFileSync('master-quota-config.json'));config.dailyQuotas.usedToday=0;config.dailyQuotas.distribution={like:0,retweet:0,reply:0};Object.keys(config.accounts||{}).forEach(id=>{if(config.accounts[id].dailyUsed){config.accounts[id].dailyUsed={like:0,retweet:0,reply:0}}});fs.writeFileSync('master-quota-config.json',JSON.stringify(config,null,2));console.log('[SUCCESS] Quotas journaliers remis a zero');"

echo [INFO] Redemarrage du serveur...
start "Serveur Psyk0t" cmd /k "node server.js"

echo [SUCCESS] Quotas journaliers remis a zero et serveur redémarre
pause
goto MENU

:RESET_GLOBAL
echo.
echo [DANGER] RESET COMPLET DES QUOTAS GLOBAUX
echo Cette action va remettre a zero TOUS les quotas (journaliers ET globaux)
echo ATTENTION: Cette action est irreversible!
set /p confirm="Confirmer le reset complet (O/N): "
if /i not "%confirm%"=="O" goto MENU

echo [INFO] Sauvegarde avant reset...
copy master-quota-config.json "backup-avant-reset-%date:~-4,4%%date:~-10,2%%date:~-7,2%.json"

echo [INFO] Arret du serveur...
taskkill /f /im node.exe >nul 2>&1

echo [INFO] Reset complet des quotas...
node -e "const fs=require('fs');const config=JSON.parse(fs.readFileSync('master-quota-config.json'));config.globalPack.usedActions=0;config.globalPack.remainingActions=config.globalPack.totalActions;config.dailyQuotas.usedToday=0;config.dailyQuotas.distribution={like:0,retweet:0,reply:0};Object.keys(config.accounts||{}).forEach(id=>{config.accounts[id].actionsUsed=0;if(config.accounts[id].dailyUsed){config.accounts[id].dailyUsed={like:0,retweet:0,reply:0}}});fs.writeFileSync('master-quota-config.json',JSON.stringify(config,null,2));console.log('[SUCCESS] Quotas globaux et journaliers remis a zero');"

echo [INFO] Redemarrage du serveur...
start "Serveur Psyk0t" cmd /k "node server.js"

echo [SUCCESS] Reset complet effectue et serveur redémarre
pause
goto MENU

:BACKUP
echo.
echo [INFO] Sauvegarde des donnees...
set backup_dir=backup-%date:~-4,4%%date:~-10,2%%date:~-7,2%-%time:~0,2%%time:~3,2%
mkdir "%backup_dir%" 2>nul

copy master-quota-config.json "%backup_dir%\"
copy oauth2-users.json "%backup_dir%\" 2>nul
copy actions-history-persistent.json "%backup_dir%\" 2>nul
copy watch-accounts.json "%backup_dir%\" 2>nul
copy shared-quota-data.json "%backup_dir%\" 2>nul

echo [SUCCESS] Sauvegarde creee dans: %backup_dir%
pause
goto MENU

:DIAGNOSTIC
echo.
echo [INFO] Diagnostic du serveur...
echo.
echo === PROCESSUS ===
tasklist | findstr node.exe

echo.
echo === PORT 3005 ===
netstat -an | findstr :3005

echo.
echo === FICHIERS CRITIQUES ===
if exist master-quota-config.json (echo [OK] master-quota-config.json) else (echo [ERREUR] master-quota-config.json manquant)
if exist oauth2-users.json (echo [OK] oauth2-users.json) else (echo [WARN] oauth2-users.json manquant)
if exist server.js (echo [OK] server.js) else (echo [ERREUR] server.js manquant)

echo.
echo === DERNIERES ERREURS ===
if exist auto-actions.log (
    echo Dernieres erreurs dans auto-actions.log:
    findstr /i "error" auto-actions.log | tail -5 2>nul
)

echo.
echo === QUOTAS ACTUELS ===
if exist master-quota-config.json (
    node -e "const config=JSON.parse(require('fs').readFileSync('master-quota-config.json'));console.log('Global:',config.globalPack.usedActions,'/',config.globalPack.totalActions);console.log('Journalier:',config.dailyQuotas.usedToday,'/',config.dailyQuotas.dailyLimit);" 2>nul
)

pause
goto MENU

:CLEAN_LOGS
echo.
echo [INFO] Nettoyage des logs anciens (>7 jours)...
forfiles /m *.log /d -7 /c "cmd /c echo Suppression de @file && del @path" 2>nul
echo [SUCCESS] Logs anciens nettoyes
pause
goto MENU

:VIEW_LOGS
echo.
echo [INFO] Affichage des logs en temps reel...
echo Appuyez sur Ctrl+C pour arreter
echo.
if exist auto-actions.log (
    tail -f auto-actions.log
) else (
    echo [ERREUR] Fichier auto-actions.log introuvable
    pause
)
goto MENU

:EXIT
echo.
echo Au revoir!
exit /b 0
