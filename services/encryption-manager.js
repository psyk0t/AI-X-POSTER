const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

/**
 * Gestionnaire de chiffrement transparent pour les données sensibles
 * Utilise AES-256-GCM pour un chiffrement sécurisé avec authentification
 */
class EncryptionManager {
    constructor() {
        this.algorithm = 'aes-256-gcm';
        this.keyLength = 32; // 256 bits
        this.ivLength = 16;  // 128 bits
        this.tagLength = 16; // 128 bits
        this.encryptionKey = null;
    }

    /**
     * Initialise la clé de chiffrement depuis les variables d'environnement
     * ou génère une nouvelle clé si nécessaire
     */
    async initialize() {
        try {
            // Tenter de charger la clé depuis l'environnement
            if (process.env.ENCRYPTION_KEY) {
                this.encryptionKey = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
                if (this.encryptionKey.length !== this.keyLength) {
                    throw new Error('ENCRYPTION_KEY doit faire 64 caractères hexadécimaux (256 bits)');
                }
            } else {
                // Générer une nouvelle clé et la sauvegarder
                await this.generateAndSaveKey();
            }
            
            console.log('[ENCRYPTION] Gestionnaire de chiffrement initialisé avec succès');
            return true;
        } catch (error) {
            console.error('[ENCRYPTION] Erreur lors de l\'initialisation:', error.message);
            throw error;
        }
    }

    /**
     * Génère une nouvelle clé de chiffrement et la sauvegarde
     */
    async generateAndSaveKey() {
        this.encryptionKey = crypto.randomBytes(this.keyLength);
        const keyHex = this.encryptionKey.toString('hex');
        
        const keyFilePath = path.join(__dirname, '..', 'encryption.key');
        await fs.writeFile(keyFilePath, keyHex, { mode: 0o600 });
        
        console.log('[ENCRYPTION] Nouvelle clé générée et sauvegardée dans encryption.key');
        console.log('[ENCRYPTION] IMPORTANT: Ajoutez cette clé à votre .env:');
        console.log(`ENCRYPTION_KEY=${keyHex}`);
    }

    /**
     * Chiffre des données JSON
     * @param {Object} data - Données à chiffrer
     * @returns {Object} - Objet contenant les données chiffrées et métadonnées
     */
    encrypt(data) {
        if (!this.encryptionKey) {
            throw new Error('Gestionnaire de chiffrement non initialisé');
        }

        try {
            const jsonString = JSON.stringify(data);
            const iv = crypto.randomBytes(this.ivLength);
            
            const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
            
            let encrypted = cipher.update(jsonString, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const tag = cipher.getAuthTag();

            return {
                encrypted: encrypted,
                iv: iv.toString('hex'),
                tag: tag.toString('hex'),
                algorithm: this.algorithm,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('[ENCRYPTION] Erreur lors du chiffrement:', error.message);
            throw new Error('Échec du chiffrement des données');
        }
    }

    /**
     * Déchiffre des données
     * @param {Object} encryptedData - Données chiffrées avec métadonnées
     * @returns {Object} - Données déchiffrées
     */
    decrypt(encryptedData) {
        if (!this.encryptionKey) {
            throw new Error('Gestionnaire de chiffrement non initialisé');
        }

        try {
            const { encrypted, iv, tag, algorithm } = encryptedData;
            
            if (algorithm !== this.algorithm) {
                throw new Error(`Algorithme non supporté: ${algorithm}`);
            }

            const decipher = crypto.createDecipheriv(algorithm, this.encryptionKey, Buffer.from(iv, 'hex'));
            decipher.setAuthTag(Buffer.from(tag, 'hex'));
            
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return JSON.parse(decrypted);
        } catch (error) {
            console.error('[ENCRYPTION] Erreur lors du déchiffrement:', error.message);
            throw new Error('Échec du déchiffrement des données');
        }
    }

    /**
     * Chiffre et sauvegarde un fichier JSON
     * @param {string} filePath - Chemin du fichier
     * @param {Object} data - Données à chiffrer et sauvegarder
     */
    async encryptAndSaveFile(filePath, data) {
        try {
            const encryptedData = this.encrypt(data);
            const encryptedFilePath = filePath.replace('.json', '.encrypted.json');
            
            await fs.writeFile(encryptedFilePath, JSON.stringify(encryptedData, null, 2), { mode: 0o600 });
            
            console.log(`[ENCRYPTION] Fichier chiffré sauvegardé: ${encryptedFilePath}`);
            return encryptedFilePath;
        } catch (error) {
            console.error('[ENCRYPTION] Erreur lors de la sauvegarde chiffrée:', error.message);
            throw error;
        }
    }

    /**
     * Charge et déchiffre un fichier JSON
     * @param {string} filePath - Chemin du fichier chiffré
     * @returns {Object} - Données déchiffrées
     */
    async loadAndDecryptFile(filePath) {
        try {
            const encryptedContent = await fs.readFile(filePath, 'utf8');
            const encryptedData = JSON.parse(encryptedContent);
            
            return this.decrypt(encryptedData);
        } catch (error) {
            console.error('[ENCRYPTION] Erreur lors du chargement chiffré:', error.message);
            throw error;
        }
    }

    /**
     * Migre un fichier JSON existant vers une version chiffrée
     * @param {string} originalPath - Chemin du fichier original
     * @param {boolean} deleteOriginal - Supprimer le fichier original après migration
     */
    async migrateFileToEncrypted(originalPath, deleteOriginal = false) {
        try {
            // Vérifier si le fichier original existe
            const originalData = await fs.readFile(originalPath, 'utf8');
            const data = JSON.parse(originalData);
            
            // Créer la version chiffrée
            const encryptedPath = await this.encryptAndSaveFile(originalPath, data);
            
            // Optionnellement supprimer l'original
            if (deleteOriginal) {
                await fs.unlink(originalPath);
                console.log(`[ENCRYPTION] Fichier original supprimé: ${originalPath}`);
            } else {
                // Renommer l'original avec un suffixe de sauvegarde
                const backupPath = originalPath + '.backup';
                await fs.rename(originalPath, backupPath);
                console.log(`[ENCRYPTION] Fichier original sauvegardé: ${backupPath}`);
            }
            
            return encryptedPath;
        } catch (error) {
            console.error('[ENCRYPTION] Erreur lors de la migration:', error.message);
            throw error;
        }
    }

    /**
     * Vérifie si un fichier est chiffré
     * @param {string} filePath - Chemin du fichier
     * @returns {boolean} - True si le fichier est chiffré
     */
    async isFileEncrypted(filePath) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const data = JSON.parse(content);
            
            // Vérifier la présence des champs de chiffrement
            return !!(data.encrypted && data.iv && data.tag && data.algorithm);
        } catch (error) {
            return false;
        }
    }
}

module.exports = EncryptionManager;
