// --- Sticky message automation ---
function showAutomationStickyMsg() {
    const sticky = document.getElementById('automationStickyMsg');
    if(sticky) sticky.style.display = '';
}
function hideAutomationStickyMsg() {
    const sticky = document.getElementById('automationStickyMsg');
    if(sticky) sticky.style.display = 'none';
}

// --- Automation action limit ---
function applyActionLimit() {
    (async () => {
        const likeInput = document.getElementById('likeLimitInput');
        const rtInput = document.getElementById('retweetLimitInput');
        const replyInput = document.getElementById('replyLimitInput');
        const status = document.getElementById('actionLimitStatus');
        const like = parseInt(likeInput.value, 10);
        const retweet = parseInt(rtInput.value, 10);
        const reply = parseInt(replyInput.value, 10);
        status.textContent = '';
        if ([like, retweet, reply].some(v => isNaN(v) || v < 1)) {
            status.textContent = 'Invalid raid quota value(s)';
            status.style.color = '#e74c3c';
            return;
        }
        try {
            const res = await fetch(`${API_BASE_URL}/api/set-action-limit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ like, retweet, reply })
            });
            const data = await res.json();
            if (res.ok) {
                status.textContent = `Raid quotas set: Like ${data.quotas.like}, Retweet ${data.quotas.retweet}, Alpha Comment ${data.quotas.reply}`;
                status.style.color = '#1da1f2';
                // Refresh command center quotas
                fetch(`${API_BASE_URL}/api/dashboard-stats`)
                    .then(res => res.json())
                    .then(data => {
                        if (data.quotas && data.actionsLeft) updateQuotasDashboard(data.quotas, data.actionsLeft);
                    });
                showAutomationChangeNotice();
            } else {
                status.textContent = data.error || 'Error';
                status.style.color = '#e74c3c';
            }
        } catch (e) {
            status.textContent = 'Network error';
            status.style.color = '#e74c3c';
        }
    })();
}
window.applyActionLimit = applyActionLimit;

function updateQuotasDashboard(quotas, actionsLeft) {
    const quotaElt = document.getElementById('quotasDashboard');
    if (!quotaElt) return;
    let html = '<b>Raid actions left:</b> ';
    let totalLeft = 0, totalQuota = 0, first = true;
    if('like' in quotas) {
        html += `<span style="color:#1da1f2">Likes : ${actionsLeft.like||0}/${quotas.like||0}</span>`;
        totalLeft += actionsLeft.like||0; totalQuota += quotas.like||0; first=false;
    }
    if('retweet' in quotas) {
        if(!first) html += ' | ';
        html += `<span style="color:#27ae60">RT : ${actionsLeft.retweet||0}/${quotas.retweet||0}</span>`;
        totalLeft += actionsLeft.retweet||0; totalQuota += quotas.retweet||0; first=false;
    }
    if('reply' in quotas) {
        if(!first) html += ' | ';
        html += `<span style="color:#e67e22">Replies : ${actionsLeft.reply||0}/${quotas.reply||0}</span>`;
        totalLeft += actionsLeft.reply||0; totalQuota += quotas.reply||0;
    }
    html += ` <span style="margin-left:18px;color:#1abc9c;"><i class='fas fa-sigma'></i> <b>Total left: ${totalLeft}/${totalQuota}</b></span>`;
    html += '<div id="automationLiveMsg" style="margin-top:8px;"></div>';
    quotaElt.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', () => {
    const liveLogsDiv = document.getElementById('liveLogs');
    // Display remaining quotas on load
    fetch(`${API_BASE_URL}/api/dashboard-stats`)
        .then(res => res.json())
        .then(data => {
            if (data.quotas && data.actionsLeft) updateQuotasDashboard(data.quotas, data.actionsLeft);
        });

    async function fetchAndDisplayTweets() {
        let tweetsList = document.getElementById('foundTweets');
        let tweetsCard = document.getElementById('foundTweetsCard');
        if (!tweetsList) {
            console.error('Element #foundTweets not found.');
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/found-tweets`)
            .then(res => res.json())
            .then(data => {
                if (data.quotas && data.actionsLeft) updateQuotasDashboard(data.quotas, data.actionsLeft);
                
                // Update alpha tweets counter
                const foundTweetsCountElement = document.getElementById('foundTweetsCount');
                if (foundTweetsCountElement) {
                    foundTweetsCountElement.textContent = data.tweets ? data.tweets.length : 0;
                }
                
                if (!data.tweets || data.tweets.length === 0) {
                    if (tweetsCard) tweetsCard.style.display = 'none';
                    return;
                }
                
                if (tweetsCard) tweetsCard.style.display = 'block';
                
                // Modern alpha tweets display
                tweetsList.innerHTML = data.tweets.map(tweet => {
                    return `
                        <div class="card mb-2" style="padding: 15px;">
                            <div class="account-info mb-2">
                                <div class="account-avatar">${tweet.author.charAt(0).toUpperCase()}</div>
                                <strong>@${tweet.author}</strong>
                                <span class="text-muted">• ${new Date(tweet.timestamp).toLocaleString()}</span>
                            </div>
                            <p class="mb-2">${tweet.text.replace(/\n/g, '<br>')}</p>
                            <div class="tweet-actions">
                                <a href="${tweet.url}" target="_blank" class="action-btn">
                                    <i class="fas fa-external-link-alt"></i> View on X
                                </a>
                                <button class="action-btn" data-action="like" data-tweet-id="${tweet.id}">
                                    <i class="fas fa-bolt" title="Automation status: shows if automation is ON or OFF"></i> Like
                                </button>
                                <button class="action-btn" data-action="retweet" data-tweet-id="${tweet.id}">
                                    <i class="fas fa-retweet"></i> Retweet
                                </button>
                                <button class="action-btn" data-action="reply" data-tweet-id="${tweet.id}">
                                    <i class="fas fa-circle-info" title="Hover for more information about this feature"></i> Alpha Reply
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');
                
                // Add event listeners to action buttons after each render
                tweetsList.querySelectorAll('.action-btn[data-action]').forEach(btn => {
                    btn.addEventListener('click', (event) => {
                        const { action, tweetId } = event.target.dataset;
                        if (action && tweetId) {
                            performTweetAction(action, tweetId);
                        }
                    });
                });
        });
        } catch (error) {
            console.error('Error fetching alpha tweets:', error);
            tweetsList.innerHTML = '<p>Error loading alpha tweets.</p>';
        }
    }

    async function performTweetAction(action, tweetId) {
        const body = { action, tweetId };

        if (action === 'reply') {
            const replyText = prompt('Your alpha reply:');
            if (replyText === null || replyText.trim() === '') return; // Cancelled or empty
            body.replyText = replyText;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/action`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            const result = await response.json();

            if (response.ok) {
                alert(result.message || 'Raid action successful!');
                // Refresh command center quotas
                fetch(`${API_BASE_URL}/api/dashboard-stats`)
                    .then(res => res.json())
                    .then(data => {
                        if (data.quotas && data.actionsLeft) updateQuotasDashboard(data.quotas, data.actionsLeft);
                    });
            } else {
                throw new Error(result.error || 'Unknown raid engine error occurred.');
            }
        } catch (error) {
            console.error('Error during raid action ' + action + ':', error);
            alert('Raid Error: ' + error.message);
        }
    }

    // First load and periodic refresh
    fetchAndDisplayTweets();
    setInterval(fetchAndDisplayTweets, 10000); // Every 10 seconds


    async function refreshLiveLogs() {
        if (!liveLogsDiv) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/live-logs`);
            const data = await res.json();
            const logs = data.logs;

            // S'assurer que logs est bien un tableau pour éviter les erreurs
            if (!Array.isArray(logs)) {
                console.error('Live logs response is not an array:', logs);
                return; // On arrête le traitement pour cette fois
            }
        } catch (error) {
            console.error('Error processing raid logs:', error);
        }
    }

}); // <-- Fin du DOMContentLoaded
