// --- Limite d'actions automation ---
function applyActionLimit() {
    (async () => {
        const likeInput = document.getElementById('likeLimitInput');
        const rtInput = document.getElementById('retweetLimitInput');
        const commentInput = document.getElementById('commentLimitInput');
        const status = document.getElementById('actionLimitStatus');
        const like = parseInt(likeInput.value, 10);
        const retweet = parseInt(rtInput.value, 10);
        const comment = parseInt(commentInput.value, 10);
        status.textContent = '';
        if ([like, retweet, comment].some(v => isNaN(v) || v < 1)) {
            status.textContent = 'Valeur(s) invalide(s)';
            status.style.color = '#e74c3c';
            return;
        }
        try {
            const res = await fetch('http://localhost:3005/api/set-action-limit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ like, retweet, comment })
            });
            const data = await res.json();
            if (res.ok) {
                status.textContent = `Quotas fixés : Like ${data.quotas.like}, Retweet ${data.quotas.retweet}, Commentaire ${data.quotas.comment}`;
                status.style.color = '#1da1f2';
                // Rafraîchir dashboard quotas
                fetch('http://localhost:3005/api/dashboard-stats')
                    .then(res => res.json())
                    .then(data => {
                        if (data.quotas && data.actionsLeft) updateQuotasDashboard(data.quotas, data.actionsLeft);
                    });
            } else {
                status.textContent = data.error || 'Erreur';
                status.style.color = '#e74c3c';
            }
        } catch (e) {
            status.textContent = 'Erreur réseau';
            status.style.color = '#e74c3c';
        }
    })();
}
window.applyActionLimit = applyActionLimit;

function updateQuotasDashboard(quotas, actionsLeft) {
    const quotaElt = document.getElementById('quotasDashboard');
    if (!quotaElt) return;
    quotaElt.innerHTML = `
        <b>Quotas restants :</b> 
        <span style="color:#1da1f2">Like : ${actionsLeft.like}/${quotas.like}</span> |
        <span style="color:#27ae60">RT : ${actionsLeft.retweet}/${quotas.retweet}</span> |
        <span style="color:#e67e22">Commentaire : ${actionsLeft.comment}/${quotas.comment}</span>
    `;
}

document.addEventListener('DOMContentLoaded', () => {
    // Affichage quotas restants au chargement
    fetch('http://localhost:3005/api/dashboard-stats')
        .then(res => res.json())
        .then(data => {
            if (data.quotas && data.actionsLeft) updateQuotasDashboard(data.quotas, data.actionsLeft);
        });

    async function fetchAndDisplayTweets() {
        let tweetsList = document.getElementById('found-tweets-list');
        if (!tweetsList) {
            console.error('Élément #found-tweets-list introuvable.');
            return;
        }

        try {
            const response = await fetch('http://localhost:3005/api/found-tweets')
            .then(res => res.json())
            .then(data => {
                if (data.quotas && data.actionsLeft) updateQuotasDashboard(data.quotas, data.actionsLeft);
                if (!data.tweets || data.tweets.length === 0) {
                    tweetsList.innerHTML = '<p>Aucun tweet détecté pour le moment.</p>';
                    return;
                }

                const tweetsByAuthor = data.tweets.reduce((acc, tweet) => {
                    if (!acc[tweet.author]) acc[tweet.author] = [];
                    acc[tweet.author].push(tweet);
                    return acc;
                }, {});

                tweetsList.innerHTML = Object.entries(tweetsByAuthor).map(([author, tweets]) => {
    return `
        <div class="tweet-author-group">
            <h3>@${author}</h3>
            ${tweets.map(tweet => `
                <div class="tweet">
                    <p>${tweet.text.replace(/\n/g, '<br>')}</p>
                    <div class="tweet-actions">
                        <a href="${tweet.url}" target="_blank">Voir sur X</a>
                        <button class="action-btn" data-action="like" data-tweet-id="${tweet.id}">Like</button>
                        <button class="action-btn" data-action="retweet" data-tweet-id="${tweet.id}">Retweet</button>
                        <button class="action-btn" data-action="comment" data-tweet-id="${tweet.id}">Commenter</button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}).join('');
// Ajout event listener sur les boutons après chaque rendu
    tweetsList.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', (event) => {
            const { action, tweetId } = event.target.dataset;
            performTweetAction(action, tweetId);
        });
    });
        });
        } catch (error) {
            console.error('Erreur lors de la récupération des tweets:', error);
            tweetsList.innerHTML = '<p>Erreur lors du chargement des tweets.</p>';
        }
    }

    async function performTweetAction(action, tweetId) {
        const body = { action, tweetId };

        if (action === 'comment') {
            const commentText = prompt('Votre commentaire :');
            if (commentText === null || commentText.trim() === '') return; // Annulé ou vide
            body.commentText = commentText;
        }

        try {
            const response = await fetch('http://localhost:3005/api/action', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            const result = await response.json();

            if (response.ok) {
                alert(result.message || 'Action réussie !');
                // Rafraîchir dashboard quotas
                fetch('http://localhost:3005/api/dashboard-stats')
                    .then(res => res.json())
                    .then(data => {
                        if (data.quotas && data.actionsLeft) updateQuotasDashboard(data.quotas, data.actionsLeft);
                    });
            } else {
                throw new Error(result.error || 'Une erreur inconnue est survenue.');
            }
        } catch (error) {
            console.error('Erreur lors de l\'action ' + action + ':', error);
            alert('Erreur : ' + error.message);
        }
    }

    // Premier chargement et rafraîchissement périodique
    fetchAndDisplayTweets();
    setInterval(fetchAndDisplayTweets, 10000); // Toutes les 10 secondes
});
