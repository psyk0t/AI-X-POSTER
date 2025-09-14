/**
 * Gestionnaire d'authentification sécurisé
 * Remplace le système d'auth factice par un vrai système avec JWT et bcrypt
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs').promises;
const path = require('path');

class AuthManager {
    constructor() {
        this.clientsFile = path.join(__dirname, '..', 'clients-database.json');
        this.jwtSecret = process.env.JWT_SECRET || 'super-secret-jwt-key-for-authentication-2024';
        console.log('[AUTH] JWT Secret chargé:', this.jwtSecret ? 'Présent' : 'MANQUANT');
        this.saltRounds = 12;
        this.tokenExpiry = '24h';
        this.clients = new Map();
        
        this.initializeClients();
    }

    /**
     * Initialise la base de données des clients
     */
    async initializeClients() {
        try {
            // Créer le fichier s'il n'existe pas
            try {
                await fs.access(this.clientsFile);
            } catch {
                console.log('[AUTH] Création de la base de données clients...');
                await this.createDefaultClients();
            }

            // Charger les clients existants
            await this.loadClients();
            console.log(`[AUTH] ${this.clients.size} clients chargés`);
        } catch (error) {
            console.error('[AUTH] Erreur initialisation:', error);
        }
    }

    /**
     * Crée des clients par défaut pour le démarrage
     */
    async createDefaultClients() {
        const defaultClients = [
            {
                clientId: 'admin',
                password: 'AdminSecure123!',
                name: 'Administrateur',
                role: 'admin',
                permissions: ['all'],
                createdAt: new Date().toISOString(),
                active: true
            },
            {
                clientId: 'demo',
                password: 'DemoUser123!',
                name: 'Utilisateur Demo',
                role: 'user',
                permissions: ['read', 'automation'],
                createdAt: new Date().toISOString(),
                active: true
            }
        ];

        // Hasher les mots de passe
        for (const client of defaultClients) {
            client.passwordHash = await bcrypt.hash(client.password, this.saltRounds);
            delete client.password; // Supprimer le mot de passe en clair
        }

        await fs.writeFile(this.clientsFile, JSON.stringify(defaultClients, null, 2));
        console.log('[AUTH] Clients par défaut créés:');
        console.log('- admin / AdminSecure123!');
        console.log('- demo / DemoUser123!');
    }

    /**
     * Charge les clients depuis le fichier
     */
    async loadClients() {
        try {
            const data = await fs.readFile(this.clientsFile, 'utf8');
            const clients = JSON.parse(data);
            
            this.clients.clear();
            clients.forEach(client => {
                this.clients.set(client.clientId, client);
            });
        } catch (error) {
            console.error('[AUTH] Erreur chargement clients:', error);
        }
    }

    /**
     * Sauvegarde les clients dans le fichier
     */
    async saveClients() {
        try {
            const clientsArray = Array.from(this.clients.values());
            await fs.writeFile(this.clientsFile, JSON.stringify(clientsArray, null, 2));
        } catch (error) {
            console.error('[AUTH] Erreur sauvegarde clients:', error);
        }
    }

    /**
     * Authentifie un client
     */
    async authenticateClient(clientId, password) {
        try {
            const client = this.clients.get(clientId);
            
            if (!client) {
                console.log(`[AUTH] Client non trouvé: ${clientId}`);
                return { success: false, message: 'Identifiants invalides' };
            }

            if (!client.active) {
                console.log(`[AUTH] Client désactivé: ${clientId}`);
                return { success: false, message: 'Compte désactivé' };
            }

            // Vérifier le mot de passe
            const isValidPassword = await bcrypt.compare(password, client.passwordHash);
            
            if (!isValidPassword) {
                console.log(`[AUTH] Mot de passe incorrect pour: ${clientId}`);
                return { success: false, message: 'Identifiants invalides' };
            }

            // Générer un token JWT
            const token = this.generateToken(client);
            
            // Mettre à jour la dernière connexion
            client.lastLogin = new Date().toISOString();
            await this.saveClients();

            console.log(`[AUTH] Authentification réussie pour: ${clientId}`);
            return {
                success: true,
                token,
                client: {
                    clientId: client.clientId,
                    name: client.name,
                    role: client.role,
                    permissions: client.permissions
                }
            };
        } catch (error) {
            console.error('[AUTH] Erreur authentification:', error);
            return { success: false, message: 'Erreur serveur' };
        }
    }

    /**
     * Génère un token JWT
     */
    generateToken(client) {
        const payload = {
            clientId: client.clientId,
            name: client.name,
            role: client.role,
            permissions: client.permissions,
            iat: Math.floor(Date.now() / 1000)
        };

        return jwt.sign(payload, this.jwtSecret, { expiresIn: this.tokenExpiry });
    }

    /**
     * Vérifie un token JWT
     */
    verifyToken(token) {
        try {
            console.log(`[AUTH] Vérification token reçu:`, token ? token.substring(0, 50) + '...' : 'NULL');
            console.log(`[AUTH] Clé JWT utilisée:`, this.jwtSecret);
            
            const decoded = jwt.verify(token, this.jwtSecret);
            console.log(`[AUTH] Token décodé:`, { clientId: decoded.clientId, exp: decoded.exp, iat: decoded.iat });
            
            // Vérifier que le client existe toujours et est actif
            const client = this.clients.get(decoded.clientId);
            console.log(`[AUTH] Client trouvé:`, client ? { id: client.clientId, active: client.active } : 'Non trouvé');
            
            if (!client || !client.active) {
                console.log(`[AUTH] ÉCHEC: Client inexistant ou inactif`);
                return { valid: false, message: 'Token invalide ou client inactif' };
            }

            console.log(`[AUTH] SUCCÈS: Token valide pour client ${client.clientId}`);
            // Retourner les données du client depuis la base, pas du token
            return { 
                valid: true, 
                client: {
                    clientId: client.clientId,
                    name: client.name,
                    role: client.role,
                    permissions: client.permissions
                }
            };
        } catch (error) {
            console.log(`[AUTH] ERREUR vérification token:`, error.name, error.message);
            console.log(`[AUTH] Token problématique (longueur ${token ? token.length : 0}):`, token ? token.substring(0, 100) : 'NULL');
            console.log(`[AUTH] Token complet pour debug:`, token);
            if (error.name === 'TokenExpiredError') {
                return { valid: false, message: 'Token expiré' };
            }
            return { valid: false, message: 'Token invalide' };
        }
    }

    /**
     * Ajoute un nouveau client
     */
    async addClient(clientData) {
        try {
            const { clientId, password, name, role = 'user', permissions = ['read'] } = clientData;

            if (this.clients.has(clientId)) {
                return { success: false, message: 'Client ID déjà existant' };
            }

            const passwordHash = await bcrypt.hash(password, this.saltRounds);
            
            const newClient = {
                clientId,
                passwordHash,
                name,
                role,
                permissions,
                createdAt: new Date().toISOString(),
                active: true
            };

            this.clients.set(clientId, newClient);
            await this.saveClients();

            console.log(`[AUTH] Nouveau client créé: ${clientId}`);
            return { success: true, message: 'Client créé avec succès' };
        } catch (error) {
            console.error('[AUTH] Erreur création client:', error);
            return { success: false, message: 'Erreur lors de la création' };
        }
    }

    /**
     * Met à jour le mot de passe d'un client
     */
    async updateClientPassword(clientId, newPassword) {
        try {
            const client = this.clients.get(clientId);
            if (!client) {
                return { success: false, message: 'Client non trouvé' };
            }

            client.passwordHash = await bcrypt.hash(newPassword, this.saltRounds);
            client.passwordUpdatedAt = new Date().toISOString();
            
            await this.saveClients();
            
            console.log(`[AUTH] Mot de passe mis à jour pour: ${clientId}`);
            return { success: true, message: 'Mot de passe mis à jour' };
        } catch (error) {
            console.error('[AUTH] Erreur mise à jour mot de passe:', error);
            return { success: false, message: 'Erreur lors de la mise à jour' };
        }
    }

    /**
     * Active/désactive un client
     */
    async toggleClientStatus(clientId, active) {
        try {
            const client = this.clients.get(clientId);
            if (!client) {
                return { success: false, message: 'Client non trouvé' };
            }

            client.active = active;
            await this.saveClients();
            
            console.log(`[AUTH] Client ${clientId} ${active ? 'activé' : 'désactivé'}`);
            return { success: true, message: `Client ${active ? 'activé' : 'désactivé'}` };
        } catch (error) {
            console.error('[AUTH] Erreur changement statut:', error);
            return { success: false, message: 'Erreur lors du changement de statut' };
        }
    }

    /**
     * Liste tous les clients (sans les mots de passe)
     */
    listClients() {
        return Array.from(this.clients.values()).map(client => ({
            clientId: client.clientId,
            name: client.name,
            role: client.role,
            permissions: client.permissions,
            active: client.active,
            createdAt: client.createdAt,
            lastLogin: client.lastLogin
        }));
    }

    /**
     * Vérifie les permissions d'un client
     */
    hasPermission(client, permission) {
        if (!client || !client.permissions) return false;
        return client.permissions.includes('all') || client.permissions.includes(permission);
    }
}

module.exports = new AuthManager();
