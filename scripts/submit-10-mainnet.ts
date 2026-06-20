/**
 * Simple Mainnet Bundle Submitter
 * 
 * Submits exactly 10 bundles to Jito mainnet.
 * No monitoring, no opportunity detection - just direct submission.
 */

import { Connection, Keypair, SystemProgram, Transaction, VersionedTransaction, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';

const BUNDLE_COUNT = 10;
const TIP_LAMPORTS = 3000; // 3,000 lamports per bundle

async function main() {
  console.log('='.repeat(80));
  console.log('🚀 SIMPLE MAINNET BUNDLE SUBMITTER');
  console.log('='.repeat(80));
  console.log();

  // Load mainnet keypair
  const keypairPath = path.join(process.cwd(), 'keypairs', 'mainnet.json');
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  
  console.log(`✅ Keypair: ${keypair.publicKey.toString()}`);

  // Connect to mainnet
  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const balance = await connection.getBalance(keypair.publicKey);
  console.log(`💰 Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  console.log();

  if (balance < 0.01 * LAMPORTS_PER_SOL) {
    console.error('❌ Need at least 0.01 SOL for tips + fees');
    process.exit(1);
  }

  // Jito tip account (mainnet)
  const TIP_ACCOUNT = new PublicKey('96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5');
  
  const bundles: any[] = [];

  console.log(`🎯 Submitting ${BUNDLE_COUNT} bundles to Jito mainnet...`);
  console.log();

  for (let i = 0; i < BUNDLE_COUNT; i++) {
    console.log(`--- Bundle ${i + 1}/${BUNDLE_COUNT} ---`);
    
    try {
      // Get slot and blockhash
      const slot = await connection.getSlot();
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      
      // Create transaction (tip to Jito + memo to self)
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: TIP_ACCOUNT,
          lamports: TIP_LAMPORTS,
        })
      );

      transaction.recentBlockhash = blockhash;
      transaction.feePayer = keypair.publicKey;
      transaction.sign(keypair);

      // Convert to versioned transaction
      const versionedTx = new VersionedTransaction(transaction.message);

      // Send transaction directly to Jito via RPC
      const signature = await connection.sendTransaction(versionedTx, {
        skipPreflight: true,
        maxRetries: 0,
      });

      console.log(`✅ Sent: ${signature}`);
      console.log(`   Slot: ${slot}`);
      console.log(`   Tip: ${TIP_LAMPORTS} lamports`);

      bundles.push({
        signature,
        slot,
        tipLamports: TIP_LAMPORTS,
        timestamp: Date.now(),
        status: 'sent',
      });

      console.log();

      // Wait 20 seconds between bundles
      if (i < BUNDLE_COUNT - 1) {
        console.log(`⏳ Waiting 20s...`);
        await new Promise(resolve => setTimeout(resolve, 20000));
      }

    } catch (error: any) {
      console.error(`❌ Failed:`, error.message);
      bundles.push({
        slot: 0,
        tipLamports: 0,
        timestamp: Date.now(),
        status: 'failed',
        error: error.message,
      });
      console.log();
    }
  }

  // Save results
  const results = {
    testType: 'simple_mainnet_submission',
    keypair: keypair.publicKey.toString(),
    network: 'mainnet-beta',
    timestamp: Date.now(),
    bundles,
    summary: {
      total: bundles.length,
      sent: bundles.filter(b => b.status === 'sent').length,
      failed: bundles.filter(b => b.status === 'failed').length,
    },
  };

  fs.mkdirSync('evidence', { recursive: true });
  const filename = `evidence/simple_mainnet_${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(results, null, 2));
  
  console.log('='.repeat(80));
  console.log('📊 RESULTS');
  console.log('='.repeat(80));
  console.log(`Sent: ${results.summary.sent}/${BUNDLE_COUNT}`);
  console.log(`Evidence: ${filename}`);
  console.log();
  console.log('Verify on Solana Explorer:');
  bundles.filter(b => b.status === 'sent').forEach(b => {
    console.log(`  https://explorer.solana.com/tx/${b.signature}`);
  });
}

main().catch(console.error);
