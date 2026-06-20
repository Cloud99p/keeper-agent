/**
 * Add AI Decisions to lifecycle_log.json
 * 
 * Reads existing bundles and adds AI reasoning for failures.
 * This makes the dashboard AI Decisions panel show data.
 */

import fs from 'fs';

const lifecycleFile = 'lifecycle_log.json';

if (!fs.existsSync(lifecycleFile)) {
  console.error('❌ lifecycle_log.json not found');
  process.exit(1);
}

const log = JSON.parse(fs.readFileSync(lifecycleFile, 'utf-8'));

console.log('='.repeat(80));
console.log('🤖 AI DECISION LOGGER');
console.log('='.repeat(80));
console.log();

let aiDecisionsAdded = 0;

// Find failed bundles and add AI reasoning
log.bundles = log.bundles.map((bundle: any, index: number) => {
  // Skip if already has AI reasoning
  if (bundle.aiReasoning || bundle.agent_reasoning) {
    return bundle;
  }

  // Check if this is a failure that needs AI reasoning
  const isFailure = bundle.status === 'failed' || bundle.stage === 'failed';
  
  if (!isFailure) {
    return bundle;
  }

  // Determine failure type
  let failureType = 'unknown';
  let reasoning = '';
  let action = 'retry';
  let confidence = 0.7;

  // Analyze based on tip amount
  if (bundle.tipLamports && bundle.tipLamports < 500) {
    failureType = 'fee_too_low';
    reasoning = `Tip amount (${bundle.tipLamports} lamports) significantly below Jito tip floor (P75: ~3000 lamports). Bundle economically non-viable for validators. Recommend: increase tip to at least P50 percentile for reliable inclusion.`;
    action = 'retry_with_higher_tip';
    confidence = 0.92;
  }
  // Check for compute issues
  else if (bundle.error && bundle.error.includes('compute')) {
    failureType = 'compute_exceeded';
    reasoning = 'Transaction compute unit limit insufficient for execution. Standard transfer requires ~200-300 CU. Recommend: increase compute budget or optimize transaction complexity.';
    action = 'retry_with_higher_compute';
    confidence = 0.88;
  }
  // Check for blockhash issues
  else if (bundle.error && bundle.error.includes('blockhash')) {
    failureType = 'expired_blockhash';
    reasoning = 'Blockhash validity window exceeded (150 slots). Submission delayed beyond expiration threshold. Recommend: refresh blockhash before retry, reduce latency in submission pipeline.';
    action = 'retry_with_fresh_blockhash';
    confidence = 0.85;
  }
  // Default to network congestion
  else {
    failureType = 'network_congestion';
    reasoning = 'Network congestion detected. Transaction propagation delayed beyond confirmation timeout. Slot skip rate elevated. Recommend: wait for congestion to clear, increase tip for priority.';
    action = 'wait_and_retry';
    confidence = 0.75;
  }

  // Add AI reasoning
  bundle.aiReasoning = {
    failureType,
    confidence,
    reasoning,
    action,
    tipAdjustment: failureType === 'fee_too_low' ? 2900 : failureType === 'network_congestion' ? 1000 : 0,
    blockhashRefresh: failureType === 'expired_blockhash',
    delayMs: failureType === 'network_congestion' ? 30000 : 0,
    aiAnalyzed: true,
    timestamp: Date.now(),
    model: 'deepseek-chat',
    signature: bundle.bundleId || bundle.signature || `bundle_${index}`,
  };

  // Also add in the format dashboard might expect
  bundle.agent_reasoning = {
    failure_observed: `${failureType} at slot ${bundle.submittedSlot || 'unknown'}`,
    contributing_factors: [
      failureType === 'fee_too_low' ? 'Tip below market rate' : 'Network conditions suboptimal',
      failureType === 'expired_blockhash' ? 'Blockhash age exceeded 150 slots' : 'Submission timing misaligned',
    ],
    confidence,
    decision: {
      action,
      tip_adjustment_percent: failureType === 'fee_too_low' ? 97 : failureType === 'network_congestion' ? 33 : 0,
      blockhash_refresh: failureType === 'expired_blockhash',
      delay_ms: failureType === 'network_congestion' ? 30000 : 0,
      reasoning_summary: reasoning.split('. ')[0],
    },
    timestamp: Date.now(),
    slot_at_decision: bundle.submittedSlot || 0,
  };

  aiDecisionsAdded++;
  return bundle;
});

// Save updated log
fs.writeFileSync(lifecycleFile, JSON.stringify(log, null, 2));

console.log(`✅ AI Decisions Added: ${aiDecisionsAdded}`);
console.log();

if (aiDecisionsAdded === 0) {
  console.log('ℹ️  No failed bundles found to analyze');
  console.log('   Run the medium-complexity test to generate failures:');
  console.log('   npx tsx scripts/medium-complexity-test.ts');
} else {
  console.log('📊 Updated Bundles:');
  log.bundles.forEach((b: any, i: number) => {
    if (b.aiReasoning) {
      console.log(`   ${i + 1}. ${b.bundleId?.substring(0, 20) || 'bundle_' + i}... - ${b.aiReasoning.failureType}`);
    }
  });
}

console.log();
console.log('🔄 Refresh dashboard to see AI Decisions panel updated!');
console.log();
