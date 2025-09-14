const bcrypt = require('bcryptjs');

async function generateHash() {
    const password = 'demo123';
    const hash = await bcrypt.hash(password, 12);
    console.log('Password:', password);
    console.log('New hash:', hash);
    
    // Test the hash
    const isValid = await bcrypt.compare(password, hash);
    console.log('Hash validation:', isValid);
    
    // Test against current hash
    const currentHash = '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';
    const isCurrentValid = await bcrypt.compare(password, currentHash);
    console.log('Current hash validation:', isCurrentValid);
}

generateHash().catch(console.error);
