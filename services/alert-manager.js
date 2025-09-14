// const nodemailer = require('nodemailer'); // Module manquant
const https = require('https');
const { logToFile } = require('./logs-optimized');

/**
 * ALERT MANAGER SERVICE
 * 
 * Système d'alertes email/Slack pour monitoring des comptes
 * Notifications sur désactivation, rate limits critiques, etc.
 */

class AlertManager {
    constructor() {
        this.emailConfig = {
            enabled: process.env.ALERT_EMAIL_ENABLED === 'true',
            host: process.env.ALERT_EMAIL_HOST,
            port: parseInt(process.env.ALERT_EMAIL_PORT) || 587,
            secure: process.env.ALERT_EMAIL_SECURE === 'true',
            user: process.env.ALERT_EMAIL_USER,
            pass: process.env.ALERT_EMAIL_PASS,
            from: process.env.ALERT_EMAIL_FROM,
            to: process.env.ALERT_EMAIL_TO
        };

        this.slackConfig = {
            enabled: process.env.ALERT_SLACK_ENABLED === 'true',
            webhookUrl: process.env.ALERT_SLACK_WEBHOOK_URL,
            channel: process.env.ALERT_SLACK_CHANNEL || '#automation-alerts'
        };

        this.alertHistory = new Map(); // Éviter spam d'alertes
        this.cooldownPeriod = 30 * 60 * 1000; // 30 minutes entre alertes identiques

        this.initializeEmailTransporter();
        logToFile('[ALERT-MANAGER] Service initialized');
    }

    /**
     * Initialise le transporteur email
     */
    initializeEmailTransporter() {
        if (!this.emailConfig.enabled) return;

        try {
            // Module nodemailer non disponible - email désactivé
            logToFile('[ALERT-MANAGER] Email transporter disabled (nodemailer not installed)');
        } catch (error) {
            logToFile(`[ALERT-MANAGER] Email setup error: ${error.message}`);
        }
    }

    /**
     * Vérifie si une alerte peut être envoyée (cooldown)
     */
    canSendAlert(alertKey) {
        const lastSent = this.alertHistory.get(alertKey);
        if (!lastSent) return true;
        
        return (Date.now() - lastSent) > this.cooldownPeriod;
    }

    /**
     * Marque une alerte comme envoyée
     */
    markAlertSent(alertKey) {
        this.alertHistory.set(alertKey, Date.now());
    }

    /**
     * Alerte de désactivation de compte
     */
    async alertAccountDisabled(accountId, username, reason, errorCode) {
        const alertKey = `account_disabled_${accountId}`;
        if (!this.canSendAlert(alertKey)) return;

        const title = `🚨 Compte Twitter Désactivé: @${username}`;
        const message = `
**Compte:** @${username} (${accountId})
**Raison:** ${reason}
**Code d'erreur:** ${errorCode}
**Heure:** ${new Date().toLocaleString()}

Le compte a été automatiquement muté et nécessite une attention.
        `.trim();

        await this.sendAlert(title, message, 'critical');
        this.markAlertSent(alertKey);
        logToFile(`[ALERT-MANAGER] Account disabled alert sent for @${username}`);
    }

    /**
     * Alerte de rate limit critique
     */
    async alertCriticalRateLimit(accountId, username, endpoint, remaining, resetAt) {
        const alertKey = `rate_limit_critical_${accountId}_${endpoint}`;
        if (!this.canSendAlert(alertKey)) return;

        const title = `⚠️ Rate Limit Critique: @${username}`;
        const message = `
**Compte:** @${username} (${accountId})
**Endpoint:** ${endpoint}
**Requêtes restantes:** ${remaining}
**Reset à:** ${resetAt ? resetAt.toLocaleString() : 'Inconnu'}
**Heure:** ${new Date().toLocaleString()}

Le compte approche de la limite de rate limit.
        `.trim();

        await this.sendAlert(title, message, 'warning');
        this.markAlertSent(alertKey);
        logToFile(`[ALERT-MANAGER] Critical rate limit alert sent for @${username}`);
    }

    /**
     * Alerte de récupération de compte
     */
    async alertAccountRecovered(accountId, username) {
        const alertKey = `account_recovered_${accountId}`;
        if (!this.canSendAlert(alertKey)) return;

        const title = `✅ Compte Récupéré: @${username}`;
        const message = `
**Compte:** @${username} (${accountId})
**Heure:** ${new Date().toLocaleString()}

Le compte est de nouveau opérationnel après résolution des erreurs.
        `.trim();

        await this.sendAlert(title, message, 'success');
        this.markAlertSent(alertKey);
        logToFile(`[ALERT-MANAGER] Account recovery alert sent for @${username}`);
    }

    /**
     * Alerte générique
     */
    async alertGeneric(title, message, severity = 'info') {
        await this.sendAlert(title, message, severity);
        logToFile(`[ALERT-MANAGER] Generic alert sent: ${title}`);
    }

    /**
     * Envoie une alerte via tous les canaux configurés
     */
    async sendAlert(title, message, severity = 'info') {
        const promises = [];

        // Email
        if (this.emailConfig.enabled) {
            promises.push(this.sendEmailAlert(title, message, severity));
        }

        // Slack
        if (this.slackConfig.enabled) {
            promises.push(this.sendSlackAlert(title, message, severity));
        }

        if (promises.length === 0) {
            logToFile('[ALERT-MANAGER] No alert channels configured');
            return;
        }

        try {
            await Promise.allSettled(promises);
        } catch (error) {
            logToFile(`[ALERT-MANAGER] Error sending alerts: ${error.message}`);
        }
    }

    /**
     * Envoie une alerte par email
     */
    async sendEmailAlert(title, message, severity) {
        if (!this.emailTransporter || !this.emailConfig.to) return;

        const severityEmojis = {
            critical: '🚨',
            warning: '⚠️',
            success: '✅',
            info: 'ℹ️'
        };

        const emoji = severityEmojis[severity] || 'ℹ️';
        const subject = `${emoji} ${title}`;

        const htmlMessage = message.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        try {
            await this.emailTransporter.sendMail({
                from: this.emailConfig.from,
                to: this.emailConfig.to,
                subject: subject,
                text: message,
                html: `<div style="font-family: Arial, sans-serif;">${htmlMessage}</div>`
            });
            logToFile(`[ALERT-MANAGER] Email sent: ${title}`);
        } catch (error) {
            logToFile(`[ALERT-MANAGER] Email error: ${error.message}`);
        }
    }

    /**
     * Envoie une alerte Slack
     */
    async sendSlackAlert(title, message, severity) {
        if (!this.slackConfig.webhookUrl) return;

        const severityColors = {
            critical: '#ff0000',
            warning: '#ffaa00',
            success: '#00ff00',
            info: '#0099ff'
        };

        const color = severityColors[severity] || '#0099ff';

        const payload = {
            channel: this.slackConfig.channel,
            username: 'Twitter Automation Bot',
            icon_emoji: ':robot_face:',
            attachments: [{
                color: color,
                title: title,
                text: message,
                footer: 'Twitter Automation System',
                ts: Math.floor(Date.now() / 1000)
            }]
        };

        try {
            await this.sendSlackWebhook(payload);
            logToFile(`[ALERT-MANAGER] Slack alert sent: ${title}`);
        } catch (error) {
            logToFile(`[ALERT-MANAGER] Slack error: ${error.message}`);
        }
    }

    /**
     * Envoie un webhook Slack
     */
    sendSlackWebhook(payload) {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify(payload);
            const url = new URL(this.slackConfig.webhookUrl);

            const options = {
                hostname: url.hostname,
                port: url.port || 443,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data.length
                }
            };

            const req = https.request(options, (res) => {
                if (res.statusCode === 200) {
                    resolve();
                } else {
                    reject(new Error(`Slack webhook failed: ${res.statusCode}`));
                }
            });

            req.on('error', reject);
            req.write(data);
            req.end();
        });
    }

    /**
     * Test de configuration
     */
    async testConfiguration() {
        const results = {
            email: false,
            slack: false
        };

        // Test email
        if (this.emailConfig.enabled) {
            try {
                await this.sendEmailAlert('Test Alert', 'Configuration test email', 'info');
                results.email = true;
            } catch (error) {
                logToFile(`[ALERT-MANAGER] Email test failed: ${error.message}`);
            }
        }

        // Test Slack
        if (this.slackConfig.enabled) {
            try {
                await this.sendSlackAlert('Test Alert', 'Configuration test message', 'info');
                results.slack = true;
            } catch (error) {
                logToFile(`[ALERT-MANAGER] Slack test failed: ${error.message}`);
            }
        }

        logToFile(`[ALERT-MANAGER] Configuration test results: ${JSON.stringify(results)}`);
        return results;
    }

    /**
     * Nettoie l'historique des alertes
     */
    cleanup() {
        const now = Date.now();
        const expiredKeys = [];

        for (const [key, timestamp] of this.alertHistory.entries()) {
            if (now - timestamp > 24 * 60 * 60 * 1000) { // 24h
                expiredKeys.push(key);
            }
        }

        expiredKeys.forEach(key => {
            this.alertHistory.delete(key);
        });

        if (expiredKeys.length > 0) {
            logToFile(`[ALERT-MANAGER] Cleaned up ${expiredKeys.length} expired alert entries`);
        }
    }
}

// Instance singleton
let alertManagerInstance = null;

function getAlertManager() {
    if (!alertManagerInstance) {
        alertManagerInstance = new AlertManager();
        
        // Nettoyage périodique toutes les heures
        setInterval(() => {
            alertManagerInstance.cleanup();
        }, 3600000);
    }
    return alertManagerInstance;
}

module.exports = {
    AlertManager,
    getAlertManager
};
