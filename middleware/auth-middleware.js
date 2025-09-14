/**
 * Middleware d'authentification pour les endpoints API
 */

const authManager = require('../services/auth-manager');

/**
 * Middleware pour vérifier les permissions d'accès aux API
 */
function requirePermission(permission) {
    return (req, res, next) => {
        if (!req.client) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!authManager.hasPermission(req.client, permission)) {
            return res.status(403).json({ 
                error: 'Permission insuffisante',
                required: permission,
                userPermissions: req.client.permissions 
            });
        }

        next();
    };
}

/**
 * Middleware pour les endpoints d'administration
 */
function requireAdmin(req, res, next) {
    if (!req.client) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.client.role !== 'admin') {
        return res.status(403).json({ 
            error: 'Accès administrateur requis',
            userRole: req.client.role 
        });
    }

    next();
}

/**
 * Middleware pour logger les accès authentifiés
 */
function logAuthenticatedAccess(req, res, next) {
    if (req.client) {
        console.log(`[AUTH-ACCESS] ${req.client.clientId} (${req.client.role}) -> ${req.method} ${req.path}`);
    }
    next();
}

module.exports = {
    requirePermission,
    requireAdmin,
    logAuthenticatedAccess
};
