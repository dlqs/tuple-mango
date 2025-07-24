const crypto = require('crypto');
const fs = require('fs');

function encryptData(data, password) {
    // Generate a random IV
    const iv = crypto.randomBytes(16);
    
    // Create key from password using PBKDF2 (same as Web Crypto API)
    const salt = Buffer.from('flashcard-salt-2023', 'utf8');
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    
    // Create cipher using AES-256-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    // Encrypt the data
    let encrypted = cipher.update(data, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    // Get the authentication tag
    const authTag = cipher.getAuthTag();
    
    // Combine: IV (16 bytes) + encrypted data + auth tag (16 bytes)
    return Buffer.concat([iv, encrypted, authTag]);
}

function main() {
    const password = process.argv[2];
    
    if (!password) {
        console.error('❌ Usage: node encrypt-data.js <password>');
        process.exit(1);
    }
    
    try {
        // Read sample data
        const data = fs.readFileSync('sample-data.json', 'utf8');
        
        // Encrypt data
        const encrypted = encryptData(data, password);
        
        // Write encrypted data
        fs.writeFileSync('data.json.enc', encrypted);
        
        console.log('✅ Data encrypted successfully!');
        console.log(`📁 Encrypted file: data.json.enc`);
        console.log(`🔑 Password: ${password}`);
        console.log(`📊 Original size: ${data.length} bytes`);
        console.log(`📊 Encrypted size: ${encrypted.length} bytes`);
        console.log('🔒 Using AES-256-GCM encryption');
    } catch (error) {
        console.error('❌ Encryption failed:', error.message);
    }
}

main();