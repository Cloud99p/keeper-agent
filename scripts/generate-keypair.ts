/**
 * Generate Solana Keypair
 * 
 * Usage:
 *   npx tsx scripts/generate-keypair.ts              # Generate devnet keypair
 *   npx tsx scripts/generate-keypair.ts mainnet      # Generate mainnet keypair
 *   npx tsx scripts/generate-keypair.ts ./custom.json  # Custom path
 */

import { Keypair } from '@solana/web3.js';
import { writeFileSync, existsSync } from 'fs';
import * as path from 'path';

const DEVNET_KEYPAIR_PATH = './keypairs/devnet.json';
const MAINNET_KEYPAIR_PATH = './keypairs/mainnet.json';

function main() {
  const args = process.argv.slice(2);
  let keypairPath: string;
  let network: 'devnet' | 'mainnet' = 'devnet';

  // Parse arguments
  if (args[0] === 'mainnet') {
    network = 'mainnet';
    keypairPath = MAINNET_KEYPAIR_PATH;
  } else if (args[0]?.startsWith('./') || args[0]?.startsWith('/')) {
    keypairPath = args[0];
  } else {
    keypairPath = DEVNET_KEYPAIR_PATH;
  }

  // Check if already exists
  if (existsSync(keypairPath)) {
    console.log(`⚠️  Keypair already exists: ${keypairPath}`);
    console.log('\n💡 To generate a new one, delete the existing file first:\n');
    console.log(`   rm ${keypairPath}\n`);
    console.log('Or specify a different path:\n');
    console.log(`   npx tsx scripts/generate-keypair.ts ./new-keypair.json\n`);
    process.exit(1);
  }

  // Generate new keypair
  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toString();
  const secretKey = Array.from(keypair.secretKey);

  // Ensure directory exists
  const dir = path.dirname(keypairPath);
  if (!existsSync(dir)) {
    console.log(`📁 Creating directory: ${dir}`);
    writeFileSync(path.join(dir, '.gitkeep'), '', { mode: 0o644 });
  }

  // Save keypair
  writeFileSync(keypairPath, JSON.stringify(secretKey), { mode: 0o600 });

  console.log('='.repeat(80));
  console.log('✅ KEYPAIR GENERATED');
  console.log('='.repeat(80));
  console.log(`\n📁 Saved to: ${keypairPath}`);
  console.log(`🔐 Permissions: 600 (owner read/write only)\n`);
  
  console.log('📍 Public Key (Address):');
  console.log(`   ${publicKey}\n`);

  // Copy to clipboard
  console.log('📋 Copy address:');
  if (process.platform === 'win32') {
    console.log(`   echo ${publicKey} | clip`);
  } else if (process.platform === 'darwin') {
    console.log(`   echo ${publicKey} | pbcopy`);
  } else {
    console.log(`   echo ${publicKey} | xclip -selection clipboard`);
  }
  console.log();

  // Funding instructions
  console.log('='.repeat(80));
  console.log('💸 FUND THIS ADDRESS');
  console.log('='.repeat(80));

  if (network === 'devnet') {
    console.log('\n✅ Devnet - FREE SOL:\n');
    console.log(`   1. Open: https://faucet.solana.com/`);
    console.log(`   2. Paste: ${publicKey}`);
    console.log(`   3. Click "Airdrop" (2 SOL)`);
    console.log(`   4. Wait ~30 seconds\n`);
    console.log('   CLI alternative:');
    console.log(`   solana airdrop 2 ${publicKey} --url devnet\n`);
  } else {
    console.log('\n⚠️  Mainnet - REAL SOL:\n');
    console.log(`   1. Transfer from exchange (Coinbase, Binance, etc.)`);
    console.log(`   2. Or from another Solana wallet`);
    console.log(`   3. Address: ${publicKey}\n`);
    console.log('   💡 Recommended: 0.5-1 SOL for testing\n');
    console.log('   ⚠️  WARNING: This is REAL money!\n');
  }

  // Next steps
  console.log('='.repeat(80));
  console.log('⚙️  NEXT STEPS');
  console.log('='.repeat(80));
  console.log('\n1. Fund the address above\n');
  console.log('2. Check balance:');
  console.log(`   npx tsx scripts/check-keypair.ts ${network}\n`);
  console.log('3. Update .env (if needed):');
  console.log(`   AUTH_KEYPAIR_PATH=${keypairPath}\n`);
  console.log('4. Run test:');
  console.log(`   npx tsx scripts/test-ai-stress.ts\n`);

  console.log('='.repeat(80));
  console.log('✅ Done!\n');
}

main();
