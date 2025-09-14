// Test ultra-simple
console.log('Test 1: Node.js fonctionne');

try {
    console.log('Test 2: Chargement dotenv...');
    require('dotenv').config();
    console.log('✅ dotenv OK');
} catch (e) {
    console.error('❌ dotenv:', e.message);
    process.exit(1);
}

try {
    console.log('Test 3: Chargement express...');
    const express = require('express');
    console.log('✅ express OK');
} catch (e) {
    console.error('❌ express:', e.message);
    process.exit(1);
}

console.log('✅ Tous les tests de base passent');
