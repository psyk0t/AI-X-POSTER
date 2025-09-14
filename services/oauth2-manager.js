const { TwitterApi } = require('twitter-api-v2');
const fs = require('fs');
const path = require('path');
const { logToFile } = require('./logs-optimized');
const { TimerManager } = require('./timer-utils');

/**
 * MULTI-USER OAUTH 2.0 SERVICE
 * 
 * Manages OAuth 2.0 authentication for 20+ simultaneous accounts
 * Respects existing onboarding logic (invitation token generation)
 */

class OAuth2Manager {
    constructor() {
        this.users = new Map(); // In-memory storage of OAuth sessions
        this.persistentUsers = new Map(); // Persistent token storage
        this.invitations = new Map(); // Active invitation tokens
        this.timers = new TimerManager('oauth2');
        
        this.appCredentials = {
            clientId: process.env.X_CLIENT_ID,
            clientSecret: process.env.X_CLIENT_SECRET,
        };
        
        this.callbackUrl = process.env.OAUTH2_CALLBACK_URL || 'http://localhost:3005/oauth2/callback';
        this.dataFile = path.join(__dirname, '..', 'oauth2-users.json');
        
        // Load existing users
        this.loadUsersFromFile().catch(error => {
            logToFile(`[OAUTH2] Async loading error: ${error.message}`);
        });
        
        // Start proactive token refresh scheduler
        this.startTokenRefreshScheduler();
        
        logToFile('[OAUTH2] OAuth 2.0 Manager service initialized');
    }

    /**
     * Checks if OAuth 2.0 credentials are configured
     */
    isConfigured() {
        return !!(this.appCredentials.clientId && this.appCredentials.clientSecret);
    }

    /**
     * STEP 1: Generate an invitation token (like existing)
     * Respects exactly the same logic as current API
     */
    generateInvitationToken(projectId = 'default') {
        if (!this.isConfigured()) {
            throw new Error('OAuth 2.0 not configured - Missing Client ID/Secret');
        }

        // Generate unique invitation token (same format as existing)
        const inviteToken = `invite_token_${projectId}_${Date.now()}_oauth2`;
        
        // Store invitation with expiration (24h)
        this.invitations.set(inviteToken, {
            projectId,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
            status: 'pending'
        });

        logToFile(`[OAUTH2] Invitation token generated: ${inviteToken} for project ${projectId}`);
        
        return {
            token: inviteToken,
            inviteUrl: `${this.callbackUrl.replace('/oauth2/callback', '')}/invite/${inviteToken}`,
            expiresAt: this.invitations.get(inviteToken).expiresAt
        };
    }

    /**
     * STEP 2: Start OAuth 2.0 flow for an invitation token
     * Replaces OAuth 1.0a redirection with OAuth 2.0
     */
    startOAuthFlow(inviteToken, scopes = [
        'tweet.read',        // Read tweets
        'tweet.write',       // Write tweets (replies) ⭐ CRITICAL
        'users.read',        // Read user info
        'like.read',         // Read likes
        'like.write',        // Create likes ⭐ CRITICAL
        'follows.read',      // Read follows
        'follows.write',     // Create follows
        'media.write',       // Upload images/media ⭐ CRITICAL
        'offline.access'     // Refresh tokens ⭐ CRITICAL
    ]) {
        // Créer automatiquement l'invitation si elle n'existe pas
        let invitation = this.invitations.get(inviteToken);
        if (!invitation) {
            console.log(`[OAUTH2] Creating missing invitation for token: ${inviteToken}`);
            const projectId = inviteToken.includes('_') ? inviteToken.split('_')[2] : 'default';
            this.invitations.set(inviteToken, {
                projectId,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
                status: 'pending'
            });
            invitation = this.invitations.get(inviteToken);
        }

        if (invitation.expiresAt < new Date()) {
            this.invitations.delete(inviteToken);
            throw new Error('Expired invitation token');
        }

        try {
            // Create OAuth 2.0 client
            const client = new TwitterApi({
                clientId: this.appCredentials.clientId,
                clientSecret: this.appCredentials.clientSecret,
            });

            // Generate OAuth 2.0 authorization URL
            const authLink = client.generateOAuth2AuthLink(this.callbackUrl, {
                scope: scopes,
                state: inviteToken, // Use invitation token as state
            });

            // Store temporary data for this flow
            this.users.set(inviteToken, {
                codeVerifier: authLink.codeVerifier,
                projectId: invitation.projectId,
                status: 'oauth_pending',
                createdAt: new Date(),
                scopes
            });

            logToFile(`[OAUTH2] OAuth flow started for invitation ${inviteToken}`);

            return {
                authUrl: authLink.url,
                state: inviteToken
            };

        } catch (error) {
            logToFile(`[OAUTH2] OAuth flow start error for ${inviteToken}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Cleanup timers
     */
    cleanup() {
        if (this.timers) {
            this.timers.clearAll();
        }
        logToFile('[OAUTH2] Timers cleaned up');
    }

    /**
     * STEP 3: Handle OAuth 2.0 callback
     * Exchange code for tokens and connect user
     */
    async handleOAuthCallback(code, state) {
        try {
            logToFile(`[OAUTH2] OAuth callback start - code: ${code ? 'present' : 'missing'}, state: ${state}`);
            
            const inviteToken = state;
            const userData = this.users.get(inviteToken);
            
            if (!userData || !userData.codeVerifier) {
                logToFile(`[OAUTH2] Invalid session - userData: ${!!userData}, codeVerifier: ${userData?.codeVerifier ? 'present' : 'missing'}`);
                throw new Error('Invalid or expired OAuth session');
            }

            // Check OAuth2 configuration
            if (!this.appCredentials.clientId || !this.appCredentials.clientSecret) {
                logToFile(`[OAUTH2] Missing configuration - clientId: ${!!this.appCredentials.clientId}, clientSecret: ${!!this.appCredentials.clientSecret}`);
                throw new Error('Incomplete OAuth 2.0 configuration');
            }

            logToFile(`[OAUTH2] Configuration OK - callback URL: ${this.callbackUrl}`);

            // Create OAuth 2.0 client
            const client = new TwitterApi({
                clientId: this.appCredentials.clientId,
                clientSecret: this.appCredentials.clientSecret,
            });

            // Exchange code for tokens
            logToFile(`[OAUTH2] Attempting OAuth code exchange...`);
            const tokenResult = await client.loginWithOAuth2({
                code,
                codeVerifier: userData.codeVerifier,
                redirectUri: this.callbackUrl,
            });

            const { accessToken, refreshToken, expiresIn } = tokenResult || {};
            logToFile(`[OAUTH2] Tokens obtained successfully - accessToken: ${accessToken ? 'present' : 'missing'}`);

            // --- AUDIT DES SCOPES ACCORDÉS ---
            const requestedScopes = Array.isArray(userData.scopes) ? userData.scopes : [];
            let grantedScopes = [];
            // Le SDK peut renvoyer 'scope' (string espace-séparé) ou 'scopes' (array)
            if (Array.isArray(tokenResult?.scopes)) {
                grantedScopes = tokenResult.scopes;
            } else if (typeof tokenResult?.scope === 'string') {
                grantedScopes = tokenResult.scope.split(/\s+/).filter(Boolean);
            } else if (Array.isArray(tokenResult?.scope)) {
                grantedScopes = tokenResult.scope;
            } else {
                grantedScopes = [];
            }

            const criticalScopes = ['tweet.write', 'like.write', 'media.write', 'offline.access'];
            const missingCritical = criticalScopes.filter(s => !grantedScopes.includes(s));
            const auditSummary = {
                requested: requestedScopes,
                granted: grantedScopes,
                missingCritical,
                criticalOk: missingCritical.length === 0
            };
            logToFile(`[OAUTH2][SCOPES] Audit scopes -> requested=${JSON.stringify(requestedScopes)}, granted=${JSON.stringify(grantedScopes)}, missingCritical=${JSON.stringify(missingCritical)}`);

            if (missingCritical.length > 0) {
                logToFile(`[OAUTH2][SCOPES][WARNING] Missing critical scopes: ${missingCritical.join(', ')}`);
            } else {
                logToFile('[OAUTH2][SCOPES] All critical scopes granted');
            }

            // Get user information avec retry pour éviter 429 lors de la connexion
            const userClient = new TwitterApi(accessToken);
            let me;
            let retryCount = 0;
            const maxRetries = 3;
            
            while (retryCount < maxRetries) {
                try {
                    // Délai progressif pour éviter les rate limits
                    if (retryCount > 0) {
                        const delay = Math.pow(2, retryCount) * 1000; // 2s, 4s, 8s
                        logToFile(`[OAUTH2] Retry ${retryCount}/${maxRetries} for user info after ${delay}ms delay`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                    
                    me = await userClient.v2.me();
                    break; // Succès, sortir de la boucle
                    
                } catch (error) {
                    retryCount++;
                    logToFile(`[OAUTH2] Error getting user info (attempt ${retryCount}/${maxRetries}): ${error.message}`);
                    
                    if (error.code === 429 && retryCount < maxRetries) {
                        // Rate limit, on continue avec retry
                        continue;
                    } else if (retryCount >= maxRetries) {
                        // Max retries atteint, on lève l'erreur
                        throw new Error(`Failed to get OAuth2 user info after ${maxRetries} attempts: ${error.message}`);
                    } else {
                        // Autre erreur, on lève immédiatement
                        throw error;
                    }
                }
            }

            logToFile(`[OAUTH2] User information retrieved - @${me.data.username} (ID: ${me.data.id})`);

            // Create user object (compatible with existing)
            const newUser = {
                id: me.data.id,
                username: me.data.username,
                name: me.data.name,
                accessToken,
                refreshToken,
                expiresIn,
                expiresAt: new Date(Date.now() + (expiresIn * 1000)),
                projectId: userData.projectId,
                connectedAt: new Date(),
                authMethod: 'oauth2',
                // Pour compatibilité, garder l'ancien champ
                scopes: userData.scopes,
                // Nouveaux champs d’audit
                scopesRequested: requestedScopes,
                scopesGranted: grantedScopes,
                missingCriticalScopes: missingCritical,
                criticalScopesOk: missingCritical.length === 0
            };

            // Store user persistently
            this.persistentUsers.set(me.data.id, newUser);
            await this.saveUsersToFile();

            // Clean up temporary data
            this.users.delete(inviteToken);
            this.invitations.delete(inviteToken);

            logToFile(`[OAUTH2] User @${me.data.username} connected via OAuth 2.0 (invitation ${inviteToken})`);

            return newUser;

        } catch (error) {
            // Detailed error logging
            const errorCode = error.code || error.status || 'UNKNOWN';
            const errorMessage = error.message || 'Unknown error';
            const errorData = error.data ? JSON.stringify(error.data) : 'No data';
            
            logToFile(`[OAUTH2] OAuth callback error: ${errorMessage}`);
            logToFile(`[OAUTH2] Error code: ${errorCode}`);
            logToFile(`[OAUTH2] Error data: ${errorData}`);
            
            // Specific errors
            if (errorCode === 401) {
                logToFile(`[OAUTH2] Error 401 - Check OAuth2 credentials and callback URL`);
            } else if (errorCode === 400) {
                logToFile(`[OAUTH2] Error 400 - Invalid or expired authorization code`);
            }
            
            throw error;
        }
    }

    /**
     * Gets a Twitter OAuth 2.0 client for a user
     * @param {string} userId - User ID
     * @param {boolean} skipValidation - Skip v2.me() validation to avoid rate limits
     */
    async getClientForUser(userId, skipValidation = false) {
        const user = this.persistentUsers.get(userId);
        if (!user) {
            throw new Error(`User ${userId} not found`);
        }

        // Check token expiration (with 10 minute buffer for safety)
        const now = new Date();
        const safetyBuffer = 10 * 60 * 1000; // 10 minutes
        
        // Convert expiresAt to Date object if it's a string
        const expiresAt = typeof user.expiresAt === 'string' ? new Date(user.expiresAt) : user.expiresAt;
        
        if (expiresAt && !isNaN(expiresAt.getTime()) && (expiresAt.getTime() - now.getTime()) <= safetyBuffer) {
            logToFile(`[OAUTH2] Token expires soon for user ${userId} (@${user.username}) - attempting refresh`);
            
            try {
                await this.refreshUserToken(userId);
                const refreshedUser = this.persistentUsers.get(userId);
                logToFile(`[OAUTH2] Token refreshed successfully for @${user.username}`);
                return new TwitterApi(refreshedUser.accessToken);
            } catch (error) {
                logToFile(`[OAUTH2] Refresh failed for @${user.username}: ${error.message}`);
                throw new Error(`Token expired and refresh failed for @${user.username} - reconnection required`);
            }
        }

        // Create client and test it with rate limit protection
        const client = new TwitterApi(user.accessToken);
        
        // Skip validation if requested (for cached clients or search operations)
        if (skipValidation) {
            logToFile(`[OAUTH2] Skipping validation for @${user.username} (skipValidation=true)`);
            return client;
        }
        
        try {
            // Test the client with v2.me() to ensure it works
            await client.v2.me();
            return client;
        } catch (error) {
            const errorCode = error.code || error.status || 'UNKNOWN';
            const errorMessage = error.message || String(error);
            const errorData = error && error.data ? JSON.stringify(error.data) : 'No data';
            
            // Log détaillé
            logToFile(`[OAUTH2][VALIDATE][${errorCode}] Client validation failed for user ${userId} (@${user.username}): ${errorMessage} | data=${errorData}`);
            
            if (errorCode === 429) {
                // Rate limit error - throw specific error to be handled by caller
                const rateLimitError = new Error(`Rate limit reached for @${user.username}`);
                rateLimitError.code = 429;
                rateLimitError.userId = userId;
                rateLimitError.username = user.username;
                throw rateLimitError;
            }
            
            if (errorCode === 403) {
                // Authorization error -> marquer pour reconnexion
                logToFile(`[OAUTH2][403] Authorization error for user ${userId} (@${user.username}) - token may be invalid`);
                try {
                    const u = this.persistentUsers.get(userId) || user;
                    this.persistentUsers.set(userId, {
                        ...u,
                        isActive: false,
                        requiresReconnection: true,
                        lastValidationError: { code: 403, message: errorMessage, at: new Date() }
                    });
                    await this.saveUsersToFile();
                } catch (_) {}
                throw new Error(`Authorization failed for @${user.username} - reconnection may be required`);
            }
            
            // Essayer un refresh si possible pour erreurs 400/401/UNKNOWN ou réseau générique "Request failed"
            const shouldAttemptRefresh = (
                errorCode === 400 || errorCode === 401 || errorCode === 'UNKNOWN' || /request failed/i.test(errorMessage)
            ) && !!user.refreshToken;
            
            if (shouldAttemptRefresh) {
                logToFile(`[OAUTH2] Attempting recovery via token refresh for @${user.username} after validation failure (${errorCode})`);
                try {
                    const updated = await this.refreshUserToken(userId);
                    const retryClient = new TwitterApi(updated.accessToken);
                    await retryClient.v2.me();
                    logToFile(`[OAUTH2] Recovery successful after refresh for @${user.username}`);
                    return retryClient;
                } catch (refreshErr) {
                    const rCode = refreshErr.code || refreshErr.status || 'UNKNOWN';
                    logToFile(`[OAUTH2] Recovery failed for @${user.username} -> ${refreshErr.message} (code=${rCode})`);
                }
            }
            
            // Persister l'erreur pour diagnostic et rethrow
            try {
                const u = this.persistentUsers.get(userId) || user;
                this.persistentUsers.set(userId, {
                    ...u,
                    lastValidationError: { code: errorCode, message: errorMessage, at: new Date() }
                });
                await this.saveUsersToFile();
            } catch (_) {}
            
            // Relancer l'erreur originale
            throw error;
        }
    }

    /**
     * Lists all connected users
     */
    getAllUsers() {
        return Array.from(this.persistentUsers.values()).map(user => ({
            id: user.id,
            username: user.username,
            name: user.name,
            projectId: user.projectId,
            connectedAt: user.connectedAt,
            authMethod: user.authMethod,
            expiresAt: user.expiresAt,
            accessToken: user.accessToken,  // 🔑 CORRECTION: Include token for automation
            refreshToken: user.refreshToken  // 🔑 CORRECTION: Include refresh token
        }));
    }

    /**
     * Get user by ID
     */
    getUserById(userId) {
        const user = this.persistentUsers.get(userId);
        if (user) {
            return {
                id: user.id,
                username: user.username,
                name: user.name,
                projectId: user.projectId,
                connectedAt: user.connectedAt,
                authMethod: user.authMethod,
                expiresAt: user.expiresAt,
                accessToken: user.accessToken,
                refreshToken: user.refreshToken
            };
        }
        return null;
    }

    /**
     * Removes a user
     */
    async removeUser(userId) {
        const user = this.persistentUsers.get(userId);
        if (user) {
            this.persistentUsers.delete(userId);
            await this.saveUsersToFile();
            logToFile(`[OAUTH2] User @${user.username} removed`);
            return true;
        }
        return false;
    }

    /**
     * Refreshes a user's OAuth 2.0 token
     */
    async refreshUserToken(userId) {
        const user = this.persistentUsers.get(userId);
        if (!user) {
            throw new Error(`User ${userId} not found for refresh`);
        }

        if (!user.refreshToken) {
            throw new Error(`No refresh token available for @${user.username}`);
        }

        try {
            logToFile(`[OAUTH2] Attempting token refresh for @${user.username}`);
            
            // Create temporary client for refresh
            const tempClient = new TwitterApi({
                clientId: this.appCredentials.clientId,
                clientSecret: this.appCredentials.clientSecret,
            });

            // Perform refresh
            const refreshResult = await tempClient.refreshOAuth2Token(user.refreshToken);
            
            // Update user data
            const updatedUser = {
                ...user,
                accessToken: refreshResult.accessToken,
                refreshToken: refreshResult.refreshToken || user.refreshToken, // Keep old if no new one
                expiresIn: refreshResult.expiresIn,
                expiresAt: new Date(Date.now() + (refreshResult.expiresIn * 1000)),
                lastRefresh: new Date()
            };

            // Save new data
            this.persistentUsers.set(userId, updatedUser);
            await this.saveUsersToFile();

            logToFile(`[OAUTH2] Token refreshed successfully for @${user.username} - Expires in ${Math.round(refreshResult.expiresIn / 3600)}h`);
            return updatedUser;

        } catch (error) {
            logToFile(`[OAUTH2] Refresh error for @${user.username}: ${error.message}`);
            
            // If refresh token is invalid, mark user as requiring reconnection
            if (error.code === 400 || error.message.includes('invalid_grant')) {
                logToFile(`[OAUTH2] Invalid refresh token for @${user.username} - reconnection required`);
                
                // Mark user as inactive and requiring reconnection
                const inactiveUser = {
                    ...user,
                    isActive: false,
                    requiresReconnection: true,
                    lastRefreshError: new Date(),
                    refreshErrorMessage: error.message
                };
                
                this.persistentUsers.set(userId, inactiveUser);
                await this.saveUsersToFile();
                logToFile(`[OAUTH2] User @${user.username} marked as inactive - reconnection required`);
            }
            
            throw error;
        }
    }

    /**
     * Persistent user backup (direct JSON)
     */
    async saveUsersToFile() {
        try {
            const usersArray = Array.from(this.persistentUsers.entries());
            await fs.promises.writeFile(this.dataFile, JSON.stringify(usersArray, null, 2), 'utf8');
            logToFile(`[OAUTH2] ${usersArray.length} users saved to JSON file`);
        } catch (error) {
            logToFile(`[OAUTH2] User save error: ${error.message}`);
        }
    }

    /**
     * Loading users from file (direct JSON)
     */
    async loadUsersFromFile() {
        try {
            // Charger directement depuis oauth2-users.json (sans chiffrement)
            const rawData = await fs.promises.readFile(this.dataFile, 'utf8');
            const users = JSON.parse(rawData);
            
            // Convertir le format array vers Map
            if (Array.isArray(users)) {
                this.persistentUsers = new Map(users);
            } else {
                this.persistentUsers = new Map(Object.entries(users));
            }
            
            logToFile(`[OAUTH2] ${this.persistentUsers.size} users loaded from JSON file`);
        } catch (error) {
            logToFile(`[OAUTH2] Loading failed: ${error.message}`);
            this.persistentUsers = new Map();
        }
    }

    /**
     * Cleans up expired invitations
     */
    cleanupExpiredInvitations() {
        const now = new Date();
        let cleaned = 0;
        
        for (const [token, invitation] of this.invitations.entries()) {
            if (invitation.expiresAt < now) {
                this.invitations.delete(token);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            logToFile(`[OAUTH2] ${cleaned} expired invitations cleaned up`);
        }
    }

    /**
     * Proactive token refresh scheduler
     * Refreshes tokens 30 minutes before expiration
     */
    startTokenRefreshScheduler() {
        // Check every 5 minutes for tokens that need refresh
        this.timers.setInterval('token_refresh', async () => {
            await this.checkAndRefreshTokens();
        }, 5 * 60 * 1000, { unref: true });
        logToFile('[OAUTH2] Proactive token refresh scheduler started (checks every 5min)');
    }

    /**
     * Checks all users and refreshes tokens that expire within 30 minutes
     */
    async checkAndRefreshTokens() {
        const now = new Date();
        const refreshThreshold = 30 * 60 * 1000; // 30 minutes in milliseconds
        
        for (const [userId, user] of this.persistentUsers.entries()) {
            if (!user.expiresAt || !user.refreshToken) {
                continue;
            }
            
            // Convert expiresAt to Date object if it's a string
            const expiresAt = typeof user.expiresAt === 'string' ? new Date(user.expiresAt) : user.expiresAt;
            
            if (!expiresAt || isNaN(expiresAt.getTime())) {
                logToFile(`[OAUTH2] Invalid expiresAt for user @${user.username}: ${user.expiresAt}`);
                continue;
            }
            
            const timeUntilExpiry = expiresAt.getTime() - now.getTime();
            
            // If token expires within 30 minutes, refresh it
            if (timeUntilExpiry <= refreshThreshold && timeUntilExpiry > 0) {
                try {
                    logToFile(`[OAUTH2] Proactive refresh for @${user.username} (expires in ${Math.round(timeUntilExpiry / 60000)}min)`);
                    await this.refreshUserToken(userId);
                } catch (error) {
                    logToFile(`[OAUTH2] Proactive refresh failed for @${user.username}: ${error.message}`);
                }
            }
        }
    }

    /**
     * Service statistics
     */
    getStats() {
        return {
            totalUsers: this.persistentUsers.size,
            activeInvitations: this.invitations.size,
            isConfigured: this.isConfigured(),
            callbackUrl: this.callbackUrl
        };
    }
}

// Instance singleton
let oauth2ManagerInstance = null;

function getOAuth2Manager() {
    if (!oauth2ManagerInstance) {
        oauth2ManagerInstance = new OAuth2Manager();
        
        // Periodic cleanup of expired invitations (every hour)
        oauth2ManagerInstance.timers.setInterval('invites_cleanup', () => {
            oauth2ManagerInstance.cleanupExpiredInvitations();
        }, 60 * 60 * 1000, { unref: true });
    }
    return oauth2ManagerInstance;
}

module.exports = {
    OAuth2Manager,
    getOAuth2Manager
};
