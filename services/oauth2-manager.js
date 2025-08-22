const { TwitterApi } = require('twitter-api-v2');
const fs = require('fs');
const path = require('path');
const { logToFile } = require('./logs-optimized');

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
        
        this.appCredentials = {
            clientId: process.env.X_CLIENT_ID,
            clientSecret: process.env.X_CLIENT_SECRET,
        };
        
        this.callbackUrl = process.env.OAUTH2_CALLBACK_URL || 'http://localhost:3005/oauth2/callback';
        this.dataFile = path.join(__dirname, '..', 'oauth2-users.json');
        
        // Load existing users
        this.loadUsersFromFile();
        
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
        'offline.access'     // Refresh tokens ⭐ CRITICAL
    ]) {
        // Check that invitation token is valid
        const invitation = this.invitations.get(inviteToken);
        if (!invitation) {
            throw new Error('Invalid or expired invitation token');
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
            const { accessToken, refreshToken, expiresIn } = await client.loginWithOAuth2({
                code,
                codeVerifier: userData.codeVerifier,
                redirectUri: this.callbackUrl,
            });

            logToFile(`[OAUTH2] Tokens obtained successfully - accessToken: ${accessToken ? 'present' : 'missing'}`);

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
                scopes: userData.scopes
            };

            // Store user persistently
            this.persistentUsers.set(me.data.id, newUser);
            this.saveUsersToFile();

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
     */
    async getClientForUser(userId) {
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
        
        try {
            // Test the client with v2.me() to ensure it works
            await client.v2.me();
            return client;
        } catch (error) {
            const errorCode = error.code || error.status || 'UNKNOWN';
            
            if (errorCode === 429) {
                // Rate limit error - throw specific error to be handled by caller
                logToFile(`[OAUTH2][429] Rate limit reached for user ${userId} (@${user.username}) during client validation`);
                const rateLimitError = new Error(`Rate limit reached for @${user.username}`);
                rateLimitError.code = 429;
                rateLimitError.userId = userId;
                rateLimitError.username = user.username;
                throw rateLimitError;
            } else if (errorCode === 403) {
                // Authorization error
                logToFile(`[OAUTH2][403] Authorization error for user ${userId} (@${user.username}) - token may be invalid`);
                throw new Error(`Authorization failed for @${user.username} - reconnection may be required`);
            } else {
                // Other errors
                logToFile(`[OAUTH2][${errorCode}] Client validation failed for user ${userId} (@${user.username}): ${error.message}`);
                throw error;
            }
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
     * Removes a user
     */
    removeUser(userId) {
        const user = this.persistentUsers.get(userId);
        if (user) {
            this.persistentUsers.delete(userId);
            this.saveUsersToFile();
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
            this.saveUsersToFile();

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
                this.saveUsersToFile();
                logToFile(`[OAUTH2] User @${user.username} marked as inactive - reconnection required`);
            }
            
            throw error;
        }
    }

    /**
     * Persistent user backup
     */
    saveUsersToFile() {
        try {
            const usersArray = Array.from(this.persistentUsers.entries()).map(([id, user]) => [id, user]);
            fs.writeFileSync(this.dataFile, JSON.stringify(usersArray, null, 2));
        } catch (error) {
            logToFile(`[OAUTH2] User save error: ${error.message}`);
        }
    }

    /**
     * Loading users from file
     */
    loadUsersFromFile() {
        try {
            if (fs.existsSync(this.dataFile)) {
                const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
                this.persistentUsers = new Map(data);
                logToFile(`[OAUTH2] ${this.persistentUsers.size} users loaded from file`);
            }
        } catch (error) {
            logToFile(`[OAUTH2] User loading error: ${error.message}`);
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
        setInterval(async () => {
            await this.checkAndRefreshTokens();
        }, 5 * 60 * 1000); // 5 minutes
        
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
        setInterval(() => {
            oauth2ManagerInstance.cleanupExpiredInvitations();
        }, 60 * 60 * 1000);
    }
    return oauth2ManagerInstance;
}

module.exports = {
    OAuth2Manager,
    getOAuth2Manager
};
