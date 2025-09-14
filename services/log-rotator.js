const fs = require('fs').promises;
const path = require('path');
const zlib = require('zlib');

/**
 * 🔄 SERVICE DE ROTATION DES LOGS
 * Gère automatiquement la taille et l'archivage des fichiers de logs
 */
class LogRotator {
    constructor(options = {}) {
        this.maxSize = options.maxSize || 10 * 1024 * 1024; // 10MB par défaut (réduit)
        this.maxFiles = options.maxFiles || 8; // Plus d'archives pour compenser
        this.checkInterval = options.checkInterval || 60000; // Vérifier toutes les minutes
        this.logFile = options.logFile || path.join(process.cwd(), 'auto-actions.log');
        this.archiveDir = options.archiveDir || path.join(process.cwd(), 'logs');
        this.compress = options.compress || false; // Option de compression
        
        this.timer = null;
        this.isRotating = false;
    }

    async init() {
        try {
            // Créer le dossier d'archives si nécessaire
            await fs.mkdir(this.archiveDir, { recursive: true });
            
            // Démarrer la surveillance
            this.startMonitoring();
            
            console.log('[LOG-ROTATOR] Service initialisé - Max size:', this.formatSize(this.maxSize));
        } catch (error) {
            console.error('[LOG-ROTATOR] Erreur initialisation:', error);
        }
    }

    startMonitoring() {
        if (this.timer) {
            clearInterval(this.timer);
        }
        
        this.timer = setInterval(async () => {
            await this.checkAndRotate();
        }, this.checkInterval);
        
        // Vérification immédiate
        this.checkAndRotate();
    }

    async checkAndRotate() {
        if (this.isRotating) return;
        
        try {
            const stats = await fs.stat(this.logFile);
            
            if (stats.size > this.maxSize) {
                console.log(`[LOG-ROTATOR] Fichier trop volumineux: ${this.formatSize(stats.size)} > ${this.formatSize(this.maxSize)}`);
                await this.rotateLog();
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('[LOG-ROTATOR] Erreur vérification taille:', error);
            }
        }
    }

    async rotateLog() {
        if (this.isRotating) return;
        this.isRotating = true;

        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const baseArchiveName = `auto-actions-${timestamp}.log`;
            const archiveName = this.compress ? `${baseArchiveName}.gz` : baseArchiveName;
            const archivePath = path.join(this.archiveDir, archiveName);

            if (this.compress) {
                // Compresser le fichier avant archivage
                await this.compressAndArchive(this.logFile, archivePath);
                console.log(`[LOG-ROTATOR] Log compressé et archivé: ${archiveName}`);
            } else {
                // Déplacer le fichier actuel vers les archives
                await fs.rename(this.logFile, archivePath);
                console.log(`[LOG-ROTATOR] Log archivé: ${archiveName}`);
            }
            
            // Créer un nouveau fichier de log vide
            await fs.writeFile(this.logFile, '');
            
            // Nettoyer les anciens archives
            await this.cleanOldArchives();
            
        } catch (error) {
            console.error('[LOG-ROTATOR] Erreur rotation:', error);
        } finally {
            this.isRotating = false;
        }
    }

    async compressAndArchive(sourcePath, targetPath) {
        return new Promise((resolve, reject) => {
            const readStream = require('fs').createReadStream(sourcePath);
            const writeStream = require('fs').createWriteStream(targetPath);
            const gzip = zlib.createGzip();

            readStream
                .pipe(gzip)
                .pipe(writeStream)
                .on('finish', async () => {
                    try {
                        // Supprimer le fichier source après compression
                        await fs.unlink(sourcePath);
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                })
                .on('error', reject);
        });
    }

    async cleanOldArchives() {
        try {
            const files = await fs.readdir(this.archiveDir);
            const logFiles = files
                .filter(file => file.startsWith('auto-actions-') && (file.endsWith('.log') || file.endsWith('.log.gz')))
                .map(file => ({
                    name: file,
                    path: path.join(this.archiveDir, file),
                    time: fs.stat(path.join(this.archiveDir, file)).then(s => s.mtime)
                }));

            // Attendre les stats de tous les fichiers
            for (let file of logFiles) {
                file.time = await file.time;
            }

            // Trier par date (plus récent en premier)
            logFiles.sort((a, b) => b.time - a.time);

            // Supprimer les fichiers excédentaires
            if (logFiles.length > this.maxFiles) {
                const filesToDelete = logFiles.slice(this.maxFiles);
                
                for (let file of filesToDelete) {
                    await fs.unlink(file.path);
                    console.log(`[LOG-ROTATOR] Archive supprimée: ${file.name}`);
                }
            }
        } catch (error) {
            console.error('[LOG-ROTATOR] Erreur nettoyage archives:', error);
        }
    }

    async getLogStats() {
        try {
            const stats = await fs.stat(this.logFile);
            const archives = await fs.readdir(this.archiveDir);
            const logArchives = archives.filter(f => f.startsWith('auto-actions-') && f.endsWith('.log'));
            
            return {
                currentSize: stats.size,
                currentSizeFormatted: this.formatSize(stats.size),
                maxSize: this.maxSize,
                maxSizeFormatted: this.formatSize(this.maxSize),
                archiveCount: logArchives.length,
                utilizationPercent: Math.round((stats.size / this.maxSize) * 100)
            };
        } catch (error) {
            return {
                currentSize: 0,
                currentSizeFormatted: '0 B',
                maxSize: this.maxSize,
                maxSizeFormatted: this.formatSize(this.maxSize),
                archiveCount: 0,
                utilizationPercent: 0
            };
        }
    }

    formatSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
}

// Instance singleton
let logRotatorInstance = null;

function getLogRotator(options = {}) {
    if (!logRotatorInstance) {
        logRotatorInstance = new LogRotator(options);
    }
    return logRotatorInstance;
}

module.exports = {
    LogRotator,
    getLogRotator
};
