# Inventaire des endpoints Twitter utilisés

Ce document recense les endpoints Twitter (API v2 et v1) effectivement utilisés dans le code.
Références établies via recherche ciblée dans `services/` et `server.js`.

## Endpoints v2 (twitter-api-v2)

- GET /2/users/me
  - Méthode: `client.v2.me()`
  - Fichiers: `services/oauth2-manager.js`, `services/automation.js`, `server.js`
  - Usage: validation de session, récupération identité du compte, détection erreurs 403/429

- GET /2/tweets/search/recent
  - Méthode: `client.v2.search(query, options)`
  - Fichiers: `services/automation.js` (scan des comptes surveillés), `services/automation-broken.js` (legacy)
  - Usage: découverte des tweets originaux à traiter (exclusion RT/reply)

- POST /2/users/:id/likes
  - Méthode: `client.v2.like(userId, tweetId)`
  - Fichiers: `services/automation.js`
  - Usage: exécution d’un like

- POST /2/users/:id/retweets
  - Méthode: `client.v2.retweet(userId, tweetId)`
  - Fichiers: `services/automation.js`
  - Usage: exécution d’un retweet

- POST /2/tweets
  - Méthode: `client.v2.tweet(text, options)`
  - Fichiers: `services/automation.js`
  - Usage: publication d’une réponse (reply), avec éventuellement média (voir v1)

- GET /2/tweets/:id
  - Méthode: `client.v2.singleTweet(tweetId, { expansions, user.fields })`
  - Fichiers: `services/influencer-detector.js`
  - Usage: chargement détaillé du tweet cible (métadonnées, auteur)

- GET /2/tweets/:id/liking_users
  - Méthode: `client.v2.tweetLikedBy(tweetId, options)`
  - Fichiers: `services/influencer-detector.js`
  - Usage: analyse des profils ayant liké (détection d’influenceurs)

- GET /2/tweets/:id/retweeted_by
  - Méthode: `client.v2.tweetRetweetedBy(tweetId, options)`
  - Fichiers: `services/influencer-detector.js`
  - Usage: analyse des profils ayant retweeté (détection d’influenceurs)

## Endpoint v1 (twitter-api-v2 wrapper)

- POST media/upload (API v1.1)
  - Méthode: `client.v1.uploadMedia(buffer, { mimeType })`
  - Fichiers: `services/automation.js`
  - Usage: upload d’image pour attacher un média à un reply (ensuite POST /2/tweets)

## Notes d’implémentation

- Gestion d’erreurs et rate limiting: erreurs 403/429 traitées avec mute/backoff dans `services/automation.js` et `services/oauth2-manager.js`.
- Les objets réponse peuvent exposer `rateLimit` (si renseigné par twitter-api-v2) – utilisé pour monitoring.
- Authentification: OAuth2 (principal) avec refresh proactif (`services/oauth2-manager.js`), OAuth1 possible pour certains comptes legacy.

## Prochaines actions

- Mesurer les fréquences réelles par endpoint sur 15 min / 24 h via les logs (`scripts/analyze-raid-actions.js`).
- Définir un budget d’appels par compte et par endpoint (baseline + marge) en fonction des limites observées.
- Simuler un cycle multi-comptes (10 comptes x 50 cibles) pour valider la distribution des appels et les pauses.

Dernière mise à jour: automatique par outil d’analyse.
