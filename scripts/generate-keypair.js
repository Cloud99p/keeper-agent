/**
 * Generate a new Solana keypair and save it
 * Usage: node scripts/generate-keypair.js
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Keypair } from '@solana/web3.js';

// Create config directory
const configDir = path.join(os.homedir(), '.config', 'solana');
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
  console.log('Created directory:', configDir);
}

// Generate new keypair
const keypair = Keypair.generate();
const publicKey = keypair.publicKey.toString();
const secretKey = Array.from(keypair.secretKey);

// Save keypair
const keypairPath = path.join(configDir, 'devnet.json');
fs.writeFileSync(keypairPath, JSON.stringify(secretKey));
fs.chmodSync(keypairPath, 0o600); // Secure permissions

console.log('\n✅ Keypair generated successfully!\n');
console.log('Public Key:', publicKey);
console.log('Saved to:', keypairPath);
console.log('\n⚠️  IMPORTANT: Fund this address with devnet SOL:');
console.log('https://faucet.solana.com/\n');
console.log('Or use CLI if available:');
console.log(`solana airdrop 2 ${publicKey} --url devnet\n`);
