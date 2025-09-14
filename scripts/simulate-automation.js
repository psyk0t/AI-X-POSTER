#!/usr/bin/env node
/*
  Simulation du cycle d'automatisation multi-comptes
  Objectif: estimer le volume d'appels API par endpoint et détecter des dépassements potentiels

  Usage:
    node scripts/simulate-automation.js --accounts=10 --targets=50 --hours=24 \
      --tweetsRate=1 --probLike=1 --probRetweet=0.1 --probReply=1 \
      --batchSize=5 --scanIntervalMin=5

  Modèle:
  - Tweets générés par les comptes cibles à un taux uniforme (tweetsRate par compte cible et par heure)
  - Chaque tweet peut déclencher des actions par chaque compte connecté selon des probabilités
  - Budgets/limites approximés (mêmes que le script d'analyse):
      like: 200/24h, reply: 100/24h, retweet: 5/15min
  - Recherche: v2.search simulée par batch (batchSize) toutes les scanIntervalMin
*/
const args = Object.fromEntries(process.argv.slice(2).map(kv => {
  const [k, v] = kv.split('=');
  return [k.replace(/^--/, ''), v === undefined ? true : v];
}));

function toInt(val, d) { const n = parseInt(val, 10); return Number.isFinite(n) ? n : d; }
function toFloat(val, d) { const n = parseFloat(val); return Number.isFinite(n) ? n : d; }

const numAccounts = toInt(args.accounts, 10);
const numTargets = toInt(args.targets, 50);
const durationHours = toInt(args.hours, 24);
const tweetsRate = toFloat(args.tweetsRate, 1); // tweets/target/hour
const probLike = toFloat(args.probLike, 1.0);
const probRetweet = toFloat(args.probRetweet, 0.1);
const probReply = toFloat(args.probReply, 1.0);
const batchSize = toInt(args.batchSize, 5);
const scanIntervalMin = toInt(args.scanIntervalMin, 5);

// Limites (cohérentes avec scripts/analyze-raid-actions.js)
const LIMITS = {
  like24h: 200,
  reply24h: 100,
  retweet15m: 5,
};

// Estimation des tweets produits
const tweetsPerHour = numTargets * tweetsRate;
const totalTweets = tweetsPerHour * durationHours;

// Tentatives d'actions par compte (espérance)
const perAccount = {
  likes: totalTweets * probLike,
  retweets: totalTweets * probRetweet,
  replies: totalTweets * probReply,
};

// Tentatives totales (tous comptes)
const totals = {
  likes: perAccount.likes * numAccounts,
  retweets: perAccount.retweets * numAccounts,
  replies: perAccount.replies * numAccounts,
};

// Vérification limites par compte
const violations = [];
if (perAccount.likes > LIMITS.like24h) {
  violations.push(`like: ${Math.round(perAccount.likes)} > ${LIMITS.like24h}/24h`);
}
if (perAccount.replies > LIMITS.reply24h) {
  violations.push(`reply: ${Math.round(perAccount.replies)} > ${LIMITS.reply24h}/24h`);
}

// Retweets par 15 minutes (approx: réparti uniformément)
const retweetsPerHourPerAccount = tweetsPerHour * probRetweet;
const retweetsPer15mPerAccount = retweetsPerHourPerAccount / 4;
if (retweetsPer15mPerAccount > LIMITS.retweet15m) {
  violations.push(`retweet: ${retweetsPer15mPerAccount.toFixed(2)} > ${LIMITS.retweet15m}/15min`);
}

// Estimation appels v2.search (batches de cibles)
const batchesPerScan = Math.ceil(numTargets / batchSize);
const scansPerHour = 60 / scanIntervalMin;
const searchCalls = batchesPerScan * scansPerHour * durationHours;

// Endpoints mapping
const endpoints = {
  'GET /2/tweets/search/recent': Math.round(searchCalls),
  'POST /2/users/:id/likes': Math.round(totals.likes),
  'POST /2/users/:id/retweets': Math.round(totals.retweets),
  'POST /2/tweets (reply)': Math.round(totals.replies),
  // Optionnellement v2.me au démarrage par compte
  'GET /2/users/me (startup)': numAccounts,
};

// Recommandations basées sur violations
const recommendations = [];
if (perAccount.likes > LIMITS.like24h) {
  const scale = LIMITS.like24h / perAccount.likes;
  recommendations.push(`Réduire probLike à ~${(probLike * scale).toFixed(2)} ou répartir sur plus d'heures`);
}
if (perAccount.replies > LIMITS.reply24h) {
  const scale = LIMITS.reply24h / perAccount.replies;
  recommendations.push(`Réduire probReply à ~${(probReply * scale).toFixed(2)} ou espacer les replies`);
}
if (retweetsPer15mPerAccount > LIMITS.retweet15m) {
  const scale = LIMITS.retweet15m / retweetsPer15mPerAccount;
  recommendations.push(`Réduire probRetweet à ~${(probRetweet * scale).toFixed(2)} ou imposer un délai min par retweet`);
}

// Sortie
const lines = [];
lines.push('=== Simulation X-AutoRaider ===');
lines.push(`Accounts=${numAccounts}, Targets=${numTargets}, Hours=${durationHours}`);
lines.push(`TweetsRate=${tweetsRate}/target/hour`);
lines.push(`Probabilities: like=${probLike}, retweet=${probRetweet}, reply=${probReply}`);
lines.push('');
lines.push(`Total tweets observed: ${Math.round(totalTweets)}`);
lines.push(`Per-account expected actions (24h): likes=${Math.round(perAccount.likes)}, retweets=${Math.round(perAccount.retweets)}, replies=${Math.round(perAccount.replies)}`);
lines.push(`Totals across accounts: likes=${Math.round(totals.likes)}, retweets=${Math.round(totals.retweets)}, replies=${Math.round(totals.replies)}`);
lines.push('');
lines.push('Endpoint call estimates:');
for (const [ep, cnt] of Object.entries(endpoints)) {
  lines.push(`  - ${ep}: ${cnt}`);
}
lines.push('');
if (violations.length) {
  lines.push('POTENTIAL LIMIT VIOLATIONS PER ACCOUNT:');
  for (const v of violations) lines.push(`  - ${v}`);
} else {
  lines.push('No per-account violations expected with given parameters.');
}
if (recommendations.length) {
  lines.push('Recommendations:');
  for (const r of recommendations) lines.push(`  - ${r}`);
}

console.log(lines.join('\n'));
