/**
 * Keypair Utility - Check Address & Fund Instructions
 * 
 * Usage:
 *   npx tsx scripts/check-keypair.ts              # Check devnet keypair
 *   npx tsx scripts/check-keypair.ts mainnet      # Check mainnet keypair
 *   npx tsx scripts/check-keypair.ts ./path/to/keypair.json  # Custom path
 */

import { Keypair, PublicKey, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import * as path from 'path';

// Configuration
const DEVNET_KEYPAIR_PATH = './keypairs/devnet.json';
const MAINNET_KEYPAIR_PATH = './keypairs/mainnet.json';
const DEFAULT_KEYPAIR_PATH = './keypair.json';

// RPC URLs
const RPC_URLS = {
  mainnet: 'https://api.mainnet-beta.solana.com',
  devnet: 'https://api.devnet.solana.com',
  testnet: 'https://api.testnet.solana.com',
};

function loadKeypair(keypairPath: string): Keypair {
  if (!existsSync(keypairPath)) {
    console.error(`❌ Keypair not found: ${keypairPath}`);
    console.log('\n💡 Generate a new keypair first:');
    console.log(`   npx tsx scripts/generate-keypair.ts ${keypairPath}\n`);
    process.exit(1);
  }

  const secretKey = JSON.parse(readFileSync(keypairPath, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

async function checkBalance(publicKey: PublicKey, rpcUrl: string): Promise<number> {
  try {
    const connection = new Connection(rpcUrl, 'confirmed');
    const balance = await connection.getBalance(publicKey);
    return balance / LAMPORTS_PER_SOL;
  } catch (error: any) {
    console.error(`⚠️  Failed to fetch balance: ${error.message}`);
    return -1;
  }
}

async function main() {
  const args = process.argv.slice(2);
  let keypairPath: string;
  let network: 'mainnet' | 'devnet' | 'testnet' = 'devnet';

  // Parse arguments
  if (args[0] === 'mainnet') {
    network = 'mainnet';
    keypairPath = MAINNET_KEYPAIR_PATH;
  } else if (args[0] === 'testnet') {
    network = 'testnet';
    keypairPath = DEFAULT_KEYPAIR_PATH;
  } else if (args[0]?.startsWith('./') || args[0]?.startsWith('/')) {
    keypairPath = args[0];
  } else if (args[0]) {
    keypairPath = args[0];
  } else {
    keypairPath = DEVNET_KEYPAIR_PATH;
  }

  console.log('='.repeat(80));
  console.log('🔑 SOLANA KEYPAIR CHECKER');
  console.log('='.repeat(80));
  console.log(`\n📁 Keypair Path: ${keypairPath}`);
  console.log(`🌐 Network: ${network.toUpperCase()}`);
  console.log(`📡 RPC: ${RPC_URLS[network]}\n`);

  // Load keypair
  const keypair = loadKeypair(keypairPath);
  const publicKey = keypair.publicKey.toString();

  console.log('📍 Public Key (Address):');
  console.log(`   ${publicKey}\n`);

  // Copy to clipboard instructions
  console.log('📋 Copy address:');
  if (process.platform === 'win32') {
    console.log(`   echo ${publicKey} | clip`);
  } else if (process.platform === 'darwin') {
    console.log(`   echo ${publicKey} | pbcopy`);
  } else {
    console.log(`   echo ${publicKey} | xclip -selection clipboard`);
  }
  console.log();

  // Check balance
  console.log('💰 Checking balance...');
  const balance = await checkBalance(keypair.publicKey, RPC_URLS[network]);
  
  if (balance >= 0) {
    console.log(`   Balance: ${balance.toFixed(4)} SOL\n`);
    
    if (balance < 0.1 && network === 'devnet') {
      console.log('⚠️  LOW BALANCE - Fund at:');
      console.log(`   https://faucet.solana.com/\n`);
    } else if (balance < 0.5 && network === 'mainnet') {
      console.log('⚠️  LOW BALANCE for mainnet testing (need ~0.5 SOL for tips)\n');
    }
  }

  // Funding instructions
  console.log('='.repeat(80));
  console.log('💸 FUNDING INSTRUCTIONS');
  console.log('='.repeat(80));

  if (network === 'devnet') {
    console.log('\n✅ Devnet - FREE SOL from faucet:\n');
    console.log(`   1. Open: https://faucet.solana.com/`);
    console.log(`   2. Paste address: ${publicKey}`);
    console.log(`   3. Click "Airdrop"`);
    console.log(`   4. Wait ~30 seconds\n`);
    console.log('   Or use CLI:');
    console.log(`   solana airdrop 2 ${publicKey} --url devnet\n`);
  } else if (network === 'mainnet') {
    console.log('\n⚠️  Mainnet - REAL SOL required:\n');
    console.log(`   1. Transfer from exchange (Coinbase, Binance, etc.)`);
    console.log(`   2. Or from another Solana wallet`);
    console.log(`   3. Address: ${publicKey}\n`);
    console.log('   💡 Recommended: Start with 0.5-1 SOL for testing\n');
    console.log('   ⚠️  WARNING: This is REAL money on mainnet!\n');
  }

  // Configuration for solana-tx-stack
  console.log('='.repeat(80));
  console.log('⚙️  CONFIGURE SOLANA-TX-STACK');
  console.log('='.repeat(80));
  console.log('\n📝 Update .env file:\n');
  console.log(`   # For ${network.toUpperCase()} testing`);
  console.log(`   RPC_URL=${RPC_URLS[network]}`);
  console.log(`   SOLANA_CLUSTER=${network}`);
  console.log(`   AUTH_KEYPAIR_PATH=${keypairPath}\n`);

  if (network === 'mainnet') {
    console.log('\n⚠️  MAINNET MODE - Jito requires real SOL for tips:\n');
    console.log('   - Each bundle tip: 2,000-10,000 lamports (0.000002-0.00001 SOL)');
    console.log('   - Expected spend: 0.1-0.5 SOL for stress testing');
    console.log('   - Start with devnet first to test!\n');
  }

  // Quick test command
  console.log('='.repeat(80));
  console.log('🧪 QUICK TEST');
  console.log('='.repeat(80));
  console.log('\nAfter funding, run:\n');
  console.log(`   npx tsx scripts/test-ai-stress.ts\n`);
  console.log('Or for large scale test:\n');
  console.log(`   npx tsx scripts/test-ai-stress-large.ts\n`);

  console.log('='.repeat(80));
  console.log('✅ Done!\n');
}

main().catch(console.error);
