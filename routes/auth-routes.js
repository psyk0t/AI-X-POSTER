/**
 * Routes d'authentification et de gestion des clients
 */

const express = require('express');
const router = express.Router();
const authManager = require('../services/auth-manager');
const { requireAdmin, logAuthenticatedAccess } = require('../middleware/auth-middleware');

// Middleware pour logger tous les accès aux routes d'auth
router.use(logAuthenticatedAccess);

/**
 * GET /api/auth/clients - Liste tous les clients (admin seulement)
 */
router.get('/clients', requireAdmin, (req, res) => {
    try {
        const clients = authManager.listClients();
        res.json({ success: true, clients });
    } catch (error) {
        console.error('[AUTH-API] Erreur liste clients:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

/**
 * POST /api/auth/clients - Créer un nouveau client (admin seulement)
 */
router.post('/clients', requireAdmin, async (req, res) => {
    try {
        const { clientId, password, name, role, permissions } = req.body;
        
        if (!clientId || !password || !name) {
            return res.status(400).json({
                success: false,
                message: 'clientId, password et name sont requis'
            });
        }

        const result = await authManager.addClient({
            clientId,
            password,
            name,
            role: role || 'user',
            permissions: permissions || ['read']
        });

        res.json(result);
    } catch (error) {
        console.error('[AUTH-API] Erreur création client:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

/**
 * PUT /api/auth/clients/:clientId/password - Changer le mot de passe d'un client
 */
router.put('/clients/:clientId/password', requireAdmin, async (req, res) => {
    try {
        const { clientId } = req.params;
        const { newPassword } = req.body;
        
        if (!newPassword) {
            return res.status(400).json({
                success: false,
                message: 'newPassword est requis'
            });
        }

        const result = await authManager.updateClientPassword(clientId, newPassword);
        res.json(result);
    } catch (error) {
        console.error('[AUTH-API] Erreur changement mot de passe:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

/**
 * PUT /api/auth/clients/:clientId/status - Activer/désactiver un client
 */
router.put('/clients/:clientId/status', requireAdmin, async (req, res) => {
    try {
        const { clientId } = req.params;
        const { active } = req.body;
        
        if (typeof active !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'active doit être un booléen'
            });
        }

        const result = await authManager.toggleClientStatus(clientId, active);
        res.json(result);
    } catch (error) {
        console.error('[AUTH-API] Erreur changement statut:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

/**
 * GET /api/auth/profile - Obtenir le profil de l'utilisateur connecté
 */
router.get('/profile', (req, res) => {
    try {
        if (!req.client) {
            return res.status(401).json({ success: false, message: 'Non authentifié' });
        }

        res.json({
            success: true,
            profile: {
                clientId: req.client.clientId,
                name: req.client.name,
                role: req.client.role,
                permissions: req.client.permissions
            }
        });
    } catch (error) {
        console.error('[AUTH-API] Erreur profil:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

/**
 * POST /api/auth/verify-token - Vérifier la validité d'un token
 */
router.post('/verify-token', (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Token requis'
            });
        }

        const verification = authManager.verifyToken(token);
        
        if (verification.valid) {
            res.json({
                success: true,
                valid: true,
                client: {
                    clientId: verification.client.clientId,
                    name: verification.client.name,
                    role: verification.client.role,
                    permissions: verification.client.permissions
                }
            });
        } else {
            res.json({
                success: true,
                valid: false,
                message: verification.message
            });
        }
    } catch (error) {
        console.error('[AUTH-API] Erreur vérification token:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

module.exports = router;
