const crypto = require('crypto');
const { logToFile } = require('./logs-optimized');

/**
 * Service de chiffrement pour X-AutoRaider
 * Responsabilités :
 * - Chiffrement/déchiffrement des tokens OAuth
 * - Gestion sécurisée des clés de chiffrement
 * - Hachage des données sensibles
 * - Génération de clés aléatoires sécurisées
 */
class EncryptionService {
    constructor() {
        this.algorithm = 'aes-256-cbc';
        this.keyLength = 32; // 256 bits
        this.ivLength = 16;  // 128 bits
        this.masterKey = null;
        this.initialized = false;
    }

    /**
     * Initialise le service de chiffrement
     */
    async initialize() {
        try {
            // Récupération ou génération de la clé maître
            this.masterKey = await this.getMasterKey();
            this.initialized = true;
            logToFile('[ENCRYPTION] Service de chiffrement initialisé avec succès');
            return true;
        } catch (error) {
            logToFile(`[ENCRYPTION] Erreur d'initialisation: ${error.message}`);
            return false;
        }
    }

    /**
     * Récupère ou génère la clé maître de chiffrement
     */
    async getMasterKey() {
        // Priorité 1: Variable d'environnement
        if (process.env.ENCRYPTION_KEY) {
            const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
            if (key.length === this.keyLength) {
                return key;
            }
            logToFile('[ENCRYPTION] Clé d\'environnement invalide, génération d\'une nouvelle clé');
        }

        // Priorité 2: Fichier de clé local (pour développement)
        const fs = require('fs').promises;
        const keyPath = './encryption.key';
        
        try {
            const keyData = await fs.readFile(keyPath);
            const key = Buffer.from(keyData.toString().trim(), 'hex');
            if (key.length === this.keyLength) {
                logToFile('[ENCRYPTION] Clé chargée depuis le fichier local');
                return key;
            }
        } catch (error) {
            // Fichier n'existe pas, on va en créer un
        }

        // Priorité 3: Génération d'une nouvelle clé
        const newKey = crypto.randomBytes(this.keyLength);
        
        try {
            await fs.writeFile(keyPath, newKey.toString('hex'));
            logToFile('[ENCRYPTION] Nouvelle clé générée et sauvegardée');
        } catch (error) {
            logToFile(`[ENCRYPTION] Impossible de sauvegarder la clé: ${error.message}`);
        }

        return newKey;
    }

    /**
     * Chiffre une donnée sensible
     * @param {string} plaintext - Texte à chiffrer
     * @returns {string} - Données chiffrées encodées en base64
     */
    encrypt(plaintext) {
        if (!this.initialized) {
            throw new Error('Service de chiffrement non initialisé');
        }

        try {
            // Génération d'un IV aléatoire pour chaque chiffrement
            const iv = crypto.randomBytes(this.ivLength);
            
            // Création du cipher avec IV
            const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv);
            
            // Chiffrement
            let encrypted = cipher.update(plaintext, 'utf8');
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            
            // Combinaison IV + données chiffrées
            const result = Buffer.concat([iv, encrypted]);
            
            return result.toString('base64');
        } catch (error) {
            logToFile(`[ENCRYPTION] Erreur de chiffrement: ${error.message}`);
            throw new Error('Échec du chiffrement');
        }
    }

    /**
     * Déchiffre une donnée
     * @param {string} encryptedData - Données chiffrées en base64
     * @returns {string} - Texte déchiffré
     */
    decrypt(encryptedData) {
        if (!this.initialized) {
            throw new Error('Service de chiffrement non initialisé');
        }

        try {
            // Décodage des données
            const data = Buffer.from(encryptedData, 'base64');
            
            // Extraction des composants
            const iv = data.subarray(0, this.ivLength);
            const encrypted = data.subarray(this.ivLength);
            
            // Création du decipher avec IV
            const decipher = crypto.createDecipheriv(this.algorithm, this.masterKey, iv);
            
            // Déchiffrement
            let decrypted = decipher.update(encrypted, null, 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            logToFile(`[ENCRYPTION] Erreur de déchiffrement: ${error.message}`);
            throw new Error('Échec du déchiffrement');
        }
    }

    /**
     * Hache une donnée avec salt (pour mots de passe, etc.)
     * @param {string} data - Donnée à hacher
     * @param {string} salt - Salt optionnel (généré si non fourni)
     * @returns {object} - {hash, salt}
     */
    hash(data, salt = null) {
        try {
            if (!salt) {
                salt = crypto.randomBytes(16).toString('hex');
            }
            
            const hash = crypto.pbkdf2Sync(data, salt, 100000, 64, 'sha512').toString('hex');
            
            return { hash, salt };
        } catch (error) {
            logToFile(`[ENCRYPTION] Erreur de hachage: ${error.message}`);
            throw new Error('Échec du hachage');
        }
    }

    /**
     * Vérifie un hash
     * @param {string} data - Donnée à vérifier
     * @param {string} hash - Hash de référence
     * @param {string} salt - Salt utilisé
     * @returns {boolean} - True si valide
     */
    verifyHash(data, hash, salt) {
        try {
            const computedHash = crypto.pbkdf2Sync(data, salt, 100000, 64, 'sha512').toString('hex');
            return computedHash === hash;
        } catch (error) {
            logToFile(`[ENCRYPTION] Erreur de vérification: ${error.message}`);
            return false;
        }
    }

    /**
     * Génère un token aléatoire sécurisé
     * @param {number} length - Longueur en bytes (défaut: 32)
     * @returns {string} - Token en hexadécimal
     */
    generateSecureToken(length = 32) {
        try {
            return crypto.randomBytes(length).toString('hex');
        } catch (error) {
            logToFile(`[ENCRYPTION] Erreur génération token: ${error.message}`);
            throw new Error('Échec génération token');
        }
    }

    /**
     * Chiffre un objet complet (tokens OAuth, config, etc.)
     * @param {object} obj - Objet à chiffrer
     * @returns {string} - Objet chiffré en base64
     */
    encryptObject(obj) {
        try {
            const jsonString = JSON.stringify(obj);
            return this.encrypt(jsonString);
        } catch (error) {
            logToFile(`[ENCRYPTION] Erreur chiffrement objet: ${error.message}`);
            throw new Error('Échec chiffrement objet');
        }
    }

    /**
     * Déchiffre un objet
     * @param {string} encryptedObj - Objet chiffré en base64
     * @returns {object} - Objet déchiffré
     */
    decryptObject(encryptedObj) {
        try {
            const jsonString = this.decrypt(encryptedObj);
            return JSON.parse(jsonString);
        } catch (error) {
            logToFile(`[ENCRYPTION] Erreur déchiffrement objet: ${error.message}`);
            throw new Error('Échec déchiffrement objet');
        }
    }

    /**
     * Nettoie les données sensibles de la mémoire
     */
    cleanup() {
        if (this.masterKey) {
            this.masterKey.fill(0);
            this.masterKey = null;
        }
        this.initialized = false;
        logToFile('[ENCRYPTION] Service de chiffrement nettoyé');
    }

    /**
     * Vérifie l'intégrité du service
     * @returns {boolean} - True si le service fonctionne correctement
     */
    async selfTest() {
        try {
            const testData = 'Test de chiffrement X-AutoRaider';
            const encrypted = this.encrypt(testData);
            const decrypted = this.decrypt(encrypted);
            
            const testObj = { token: 'test123', secret: 'secret456' };
            const encryptedObj = this.encryptObject(testObj);
            const decryptedObj = this.decryptObject(encryptedObj);
            
            const { hash, salt } = this.hash('password123');
            const isValid = this.verifyHash('password123', hash, salt);
            
            const success = (decrypted === testData) && 
                           (JSON.stringify(testObj) === JSON.stringify(decryptedObj)) && 
                           isValid;
            
            if (success) {
                logToFile('[ENCRYPTION] Auto-test réussi - Service opérationnel');
            } else {
                logToFile('[ENCRYPTION] Auto-test échoué - Service défaillant');
            }
            
            return success;
        } catch (error) {
            logToFile(`[ENCRYPTION] Auto-test échoué: ${error.message}`);
            return false;
        }
    }
}

// Export du service
const encryptionService = new EncryptionService();
module.exports = encryptionService;
