const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs').promises;
const path = require('path');

/**
 * Gestionnaire d'authentification tenant
 * Système simple pour un utilisateur unique avec identifiant/mot de passe
 */
class TenantAuth {
    constructor() {
        this.tenantsFile = path.join(__dirname, '..', 'tenant-config.json');
        this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
        this.sessionDuration = '24h'; // Durée de session
        this.tenant = null;
        
        this.initializeTenant();
    }

    /**
     * Initialise le tenant par défaut
     */
    async initializeTenant() {
        try {
            // Vérifier si le fichier de configuration existe
            const exists = await this.fileExists(this.tenantsFile);
            
            if (!exists) {
                // Créer la configuration par défaut
                await this.createDefaultTenant();
            } else {
                // Charger la configuration existante
                await this.loadTenant();
            }
        } catch (error) {
            console.error('[TENANT-AUTH] Erreur initialisation:', error.message);
            // Créer config par défaut en cas d'erreur
            await this.createDefaultTenant();
        }
    }

    /**
     * Crée un tenant par défaut
     */
    async createDefaultTenant() {
        // Générer un hash valide pour demo123
        const password = 'demo123';
        const hashedPassword = await bcrypt.hash(password, 12);
        
        const defaultTenant = {
            clientId: 'demo-client',
            name: 'Demo Client',
            hashedPassword: hashedPassword,
            isActive: true,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            permissions: ['dashboard', 'automation', 'accounts', 'analytics']
        };

        await this.saveTenant(defaultTenant);
        this.tenant = defaultTenant;
        
        console.log('[TENANT-AUTH] Configuration par défaut créée:');
        console.log('  Client ID: demo-client');
        console.log('  Password: demo123');
        console.log('  Hash généré:', hashedPassword);
        console.log('  IMPORTANT: Changez ces credentials en production!');
    }

    /**
     * Charge la configuration tenant
     */
    async loadTenant() {
        try {
            const data = await fs.readFile(this.tenantsFile, 'utf8');
            const config = JSON.parse(data);
            this.tenant = config.tenant || config; // Support des deux formats
            console.log(`[TENANT-AUTH] Tenant chargé: ${this.tenant.clientId}`);
        } catch (error) {
            console.error('[TENANT-AUTH] Erreur chargement tenant:', error.message);
            throw error;
        }
    }

    /**
     * Sauvegarde la configuration tenant
     */
    async saveTenant(tenantData) {
        try {
            await fs.writeFile(this.tenantsFile, JSON.stringify(tenantData, null, 2), { mode: 0o600 });
            console.log('[TENANT-AUTH] Configuration tenant sauvegardée');
        } catch (error) {
            console.error('[TENANT-AUTH] Erreur sauvegarde tenant:', error.message);
            throw error;
        }
    }

    /**
     * Authentifie un client
     */
    async authenticate(clientId, password) {
        try {
            // Toujours recharger la configuration pour éviter le cache
            await this.loadTenant();

            // Vérifier le client ID
            if (clientId !== this.tenant.clientId) {
                console.log(`[TENANT-AUTH] Client ID invalide: ${clientId}`);
                return { success: false, message: 'Invalid credentials' };
            }

            // Vérifier si le tenant est actif (support des deux noms de champs)
            const isActive = this.tenant.isActive !== undefined ? this.tenant.isActive : this.tenant.active;
            if (!isActive) {
                console.log(`[TENANT-AUTH] Tenant désactivé: ${clientId}`);
                return { success: false, message: 'Account disabled' };
            }

            // Vérifier le mot de passe (support des deux noms de champs)
            const passwordHash = this.tenant.hashedPassword || this.tenant.passwordHash;
            console.log(`[TENANT-AUTH] Hash stocké: ${passwordHash}`);
            console.log(`[TENANT-AUTH] Mot de passe reçu: ${password}`);
            const isValidPassword = await bcrypt.compare(password, passwordHash);
            console.log(`[TENANT-AUTH] Résultat comparaison bcrypt: ${isValidPassword}`);
            if (!isValidPassword) {
                console.log(`[TENANT-AUTH] Mot de passe invalide pour: ${clientId}`);
                return { success: false, message: 'Invalid credentials' };
            }

            // Mettre à jour la dernière connexion
            this.tenant.lastLogin = new Date().toISOString();
            await this.saveTenant(this.tenant);

            // Générer le token JWT
            const token = jwt.sign(
                { 
                    clientId: this.tenant.clientId,
                    name: this.tenant.name,
                    permissions: this.tenant.permissions,
                    loginTime: this.tenant.lastLogin
                },
                this.jwtSecret,
                { expiresIn: this.sessionDuration }
            );

            console.log(`[TENANT-AUTH] Authentification réussie: ${clientId}`);
            
            return {
                success: true,
                token,
                client: {
                    clientId: this.tenant.clientId,
                    name: this.tenant.name,
                    permissions: this.tenant.permissions,
                    lastLogin: this.tenant.lastLogin
                }
            };

        } catch (error) {
            console.error('[TENANT-AUTH] Erreur authentification:', error.message);
            return { success: false, message: 'Authentication error' };
        }
    }

    /**
     * Vérifie un token JWT
     */
    verifyToken(token) {
        try {
            const decoded = jwt.verify(token, this.jwtSecret);
            
            // Vérifier que le client existe toujours
            if (!this.tenant || decoded.clientId !== this.tenant.clientId) {
                return { valid: false, message: 'Invalid client' };
            }

            // Vérifier que le tenant est toujours actif
            if (!this.tenant.isActive) {
                return { valid: false, message: 'Account disabled' };
            }

            return {
                valid: true,
                client: {
                    clientId: decoded.clientId,
                    name: decoded.name,
                    permissions: decoded.permissions,
                    loginTime: decoded.loginTime
                }
            };

        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return { valid: false, message: 'Token expired' };
            } else if (error.name === 'JsonWebTokenError') {
                return { valid: false, message: 'Invalid token' };
            } else {
                console.error('[TENANT-AUTH] Erreur vérification token:', error.message);
                return { valid: false, message: 'Token verification error' };
            }
        }
    }

    /**
     * Middleware d'authentification Express
     */
    requireAuth() {
        return (req, res, next) => {
            const token = req.headers.authorization?.replace('Bearer ', '') || 
                         req.session?.clientToken ||
                         req.query.token;

            if (!token) {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Authentication required',
                    redirectTo: '/access.html'
                });
            }

            const verification = this.verifyToken(token);
            
            if (!verification.valid) {
                return res.status(401).json({ 
                    success: false, 
                    message: verification.message,
                    redirectTo: '/access.html'
                });
            }

            // Ajouter les informations client à la requête
            req.client = verification.client;
            next();
        };
    }

    /**
     * Middleware pour vérifier les permissions
     */
    requirePermission(permission) {
        return (req, res, next) => {
            if (!req.client) {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Authentication required' 
                });
            }

            if (!req.client.permissions.includes(permission)) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Insufficient permissions' 
                });
            }

            next();
        };
    }

    /**
     * Change le mot de passe du tenant
     */
    async changePassword(currentPassword, newPassword) {
        try {
            if (!this.tenant) {
                await this.loadTenant();
            }

            // Vérifier le mot de passe actuel
            const isValidCurrent = await bcrypt.compare(currentPassword, this.tenant.hashedPassword);
            if (!isValidCurrent) {
                return { success: false, message: 'Current password is incorrect' };
            }

            // Hasher le nouveau mot de passe
            const hashedNewPassword = await bcrypt.hash(newPassword, 12);
            
            // Mettre à jour
            this.tenant.hashedPassword = hashedNewPassword;
            this.tenant.passwordChangedAt = new Date().toISOString();
            
            await this.saveTenant(this.tenant);
            
            console.log('[TENANT-AUTH] Mot de passe changé avec succès');
            return { success: true, message: 'Password changed successfully' };

        } catch (error) {
            console.error('[TENANT-AUTH] Erreur changement mot de passe:', error.message);
            return { success: false, message: 'Password change error' };
        }
    }

    /**
     * Met à jour les informations du tenant
     */
    async updateTenant(updates) {
        try {
            if (!this.tenant) {
                await this.loadTenant();
            }

            // Champs modifiables
            const allowedFields = ['name', 'isActive', 'permissions'];
            
            for (const field of allowedFields) {
                if (updates.hasOwnProperty(field)) {
                    this.tenant[field] = updates[field];
                }
            }

            this.tenant.updatedAt = new Date().toISOString();
            await this.saveTenant(this.tenant);
            
            console.log('[TENANT-AUTH] Tenant mis à jour');
            return { success: true, message: 'Tenant updated successfully' };

        } catch (error) {
            console.error('[TENANT-AUTH] Erreur mise à jour tenant:', error.message);
            return { success: false, message: 'Update error' };
        }
    }

    /**
     * Obtient les informations du tenant (sans données sensibles)
     */
    getTenantInfo() {
        if (!this.tenant) {
            return null;
        }

        return {
            clientId: this.tenant.clientId,
            name: this.tenant.name,
            isActive: this.tenant.isActive,
            permissions: this.tenant.permissions,
            createdAt: this.tenant.createdAt,
            lastLogin: this.tenant.lastLogin,
            updatedAt: this.tenant.updatedAt
        };
    }

    /**
     * Vérifie si un fichier existe
     */
    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }
}

// Instance singleton
let tenantAuthInstance = null;

function getTenantAuth() {
    if (!tenantAuthInstance) {
        tenantAuthInstance = new TenantAuth();
    }
    return tenantAuthInstance;
}

// Middleware Express pour protéger les routes
function requireAuth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
    
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'Token d\'authentification requis' 
        });
    }
    
    try {
        const tenantAuth = getTenantAuth();
        const decoded = tenantAuth.verifyToken(token);
        req.client = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ 
            success: false, 
            message: 'Token invalide ou expiré' 
        });
    }
}

module.exports = {
    TenantAuth,
    getTenantAuth,
    requireAuth
};
