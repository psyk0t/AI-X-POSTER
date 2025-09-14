const axios = require('axios');
const { logToFile } = require('./logs-optimized');
const { pushLiveLog } = require('./automation');

// Limites et configuration IA (en mémoire)
const AI_TIMEOUT_MS = parseInt(process.env.PERPLEXITY_TIMEOUT_MS || '15000', 10);
const AI_DAILY_LIMIT = parseInt(process.env.PERPLEXITY_DAILY_LIMIT || '2000', 10); // nombre max d'appels/jour
const AI_WINDOW_MS = parseInt(process.env.PERPLEXITY_WINDOW_MS || '60000', 10); // fenêtre glissante en ms
const AI_WINDOW_LIMIT = parseInt(process.env.PERPLEXITY_WINDOW_LIMIT || '30', 10); // max appels par fenêtre
const AI_MIN_INTERVAL_MS = parseInt(process.env.PERPLEXITY_MIN_INTERVAL_MS || '1200', 10); // intervalle min entre appels

const aiUsageState = {
    dayKey: new Date().toDateString(),
    totalCalls: 0,
    windowCalls: 0,
    windowResetAt: Date.now() + AI_WINDOW_MS,
    lastCallAt: 0
};

function resetIfNewDay() {
    const today = new Date().toDateString();
    if (aiUsageState.dayKey !== today) {
        aiUsageState.dayKey = today;
        aiUsageState.totalCalls = 0;
        aiUsageState.windowCalls = 0;
        aiUsageState.windowResetAt = Date.now() + AI_WINDOW_MS;
        aiUsageState.lastCallAt = 0;
        logToFile('[AI][LIMITS] Daily counters reset');
    }
}

function refillWindowIfNeeded() {
    const now = Date.now();
    if (now >= aiUsageState.windowResetAt) {
        aiUsageState.windowCalls = 0;
        aiUsageState.windowResetAt = now + AI_WINDOW_MS;
        logToFile('[AI][LIMITS] Window counters reset');
    }
}

function canCallNow() {
    resetIfNewDay();
    refillWindowIfNeeded();
    const now = Date.now();
    const timeSinceLast = now - aiUsageState.lastCallAt;
    if (aiUsageState.totalCalls >= AI_DAILY_LIMIT) {
        return { allowed: false, reason: 'daily_limit_reached' };
    }
    if (aiUsageState.windowCalls >= AI_WINDOW_LIMIT) {
        return { allowed: false, reason: 'window_limit_reached', retryInMs: aiUsageState.windowResetAt - now };
    }
    if (timeSinceLast < AI_MIN_INTERVAL_MS) {
        return { allowed: false, reason: 'min_interval', retryInMs: AI_MIN_INTERVAL_MS - timeSinceLast };
    }
    return { allowed: true };
}

function noteCall() {
    const now = Date.now();
    aiUsageState.lastCallAt = now;
    aiUsageState.totalCalls++;
    aiUsageState.windowCalls++;
}

async function wait(ms) {
    return new Promise(res => {
        const id = setTimeout(res, ms);
        if (id && typeof id.unref === 'function') id.unref();
    });
}

/**
 * Generates unique comments for a list of tweets using the Perplexity API.
 * @param {Array<Object>} tweets - The list of tweets to comment on.
 * @param {Object} options - Options containing tokenSettings.
 * @returns {Promise<Array<String>>} - A promise that resolves with a list of comments.
 */
async function generateUniqueAIComments(tweets, options) {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    
    logToFile(`[AI][START] Starting AI comment generation - ${tweets.length} tweet(s) to process`);
    pushLiveLog(`[AI] Starting generation for ${tweets.length} tweet(s)`);
    
    if (!apiKey) {
        const errorMsg = '[AI][ERROR] Missing Perplexity API key (PERPLEXITY_API_KEY in .env)';
        console.error(errorMsg);
        pushLiveLog('[AI][ERROR] Missing Perplexity API key');
        return tweets.map(() => "");
    }
    
    if (!Array.isArray(tweets)) {
        pushLiveLog(`[AI] Converting single tweet to array`);
        tweets = [tweets];
    }

    pushLiveLog(`[AI] Generating prompts for ${tweets.length} tweet(s)`);
    logToFile(`[AI][PROMPTS] Starting prompt generation with tokenSettings: ${JSON.stringify(options.tokenSettings || {})}`);
    
    const prompts = tweets.map(tweet => {
        const { tokenSymbol, tokenName, tokenX, tokenChain } = options.tokenSettings || {};
        const tweetText = tweet.text || tweet.full_text;
        logToFile(`[AI][PROMPT_TOKENS] For tweet ${tweet.id_str || tweet.id}: symbol=${tokenSymbol}, name=${tokenName}, x=${tokenX}, chain=${tokenChain}`);
        console.log(`[AI][PROMPT_TOKENS][CONSOLE] For tweet ${tweet.id_str || tweet.id}: symbol=${tokenSymbol}, name=${tokenName}, x=${tokenX}, chain=${tokenChain}`);
        return getActiveAIPrompt(tweetText, tokenSymbol, tokenName, tokenX, tokenChain);
    });

    const comments = [];
    for (let i = 0; i < tweets.length; i++) {
        const tweet = tweets[i];
        const prompt = prompts[i];
        const safeTweetId = (tweet && (tweet.id_str || tweet.id || (tweet.data && tweet.data.id))) || 'unknown';
        pushLiveLog(`[AI] Calling Perplexity API for tweet ${safeTweetId}`);
        logToFile(`[AI][API_CALL] Calling Perplexity for tweet ${safeTweetId}`);

        try {
            // Respecter les limites d'usage et l'intervalle minimal
            let gate = canCallNow();
            if (!gate.allowed) {
                if (gate.reason === 'daily_limit_reached') {
                    const msg = `[AI][LIMITS] Daily limit reached (${AI_DAILY_LIMIT}). Skipping tweet ${tweet.id_str}`;
                    logToFile(msg);
                    pushLiveLog('[AI][LIMITS] Daily limit reached, skipping');
                    comments.push("");
                    continue;
                }
                const delay = Math.max(50, gate.retryInMs || 0);
                logToFile(`[AI][LIMITS] Waiting ${delay}ms due to ${gate.reason}`);
                await wait(delay);
            }

            // Vérifier à nouveau après attente
            gate = canCallNow();
            if (!gate.allowed) {
                const delay = Math.max(100, gate.retryInMs || AI_MIN_INTERVAL_MS);
                logToFile(`[AI][LIMITS] Secondary wait ${delay}ms due to ${gate.reason}`);
                await wait(delay);
            }

            // Marquer l'appel
            noteCall();

            const response = await axios.post('https://api.perplexity.ai/chat/completions', {
                model: 'sonar',
                messages: [
                    { role: 'system', content: prompt.system },
                    { role: 'user', content: prompt.user }
                ]
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: AI_TIMEOUT_MS
            });

            const comment = response.data.choices[0].message.content.trim();
            comments.push(comment);
            logToFile(`[AI][SUCCESS] AI response received for tweet ${safeTweetId}: ${comment.substring(0, 50)}...`);
            pushLiveLog(`[AI] Comment generated for tweet ${safeTweetId}`);
        } catch (error) {
            const timeout = error && (error.code === 'ECONNABORTED' || error.message?.includes('timeout'));
            const details = error?.response?.data?.error?.message || error.message;
            const errorMsg = `[AI][ERROR] Generation failed for tweet ${safeTweetId}${timeout ? ' (timeout)' : ''}: ${details}`;
            console.error(errorMsg);
            logToFile(errorMsg);
            pushLiveLog(`[AI][ERROR] Generation failed for tweet ${safeTweetId}`);
            comments.push("");
        }
    }

    logToFile(`[AI][END] Generation complete. ${comments.filter(c => c).length} comment(s) generated successfully.`);
    pushLiveLog('[AI] Comment generation complete.');
    return comments;
}

// Helper function to be self-contained
function getActiveAIPrompt(tweetText, tokenSymbol, tokenName, tokenX, tokenChain) {
    let prompt = `You're a chill and confident American crypto fan on X. Your mission is to reply to an influencer's tweet with a reply that feels authentically human, not automated.

Your reply must be:
- ULTRA-SHORT and punchy: one single sentence, maximum 80 characters.
- Conversational and natural. Avoid repeating the same patterns or phrases.
- Confident, familiar, and witty. Use slang when it fits perfectly (e.g., 'no cap', 'LFG', 'send it').

Key instructions for your reply:
1. **React to the tweet's content only.** No off-topic fluff.
2. **Subtly and smoothly integrate {{$TOKEN_SYMBOL}} or {{$TOKEN_X}}**. Don't force it. The mention should feel like a natural part of the conversation.
3. **Vary your language.** Instead of always saying "chill," try "laid-back," "smooth," or "relaxed." Use different sentence structures.
4. **Use emojis sparingly, but meaningfully.** One well-placed emoji can replace a word.
5. **Mention {{$TOKEN_NAME}} or {{$TOKEN_CHAIN}} only if it flows naturally.**

If the tweet mentions a specific topic, do a quick web search on it. Also, check "{{$TOKEN_NAME}} price and news on {{$TOKEN_CHAIN}}" and integrate this info if it makes your short reply more clever or timely.

If the tweet is generic, keep your reply casual but punchy, with a subtle nod to {{$TOKEN_SYMBOL}}.

Good style:
- "{{$TOKEN_SYMBOL}} on {{$TOKEN_CHAIN}} is the only vibe I need today. No cap."
- "Base got a new king, and it's {{$TOKEN_X}}. Let's get it."
- "Watching {{$TOKEN_SYMBOL}} pump while others sweat. 😎"

Bad style: Anything long, generic, or missing the token's subtle reference.

**IMPORTANT: Always end your reply with this exact signature on a new line:**
"\n🤖 Message sent by Raid AI Bot - DM @psyk0t for infos (X or TG) or visit https://webtester.click"

Tweet: "{tweetText}"

Just write the reply with the signature. Nothing else.`;

    prompt = prompt
        .replace(/\{\{\$TOKEN_SYMBOL\}\}/g, tokenSymbol)
        .replace(/\{\{\$TOKEN_NAME\}\}/g, tokenName)
        .replace(/\{\{\$TOKEN_X\}\}/g, tokenX)
        .replace(/\{\{\$TOKEN_CHAIN\}\}/g, tokenChain);

    return {
        system: prompt,
        user: tweetText || ""
    };

}

module.exports = { generateUniqueAIComments };

// État public des limites IA (pour monitoring)
function getAiLimitsState() {
    resetIfNewDay();
    refillWindowIfNeeded();
    return {
        dailyLimit: AI_DAILY_LIMIT,
        dailyUsed: aiUsageState.totalCalls,
        windowLimit: AI_WINDOW_LIMIT,
        windowUsed: aiUsageState.windowCalls,
        windowResetInMs: Math.max(0, aiUsageState.windowResetAt - Date.now()),
        lastCallAt: aiUsageState.lastCallAt,
        minIntervalMs: AI_MIN_INTERVAL_MS,
        timeoutMs: AI_TIMEOUT_MS
    };
}

module.exports.getAiLimitsState = getAiLimitsState;
