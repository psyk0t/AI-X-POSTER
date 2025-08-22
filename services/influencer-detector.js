const fs = require('fs');
const path = require('path');
const { TwitterApi } = require('twitter-api-v2');
const logToFile = require('./logs').logToFile;

class InfluencerDetector {
    constructor() {
        this.dataFile = path.join(__dirname, '..', 'data', 'influencer-interactions.json');
        this.interactions = [];
        this.twitterClient = null;
        this.monitoredTweets = new Set(); // Tweets à surveiller
        this.webhookCallbacks = []; // Callbacks pour les webhooks
        this.loadData();
        
        // Initialiser automatiquement le client Twitter avec le Bearer Token du .env
        this.initializeFromEnv();
        
        // Seuils pour définir les niveaux d'influenceurs
        this.INFLUENCER_TIERS = {
            MEGA: { min: 1000000, label: 'Mega Influencer', emoji: '🐋', color: '#ff6b6b' },
            MACRO: { min: 100000, label: 'Macro Influencer', emoji: '🦈', color: '#4ecdc4' },
            MICRO: { min: 10000, label: 'Micro Influencer', emoji: '🐟', color: '#45b7d1' },
            NANO: { min: 1000, label: 'Nano Influencer', emoji: '🐠', color: '#96ceb4' },
            REGULAR: { min: 0, label: 'Regular User', emoji: '👤', color: '#95a5a6' }
        };
        
        // Scores d'impact par type d'interaction
        this.INTERACTION_SCORES = {
            like: 1,
            retweet: 3,
            reply: 5,
            quote: 4
        };
        
        console.log('[INFLUENCER DETECTOR] Service initialized');
    }
    
    loadData() {
        this.interactions = this.loadInteractions();
    }
    
    loadInteractions() {
        try {
            if (fs.existsSync(this.dataFile)) {
                const data = fs.readFileSync(this.dataFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('[INFLUENCER DETECTOR] Error loading interactions:', error);
        }
        return [];
    }
    
    // Initialiser automatiquement avec le Bearer Token du .env
    initializeFromEnv() {
        const bearerToken = process.env.X_BEARER_TOKEN;
        if (bearerToken) {
            const success = this.initializeTwitterClient(bearerToken);
            if (success) {
                logToFile('[INFLUENCER] Twitter API initialized automatically from .env');
            } else {
                logToFile('[INFLUENCER] Failed to initialize Twitter API from .env');
            }
        } else {
            logToFile('[INFLUENCER] No X_BEARER_TOKEN found in .env');
        }
    }
    
    // Initialiser le client Twitter
    initializeTwitterClient(bearerToken) {
        try {
            this.twitterClient = new TwitterApi(bearerToken);
            logToFile('[INFLUENCER] Twitter API client initialized');
            return true;
        } catch (error) {
            logToFile(`[INFLUENCER] Error initializing Twitter client: ${error.message}`);
            return false;
        }
    }
    
    // Ajouter un tweet à surveiller
    addTweetToMonitor(tweetId, metadata = {}) {
        this.monitoredTweets.add({
            id: tweetId,
            addedAt: new Date().toISOString(),
            metadata
        });
        logToFile(`[INFLUENCER] Added tweet ${tweetId} to monitoring`);
    }
    
    // Supprimer un tweet du monitoring
    removeTweetFromMonitor(tweetId) {
        this.monitoredTweets.delete(tweetId);
        logToFile(`[INFLUENCER] Removed tweet ${tweetId} from monitoring`);
    }
    
    // Ajouter un callback webhook
    addWebhookCallback(callback) {
        this.webhookCallbacks.push(callback);
    }
    
    // Déclencher les webhooks
    triggerWebhooks(interaction) {
        this.webhookCallbacks.forEach(callback => {
            try {
                callback(interaction);
            } catch (error) {
                logToFile(`[INFLUENCER] Webhook callback error: ${error.message}`);
            }
        });
    }
    
    // Monitorer les interactions d'un tweet spécifique
    async monitorTweetInteractions(tweetId) {
        if (!this.twitterClient) {
            logToFile('[INFLUENCER] Twitter client not initialized');
            return false;
        }
        
        try {
            // Récupérer les informations du tweet
            const tweet = await this.twitterClient.v2.singleTweet(tweetId, {
                expansions: ['author_id'],
                'user.fields': ['public_metrics', 'verified']
            });
            
            // Récupérer les utilisateurs qui ont liké le tweet
            const likers = await this.twitterClient.v2.tweetLikedBy(tweetId, {
                'user.fields': ['public_metrics', 'verified'],
                max_results: 100
            });
            
            // Récupérer les utilisateurs qui ont retweeté
            const retweeters = await this.twitterClient.v2.tweetRetweetedBy(tweetId, {
                'user.fields': ['public_metrics', 'verified'],
                max_results: 100
            });
            
            // Traiter les likes
            for (const user of likers.data || []) {
                await this.processInteraction(tweetId, user, 'like', tweet.data);
            }
            
            // Traiter les retweets
            for (const user of retweeters.data || []) {
                await this.processInteraction(tweetId, user, 'retweet', tweet.data);
            }
            
            logToFile(`[INFLUENCER] Monitored interactions for tweet ${tweetId}`);
            return true;
            
        } catch (error) {
            logToFile(`[INFLUENCER] Error monitoring tweet ${tweetId}: ${error.message}`);
            return false;
        }
    }
    
    // Traiter une interaction détectée
    async processInteraction(tweetId, user, interactionType, tweetData) {
        const tier = this.getInfluencerTier(user.public_metrics.followers_count);
        
        // Ne traiter que les influenceurs (pas les utilisateurs réguliers)
        if (tier === 'REGULAR') return;
        
        const interaction = {
            id: `${tweetId}_${user.id}_${interactionType}_${Date.now()}`,
            timestamp: new Date().toISOString(),
            tweetId,
            tweetData: {
                text: tweetData.text,
                author_id: tweetData.author_id
            },
            influencer: {
                id: user.id,
                username: user.username,
                followerCount: user.public_metrics.followers_count,
                isVerified: user.verified || false,
                tier,
                tierInfo: this.INFLUENCER_TIERS[tier]
            },
            interaction: {
                type: interactionType
            },
            impact: this.calculateImpact(user.public_metrics.followers_count, interactionType)
        };
        
        // Vérifier si cette interaction existe déjà
        const exists = this.interactions.some(existing => 
            existing.tweetId === tweetId && 
            existing.influencer.id === user.id && 
            existing.interaction.type === interactionType
        );
        
        if (!exists) {
            this.recordInteraction(interaction);
            
            // Log dans le système de logs existant
            const logMessage = `[INFLUENCER][${interaction.influencer.username}] ${tier} influencer (${this.formatNumber(interaction.influencer.followerCount)} followers) ${interactionType} tweet ${tweetId} - Impact: ${interaction.impact.score}`;
            logToFile(logMessage);
            
            // Déclencher les webhooks
            this.triggerWebhooks(interaction);
            
            logToFile(`[INFLUENCER] New ${tier} influencer interaction detected: @${user.username} ${interactionType} tweet ${tweetId}`);
        }
    }
    
    // Démarrer le monitoring en continu
    startContinuousMonitoring(intervalMinutes = 60) {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        
        this.monitoringInterval = setInterval(async () => {
            for (const tweetData of this.monitoredTweets) {
                await this.monitorTweetInteractions(tweetData.id);
            }
        }, intervalMinutes * 60 * 1000);
        
        logToFile(`[INFLUENCER] Started continuous monitoring (${intervalMinutes}min intervals)`);
    }
    
    // Arrêter le monitoring
    stopContinuousMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            logToFile('[INFLUENCER] Stopped continuous monitoring');
        }
    }
    
    // Formater les nombres
    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }
    
    saveInteractions() {
        try {
            // Créer le dossier data s'il n'existe pas
            const dataDir = path.dirname(this.dataFile);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            
            fs.writeFileSync(this.dataFile, JSON.stringify(this.interactions, null, 2));
        } catch (error) {
            console.error('[INFLUENCER DETECTOR] Error saving interactions:', error);
        }
    }
    
    // Déterminer le tier d'un utilisateur basé sur ses followers
    getUserTier(followerCount) {
        if (followerCount >= this.INFLUENCER_TIERS.MEGA.min) return 'MEGA';
        if (followerCount >= this.INFLUENCER_TIERS.MACRO.min) return 'MACRO';
        if (followerCount >= this.INFLUENCER_TIERS.MICRO.min) return 'MICRO';
        if (followerCount >= this.INFLUENCER_TIERS.NANO.min) return 'NANO';
        return 'REGULAR';
    }
    
    // Calculer le score d'impact d'une interaction
    calculateImpactScore(followerCount, interactionType, isVerified = false) {
        const baseTier = this.getUserTier(followerCount);
        const tierMultiplier = {
            MEGA: 100,
            MACRO: 50,
            MICRO: 10,
            NANO: 3,
            REGULAR: 1
        };
        
        const baseScore = this.INTERACTION_SCORES[interactionType] || 1;
        const tierScore = tierMultiplier[baseTier] || 1;
        const verifiedBonus = isVerified ? 1.5 : 1;
        
        return Math.round(baseScore * tierScore * verifiedBonus);
    }
    
    // Estimer la portée d'une interaction
    estimateReach(followerCount, interactionType) {
        const reachMultiplier = {
            like: 0.02,      // 2% des followers voient un like
            retweet: 0.15,   // 15% des followers voient un RT
            reply: 0.05,     // 5% des followers voient une reply
            quote: 0.12      // 12% des followers voient un quote
        };
        
        return Math.round(followerCount * (reachMultiplier[interactionType] || 0.02));
    }
    
    // Enregistrer une nouvelle interaction d'influenceur
    recordInfluencerInteraction(data) {
        const {
            tweetId,
            tweetUrl,
            tweetText,
            tweetAuthor,
            influencerId,
            influencerUsername,
            influencerDisplayName,
            followerCount,
            isVerified,
            interactionType,
            interactionText = null
        } = data;
        
        const tier = this.getUserTier(followerCount);
        
        // Ne garder que les interactions d'influenceurs (pas les regular users)
        if (tier === 'REGULAR') {
            return null;
        }
        
        const impactScore = this.calculateImpactScore(followerCount, interactionType, isVerified);
        const estimatedReach = this.estimateReach(followerCount, interactionType);
        
        const interaction = {
            id: `${tweetId}_${influencerId}_${interactionType}_${Date.now()}`,
            timestamp: new Date().toISOString(),
            tweetId,
            tweetUrl,
            tweetText: tweetText ? tweetText.substring(0, 200) : null,
            tweetAuthor,
            influencer: {
                id: influencerId,
                username: influencerUsername,
                displayName: influencerDisplayName,
                followerCount,
                isVerified,
                tier,
                tierInfo: this.INFLUENCER_TIERS[tier]
            },
            interaction: {
                type: interactionType,
                text: interactionText ? interactionText.substring(0, 300) : null
            },
            impact: {
                score: impactScore,
                estimatedReach,
                tier
            }
        };
        
        this.interactions.unshift(interaction); // Ajouter au début
        
        // Garder seulement les 1000 dernières interactions
        if (this.interactions.length > 1000) {
            this.interactions = this.interactions.slice(0, 1000);
        }
        
        this.saveInteractions();
        
        console.log(`[INFLUENCER DETECTOR] New ${tier} interaction: @${influencerUsername} (${followerCount} followers) ${interactionType} on tweet ${tweetId}`);
        
        return interaction;
    }
    
    // Obtenir les statistiques des interactions d'influenceurs
    getInfluencerStats() {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const thisWeek = new Date(today.getTime() - (7 * 24 * 60 * 60 * 1000));
        const thisMonth = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
        
        const stats = {
            total: this.interactions.length,
            today: 0,
            thisWeek: 0,
            thisMonth: 0,
            byTier: { MEGA: 0, MACRO: 0, MICRO: 0, NANO: 0 },
            byType: { like: 0, retweet: 0, reply: 0, quote: 0 },
            totalImpactScore: 0,
            totalEstimatedReach: 0,
            topInfluencers: []
        };
        
        const influencerMap = new Map();
        
        this.interactions.forEach(interaction => {
            const interactionDate = new Date(interaction.timestamp);
            
            // Compteurs temporels
            if (interactionDate >= today) stats.today++;
            if (interactionDate >= thisWeek) stats.thisWeek++;
            if (interactionDate >= thisMonth) stats.thisMonth++;
            
            // Compteurs par tier et type
            stats.byTier[interaction.influencer.tier]++;
            stats.byType[interaction.interaction.type]++;
            
            // Impact total
            stats.totalImpactScore += interaction.impact.score;
            stats.totalEstimatedReach += interaction.impact.estimatedReach;
            
            // Top influenceurs
            const key = interaction.influencer.username;
            if (!influencerMap.has(key)) {
                influencerMap.set(key, {
                    username: interaction.influencer.username,
                    displayName: interaction.influencer.displayName,
                    followerCount: interaction.influencer.followerCount,
                    tier: interaction.influencer.tier,
                    isVerified: interaction.influencer.isVerified,
                    interactions: 0,
                    totalImpact: 0,
                    lastInteraction: interaction.timestamp
                });
            }
            
            const influencer = influencerMap.get(key);
            influencer.interactions++;
            influencer.totalImpact += interaction.impact.score;
            if (interaction.timestamp > influencer.lastInteraction) {
                influencer.lastInteraction = interaction.timestamp;
            }
        });
        
        // Top 10 influenceurs par impact
        stats.topInfluencers = Array.from(influencerMap.values())
            .sort((a, b) => b.totalImpact - a.totalImpact)
            .slice(0, 10);
        
        return stats;
    }
    
    // Obtenir les interactions récentes
    getRecentInteractions(limit = 20) {
        return this.interactions.slice(0, limit);
    }
    
    // Obtenir les interactions par tier
    getInteractionsByTier(tier, limit = 10) {
        return this.interactions
            .filter(interaction => interaction.influencer.tier === tier)
            .slice(0, limit);
    }
    
    // Simuler une interaction pour les tests
    simulateInfluencerInteraction() {
        const mockInfluencers = [
            { username: 'elonmusk', displayName: 'Elon Musk', followers: 54000000, verified: true },
            { username: 'vitalikbuterin', displayName: 'Vitalik Buterin', followers: 5200000, verified: true },
            { username: 'cz_binance', displayName: 'CZ Binance', followers: 8100000, verified: true },
            { username: 'coinbase', displayName: 'Coinbase', followers: 4800000, verified: true },
            { username: 'naval', displayName: 'Naval', followers: 2100000, verified: true }
        ];
        
        const interactionTypes = ['like', 'retweet', 'reply'];
        const mockTweets = [
            'Just discovered this amazing crypto project! 🚀',
            'The future of DeFi is here! #crypto',
            'This token is going to the moon! 🌙'
        ];
        
        const randomInfluencer = mockInfluencers[Math.floor(Math.random() * mockInfluencers.length)];
        const randomType = interactionTypes[Math.floor(Math.random() * interactionTypes.length)];
        const randomTweet = mockTweets[Math.floor(Math.random() * mockTweets.length)];
        
        return this.recordInfluencerInteraction({
            tweetId: `mock_${Date.now()}`,
            tweetUrl: `https://twitter.com/test/status/mock_${Date.now()}`,
            tweetText: randomTweet,
            tweetAuthor: 'test_account',
            influencerId: `mock_${randomInfluencer.username}`,
            influencerUsername: randomInfluencer.username,
            influencerDisplayName: randomInfluencer.displayName,
            followerCount: randomInfluencer.followers,
            isVerified: randomInfluencer.verified,
            interactionType: randomType,
            interactionText: randomType === 'reply' ? 'Great project! Looking forward to see more!' : null
        });
    }
}

module.exports = InfluencerDetector;
