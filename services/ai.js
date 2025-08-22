const axios = require('axios');
const { logToFile } = require('./logs');
const { pushLiveLog } = require('./automation');

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
        pushLiveLog(`[AI] Calling Perplexity API for tweet ${tweet.id_str}`);
        logToFile(`[AI][API_CALL] Calling Perplexity for tweet ${tweet.id_str}`);

        try {
            const response = await axios.post('https://api.perplexity.ai/chat/completions', {
                model: 'sonar',
                messages: [
                    { role: 'system', content: prompt.system },
                    { role: 'user', content: prompt.user }
                ]
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            });

            const comment = response.data.choices[0].message.content.trim();
            comments.push(comment);
            logToFile(`[AI][SUCCESS] AI response received for tweet ${tweet.id_str}: ${comment.substring(0, 50)}...`);
            pushLiveLog(`[AI] Comment generated for tweet ${tweet.id_str}`);
        } catch (error) {
            const errorMsg = `[AI][ERROR] Generation failed for tweet ${tweet.id_str}: ${error.response ? error.response.data.error.message : error.message}`;
            console.error(errorMsg);
            logToFile(errorMsg);
            pushLiveLog(`[AI][ERROR] Generation failed for tweet ${tweet.id_str}`);
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
"\n🤖 Message sent by Raid AI Bot - DM @psyk0t for infos (X or TG)"

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
