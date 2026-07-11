/**
 * Test Bundle Submission — Local pipeline test
 * 
 * Tests the full bundle pipeline without needing Railway:
 * 1. Creates a real Solana transaction
 * 2. Serializes as base64 (as a user would send it)
 * 3. Mocks the submission flow
 * 
 * Run: node scripts/test-bundle.mjs
 */

import { Keypair, VersionedTransaction, TransactionMessage, SystemProgram } from '@solana/web3.js';
import bs58 from 'bs58';

// Create a throwaway keypair for the test
const kp = Keypair.generate();
console.log('Test payer:', kp.publicKey.toBase58());
console.log();

// Create a simple self-transfer transaction (transfer 0.001 SOL to self)
const tipAcct = Keypair.generate().publicKey; // dummy tip address for test format

const ix = SystemProgram.transfer({
  fromPubkey: kp.publicKey,
  toPubkey: kp.publicKey,
  lamports: 1000,
});

const msg = new TransactionMessage({
  payerKey: kp.publicKey,
  recentBlockhash: '11111111111111111111111111111111', // dummy blockhash for format test
  instructions: [ix],
}).compileToV0Message();

const tx = new VersionedTransaction(msg);
tx.sign([kp]);

// Serialize to base64 (this is what users send to the bundle endpoint)
const base64Tx = Buffer.from(tx.serialize()).toString('base64');
console.log('=== Base64 Transaction (user payload) ===');
console.log(base64Tx.substring(0, 80) + '...');
console.log('Length:', base64Tx.length, 'chars');
console.log();

// Now test deserialization (what the server does)
console.log('=== Deserialization Test ===');
try {
  const buf = Buffer.from(base64Tx, 'base64');
  const restored = VersionedTransaction.deserialize(buf);
  console.log('✅ VersionedTransaction.deserialize: OK');
  console.log('   Signatures:', restored.signatures.length);
  console.log('   Message instructions:', restored.message.compiledInstructions.length);
} catch (e) {
  console.log('❌ VersionedTransaction.deserialize failed:', e.message);
  // Test legacy fallback
  try {
    const { Transaction } = await import('@solana/web3.js');
    const buf = Buffer.from(base64Tx, 'base64');
    const legacyTx = Transaction.from(buf);
    console.log('✅ Legacy Transaction.from fallback: OK');
  } catch(e2) {
    console.log('❌ Legacy fallback also failed:', e2.message);
  }
}

console.log();
console.log('=== Railway Health Check ===');
const railwayUrl = 'https://workspaceapi-server-production-29ee.up.railway.app';

async function checkEndpoint(path) {
  try {
    const resp = await fetch(`${railwayUrl}${path}`, { signal: AbortSignal.timeout(5000) });
    const data = await resp.text();
    return { status: resp.status, body: data.substring(0, 200) };
  } catch (e) {
    return { status: 'ERROR', body: e.message };
  }
}

const health = await checkEndpoint('/api/v1/health');
console.log(`Health (${health.status}):`, health.body.substring(0, 100));

if (health.status === 200) {
  console.log();
  console.log('=== Bundle Submission Test ===');
  const bundlePayload = {
    transactions: [base64Tx],
    tipLamports: 1000,
  };

  try {
    const resp = await fetch(`${railwayUrl}/api/v1/bundle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bundlePayload),
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json();
    console.log('Bundle response:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.log('Bundle submission error:', e.message);
    console.log('(Expected if Railway is still deploying)');
  }
} else {
  console.log('⏳ Railway not ready yet — service is restarting');
  console.log('   Try again in 1-2 minutes after deploy completes');
}

console.log();
console.log('=== Summary ===');
if (health.status === 200) {
  console.log('✅ Railway: LIVE — pipeline ready for bundle test');
} else {
  console.log('🟡 Railway: restarting (expected after push)');
  console.log('   Run again in a minute to test bundles');
}
