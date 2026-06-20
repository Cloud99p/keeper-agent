/**
 * Simple Mainnet Transaction Submitter
 * 
 * Sends 10 real transactions to Solana mainnet.
 * No Jito bundles - just direct RPC submission for bounty evidence.
 */

import { Connection, Keypair, SystemProgram, LAMPORTS_PER_SOL, PublicKey, sendAndConfirmTransaction, Transaction } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';

const TX_COUNT = 10;
const TIP_LAMPORTS = 3000; // 3,000 lamports per tx

async function main() {
  console.log('='.repeat(80));
  console.log('🚀 SOLANA MAINNET TRANSACTION TEST');
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
    console.error('❌ Need at least 0.01 SOL');
    process.exit(1);
  }

  // Jito tip account (mainnet)
  const TIP_ACCOUNT = new PublicKey('96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5');
  
  const transactions: any[] = [];

  console.log(`🎯 Sending ${TX_COUNT} transactions to mainnet...`);
  console.log();

  for (let i = 0; i < TX_COUNT; i++) {
    console.log(`--- Transaction ${i + 1}/${TX_COUNT} ---`);
    
    try {
      // Get slot and blockhash
      const slot = await connection.getSlot();
      const { blockhash } = await connection.getLatestBlockhash();
      
      // Create transaction (tip to Jito account)
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: TIP_ACCOUNT,
          lamports: TIP_LAMPORTS,
        })
      );

      transaction.recentBlockhash = blockhash;
      transaction.feePayer = keypair.publicKey;

      // Send and confirm
      console.log(`📤 Sending transaction...`);
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [keypair],
        {
          commitment: 'confirmed',
          skipPreflight: true,
        }
      );

      console.log(`✅ Confirmed: ${signature}`);
      console.log(`   Slot: ${slot}`);
      console.log(`   Tip: ${TIP_LAMPORTS} lamports`);

      transactions.push({
        signature,
        slot,
        tipLamports: TIP_LAMPORTS,
        timestamp: Date.now(),
        status: 'confirmed',
      });

      console.log(`   Explorer: https://explorer.solana.com/tx/${signature}`);
      console.log();

      // Wait 15 seconds between transactions
      if (i < TX_COUNT - 1) {
        console.log(`⏳ Waiting 15s...`);
        await new Promise(resolve => setTimeout(resolve, 15000));
      }

    } catch (error: any) {
      console.error(`❌ Failed:`, error.message);
      transactions.push({
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
    testType: 'mainnet_transaction_test',
    keypair: keypair.publicKey.toString(),
    network: 'mainnet-beta',
    timestamp: Date.now(),
    transactions,
    summary: {
      total: transactions.length,
      confirmed: transactions.filter(t => t.status === 'confirmed').length,
      failed: transactions.filter(t => t.status === 'failed').length,
      totalTipsLamports: transactions.reduce((sum, t) => sum + (t.tipLamports || 0), 0),
    },
  };

  fs.mkdirSync('evidence', { recursive: true });
  const filename = `evidence/mainnet_tx_${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(results, null, 2));
  
  console.log('='.repeat(80));
  console.log('📊 RESULTS');
  console.log('='.repeat(80));
  console.log(`Confirmed: ${results.summary.confirmed}/${TX_COUNT}`);
  console.log(`Failed: ${results.summary.failed}/${TX_COUNT}`);
  console.log(`Total Tips: ${(results.summary.totalTipsLamports / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log(`Evidence: ${filename}`);
  console.log();
  console.log('✅ BOUNTY EVIDENCE READY!');
  console.log();
  console.log('Verify transactions on Solana Explorer:');
  transactions.filter(t => t.status === 'confirmed').forEach(t => {
    console.log(`  https://explorer.solana.com/tx/${t.signature}`);
  });
}

main().catch(console.error);
