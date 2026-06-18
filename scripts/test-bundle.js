/**
 * Simple Test Bundle Script
 * Tests basic transaction submission with the fixed @solana/web3.js v1.87.6
 * 
 * Usage: node scripts/test-bundle.js
 */

import { Connection, Keypair, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('🧪 Solana Test Bundle\n');
  
  const rpcUrl = process.env.RPC_URL || 'https://api.devnet.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  
  // Load keypair
  const keypairPath = process.env.AUTH_KEYPAIR_PATH || 'keypairs/devnet.json';
  
  if (!fs.existsSync(keypairPath)) {
    console.error(`❌ Keypair not found at: ${keypairPath}`);
    console.error('Generate one with: node scripts/generate-keypair.js');
    process.exit(1);
  }
  
  const keyData = JSON.parse(fs.readFileSync(keypairPath));
  const keypair = Keypair.fromSecretKey(new Uint8Array(keyData));
  
  console.log('📤 Address:', keypair.publicKey.toString());
  
  // Check balance
  const balance = await connection.getBalance(keypair.publicKey);
  console.log('💰 Balance:', balance / 1e9, 'SOL\n');
  
  if (balance < 1e6) {
    console.log('⚠️  Low balance! Need at least 0.001 SOL');
    console.log('Devnet: Request airdrop with solana airdrop 15');
    console.log('Mainnet: Transfer SOL to this address');
    process.exit(1);
  }
  
  // Create simple transfer tx (to self - safest test)
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: keypair.publicKey,
      lamports: 1000000, // 0.001 SOL
    })
  );
  
  console.log('📦 Sending transaction...');
  const signature = await sendAndConfirmTransaction(connection, tx, [keypair]);
  console.log('✅ Success!');
  console.log('🔗 Signature:', signature);
  
  const cluster = rpcUrl.includes('mainnet') ? 'mainnet' : 
                  rpcUrl.includes('testnet') ? 'testnet' : 'devnet';
  console.log(`🌐 Explorer: https://explorer.solana.com/tx/${signature}?cluster=${cluster}`);
  
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
