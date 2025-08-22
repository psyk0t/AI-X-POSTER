// Test script pour vérifier le système de persistance des actions
const fs = require('fs');
const path = require('path');

const ACTIONS_DB_FILE = path.join(__dirname, 'performed-actions.json');

// Simuler quelques actions pour tester
const testActions = [
    { tweetId: '1234567890', accountId: 'acc1', actionType: 'like' },
    { tweetId: '1234567890', accountId: 'acc2', actionType: 'like' },
    { tweetId: '1234567891', accountId: 'acc1', actionType: 'retweet' },
    { tweetId: '1234567892', accountId: 'acc1', actionType: 'reply' },
];

// Structure: { tweetId: { accountId: { like: timestamp, retweet: timestamp, reply: timestamp } } }
let performedActionsDB = {};

// Charger la base de données des actions depuis le fichier
function loadPerformedActions() {
    try {
        if (fs.existsSync(ACTIONS_DB_FILE)) {
            const data = fs.readFileSync(ACTIONS_DB_FILE, 'utf-8');
            performedActionsDB = JSON.parse(data);
            console.log(`✅ Loaded ${Object.keys(performedActionsDB).length} tracked tweets from database`);
        } else {
            performedActionsDB = {};
            console.log('ℹ️  No existing database found, starting fresh');
        }
    } catch (error) {
        console.error('❌ Error loading database:', error.message);
        performedActionsDB = {};
    }
}

// Sauvegarder la base de données des actions dans le fichier
function savePerformedActions() {
    try {
        fs.writeFileSync(ACTIONS_DB_FILE, JSON.stringify(performedActionsDB, null, 2));
        console.log('✅ Database saved successfully');
    } catch (error) {
        console.error('❌ Error saving database:', error.message);
    }
}

// Vérifier si une action a déjà été effectuée
function hasActionBeenPerformed(tweetId, accountId, actionType) {
    return performedActionsDB[tweetId] && 
           performedActionsDB[tweetId][accountId] && 
           performedActionsDB[tweetId][accountId][actionType];
}

// Marquer une action comme effectuée
function markActionAsPerformed(tweetId, accountId, actionType) {
    if (!performedActionsDB[tweetId]) {
        performedActionsDB[tweetId] = {};
    }
    if (!performedActionsDB[tweetId][accountId]) {
        performedActionsDB[tweetId][accountId] = {};
    }
    performedActionsDB[tweetId][accountId][actionType] = Date.now();
    savePerformedActions();
    console.log(`✅ Marked ${actionType} on tweet ${tweetId} by account ${accountId}`);
}

// Test principal
function runTests() {
    console.log('🚀 Testing persistent action tracking system...\n');
    
    // Charger la base existante
    loadPerformedActions();
    
    // Test 1: Marquer quelques actions
    console.log('📝 Test 1: Marking actions as performed');
    testActions.forEach(action => {
        const { tweetId, accountId, actionType } = action;
        
        if (hasActionBeenPerformed(tweetId, accountId, actionType)) {
            console.log(`⚠️  Action ${actionType} on tweet ${tweetId} by ${accountId} already performed`);
        } else {
            markActionAsPerformed(tweetId, accountId, actionType);
        }
    });
    
    console.log('\n📊 Current database state:');
    console.log(JSON.stringify(performedActionsDB, null, 2));
    
    // Test 2: Vérifier les doublons
    console.log('\n🔍 Test 2: Checking for duplicates');
    testActions.forEach(action => {
        const { tweetId, accountId, actionType } = action;
        const alreadyPerformed = hasActionBeenPerformed(tweetId, accountId, actionType);
        console.log(`${alreadyPerformed ? '✅' : '❌'} ${actionType} on tweet ${tweetId} by ${accountId}: ${alreadyPerformed ? 'ALREADY PERFORMED' : 'NOT PERFORMED'}`);
    });
    
    // Test 3: Statistiques
    console.log('\n📈 Test 3: Database statistics');
    const totalTweets = Object.keys(performedActionsDB).length;
    let totalActions = 0;
    
    for (const tweetId in performedActionsDB) {
        for (const accountId in performedActionsDB[tweetId]) {
            totalActions += Object.keys(performedActionsDB[tweetId][accountId]).length;
        }
    }
    
    console.log(`📊 Total tracked tweets: ${totalTweets}`);
    console.log(`📊 Total tracked actions: ${totalActions}`);
    
    console.log('\n✅ All tests completed successfully!');
    console.log(`💾 Database saved to: ${ACTIONS_DB_FILE}`);
}

// Exécuter les tests
runTests();
