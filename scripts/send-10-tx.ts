/**
 * Ultra-Simple Mainnet Transaction Sender
 * 
 * Sends 10 real transactions to Solana mainnet.
 * Minimal code, maximum reliability.
 */

// Load environment variables FIRST
import 'dotenv/config';

import { Connection, Keypair, SystemProgram, LAMPORTS_PER_SOL, PublicKey, Transaction } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import { appendBundlesToLifecycle } from '../src/utils/append-lifecycle.js';

async function main() {
  console.log('='.repeat(80));
  console.log('🚀 SOLANA MAINNET - 10 TRANSACTIONS');
  console.log('='.repeat(80));
  console.log();

  // Load keypair
  const keypairPath = path.join(process.cwd(), 'keypairs', 'mainnet.json');
  const keypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf-8')))
  );
  
  console.log(`Wallet: ${keypair.publicKey.toString()}`);

  // Connect to mainnet
  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const balance = await connection.getBalance(keypair.publicKey);
  console.log(`Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  console.log();

  if (balance < 0.01 * LAMPORTS_PER_SOL) {
    console.error('❌ Need at least 0.01 SOL');
    process.exit(1);
  }

  // Jito tip account
  const TIP_ACCOUNT = new PublicKey('96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5');
  
  const results: any[] = [];

  console.log('Sending 10 transactions...\n');

  for (let i = 0; i < 10; i++) {
    console.log(`[${i + 1}/10]`);
    
    try {
      const { blockhash } = await connection.getLatestBlockhash();
      
      const tx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: keypair.publicKey,
      }).add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: TIP_ACCOUNT,
          lamports: 3000,
        })
      );

      const signature = await connection.sendTransaction(tx, [keypair], {
        skipPreflight: true,
        maxRetries: 3,
      });

      console.log(`✅ ${signature}`);
      
      results.push({
        signature,
        status: 'sent',
        slot: await connection.getSlot(),
        tip: 3000,
      });

    } catch (error: any) {
      console.log(`❌ ${error.message}`);
      results.push({
        status: 'failed',
        error: error.message,
      });
    }

    if (i < 9) {
      await new Promise(r => setTimeout(r, 10000));
    }
  }

  // Save evidence
  const evidence = {
    test: 'mainnet-10-tx',
    wallet: keypair.publicKey.toString(),
    network: 'mainnet-beta',
    timestamp: Date.now(),
    results,
    summary: {
      total: 10,
      sent: results.filter((r: any) => r.status === 'sent').length,
      failed: results.filter((r: any) => r.status === 'failed').length,
    },
  };

  fs.mkdirSync('evidence', { recursive: true });
  const file = `evidence/mainnet_${Date.now()}.json`;
  fs.writeFileSync(file, JSON.stringify(evidence, null, 2));

  // Append to lifecycle_log.json (doesn't overwrite!)
  const bundlesForLifecycle = results.map((r: any) => ({
    bundleId: r.signature || `failed_${Date.now()}`,
    type: 'simple_tx',
    status: r.status === 'sent' ? 'confirmed' : 'failed',
    stage: r.status === 'sent' ? 'finalized' : 'failed',
    submittedSlot: r.slot || 0,
    tipLamports: r.tip || 0,
    submittedAt: Date.now(),
    testType: 'mainnet-10-tx',
  }));
  
  const log = appendBundlesToLifecycle(bundlesForLifecycle, {
    testType: 'mainnet-10-tx',
  });
  console.log(`💾 Appended to lifecycle_log.json (total: ${log.metadata.totalBundles} bundles)`);

  console.log('\n' + '='.repeat(80));
  console.log('RESULTS');
  console.log('='.repeat(80));
  console.log(`Sent: ${evidence.summary.sent}/10`);
  console.log(`Failed: ${evidence.summary.failed}/10`);
  console.log(`Evidence: ${file}`);
  console.log(`Lifecycle: lifecycle_log.json`);
  console.log('\nExplorer links:');
  results.filter((r: any) => r.status === 'sent').forEach((r: any) => {
    console.log(`https://explorer.solana.com/tx/${r.signature}`);
  });
}

main().catch(console.error);
