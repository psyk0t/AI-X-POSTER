const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '..', 'ai-token-settings.json');

function loadTokenSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
            return JSON.parse(data);
        }
    } catch (e) {
        // ignore, fallback to default
    }
    return { tokenSymbol: '', tokenName: '', tokenX: '', tokenChain: '' };
}

function saveTokenSettings(settings) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

module.exports = { loadTokenSettings, saveTokenSettings };
