/**
 * Solana Transaction Stack - Main Entry Point (Full Stack)
 * 
 * Initializes all stack components: Jito, Hebbian, Proof Chain,
 * Knowledge Graph, Network Health, Fault Injection, DeepSeek AI
 */

import dotenv from 'dotenv';
dotenv.config();

import { Connection, clusterApiUrl, PublicKey, VersionedTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

// ===== Stack Imports =====
import { JitoManager } from './jito-manager.js';
import { YellowstoneService } from './yellowstone.js';
import { TxBuilder } from './tx-builder.js';
import { HebbianTipOptimizer } from './hebbian-optimizer.js';
import { FailureReasoningAgent, RetryParameters, NetworkHealthContext } from './ai-agent.js';
import { loadConfig } from './config.js';
import { LifecycleTracker, FailureContext, FailureType, BundleStage } from './lifecycle.js';
import { DecisionProofChain } from './proof-chain.js';
import { TransactionKnowledgeGraph } from './knowledge-graph.js';
import { NetworkHealthCalculator } from './network-health.js';
import { FaultInjector, FaultType } from './fault-injector.js';
import { DeepSeekClient } from './deepseek-client.js';
import { getTipOracle, getMarketContext } from './tip-oracle.js';
import { getWebhookManager } from './webhooks.js';

// ===== Configuration =====
const RPC_URL = process.env.RPC_URL || clusterApiUrl('mainnet-beta');
const SOLANA_COMMITMENT = (process.env.SOLANA_COMMITMENT || 'confirmed') as any;
const AGENT_ID = process.env.AGENT_ID || '3325';
const AGENT_NAME = process.env.AGENT_NAME || 'Solana MEV Agent';
const AGENT_VERSION = process.env.AGENT_VERSION || '3.0.0-full-stack';
const DEBUG = process.env.DEBUG === 'true';
const JITO_TIP_LAMPORTS = parseInt(process.env.JITO_TIP_LAMPORTS || '3000');
const MONITOR_INTERVAL_MS = parseInt(process.env.MONITOR_INTERVAL_MS || '10000');

// ===== Global State =====
const connection = new Connection(RPC_URL, { commitment: SOLANA_COMMITMENT });

let jitoManager: JitoManager | null = null;
let hebbianOptimizer: HebbianTipOptimizer | null = null;
let failureAgent: FailureReasoningAgent | null = null;
let deepSeekClient: DeepSeekClient | null = null;
let proofChain: DecisionProofChain | null = null;
let knowledgeGraph: TransactionKnowledgeGraph | null = null;
let networkHealth: NetworkHealthCalculator | null = null;
let faultInjector: FaultInjector | null = null;
let lifecycleTracker: LifecycleTracker | null = null;
let geyserClient: YellowstoneService | null = null;
let txBuilder: TxBuilder | null = null;

let jitoReady = false;
let serverStartTime = Date.now();
let bundleCount = 0;
let bundleSuccessCount = 0;
let bundleFailCount = 0;

const tipOracle = getTipOracle();
const webhookManager = getWebhookManager();

function log(msg: string) { console.log(`[INDEX] ${msg}`); }
function warn(msg: string) { console.warn(`[INDEX] ${msg}`); }
function err(msg: string) { console.error(`[INDEX] ${msg}`); }

// ===== Initialization =====

async function initializeStack(): Promise<void> {
  log('Initializing solana-tx-stack full stack...');

  // 1. Hebbian optimizer (tip learning)
  hebbianOptimizer = new HebbianTipOptimizer();
  log('HebbianTipOptimizer initialized');

  // 2. Config (needed by downstream components)
  const config = loadConfig();
  log('Configuration loaded');

  // 3. Proof chain (cryptographic audit trail)
  proofChain = new DecisionProofChain();
  log('DecisionProofChain initialized');

  // 4. Knowledge graph (pattern learning)
  knowledgeGraph = new TransactionKnowledgeGraph();
  log('TransactionKnowledgeGraph initialized');

  // 5. Network health
  networkHealth = new NetworkHealthCalculator(connection);
  log('NetworkHealthCalculator initialized');

  // 6. Fault injector (for testing resilience)
  faultInjector = new FaultInjector(connection);
  log('FaultInjector initialized');

  // 7. Lifecycle tracker
  lifecycleTracker = new LifecycleTracker(config);
  log('LifecycleTracker initialized');

  // 8. DeepSeek AI client
  deepSeekClient = new DeepSeekClient(config);
  if (deepSeekClient.isEnabled()) {
    log('DeepSeek AI enabled');
  } else {
    warn('DeepSeek AI not configured — falling back to local reasoning');
  }

  // 9. FailureReasoningAgent (wraps DeepSeek)
  failureAgent = new FailureReasoningAgent(config);
  log('FailureReasoningAgent initialized');

  // 10. Jito manager
  try {
    jitoManager = new JitoManager(connection);
    await jitoManager.initialize();
    jitoReady = true;
    log('JitoManager initialized — LIVE');
  } catch (e: any) {
    warn(`Jito initialization failed (non-fatal): ${e.message}`);
    jitoReady = false;
  }

  // 11. Yellowstone gRPC service (real-time slot/account streaming)
  try {
    geyserClient = new YellowstoneService(config);
    await geyserClient.initialize();
    log('Yellowstone gRPC connected');
  } catch (e: any) {
    warn(`Yellowstone gRPC connection failed: ${e.message}`);
  }

  // 12. Tx builder
  txBuilder = new TxBuilder(connection);
  log('TxBuilder initialized');

  log('Full stack initialization complete');
}

// ===== Monitoring Loop =====

async function checkOpportunities(): Promise<void> {
  try {
    const slot = await connection.getSlot();

    if (jitoReady && jitoManager) {
      const tipAccount = await jitoManager.getNextTipAccount();
      const balance = await connection.getBalance(tipAccount || PublicKey.default);

      log(`[Slot ${slot}] Jito tip account: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

      // Hebbian periodic learning
      if (hebbianOptimizer) {
        const health = networkHealth
          ? (await networkHealth.calculateHealth().catch(() => ({ score: 70, skipRate: 0.15, leaderQuality: 0.8 })))
          : { score: 70, skipRate: 0.15, leaderQuality: 0.8 };
        await hebbianOptimizer.learn({
          tipLamports: JITO_TIP_LAMPORTS,
          status: 'monitoring',
          healthScore: health.score,
          skipRate: health.skipRate || 0.15,
          leaderQuality: health.leaderQuality || 0.8,
        });
      }
    }

    // Network health check
    if (networkHealth) {
      const health = await networkHealth.calculateHealth().catch(() => null);
      if (health) {
        log(`[Slot ${slot}] Network health: ${health.score}/100 (skip: ${health.skipRate})`);
      }
    }

    // Wait for next cycle via setInterval in start()
  } catch (e: any) {
    warn(`Monitoring error: ${e.message}`);
  }
}

async function startMonitoring(): Promise<void> {
  log(`Starting monitoring loop (every ${MONITOR_INTERVAL_MS / 1000}s)...`);

  // Run immediately, then on interval
  await checkOpportunities();
  setInterval(checkOpportunities, MONITOR_INTERVAL_MS);
}

// ===== Bundle Submission (via main stack) =====

async function submitBundle(
  transactions: VersionedTransaction[],
  payerPubkey?: PublicKey,
  tipLamports: number = JITO_TIP_LAMPORTS,
): Promise<string | null> {
  if (!jitoReady || !jitoManager) {
    err('Jito not ready');
    return null;
  }

  bundleCount++;

  try {
    const slot = await connection.getSlot();

    // Get network context for Hebbian optimization
    const networkCtx = networkHealth
      ? (await networkHealth.calculateHealth().catch(() => ({ score: 70, skipRate: 0.15 })))
      : { score: 70, skipRate: 0.15 };

    // Get tip recommendation from Hebbian
    let tip = tipLamports;
    if (hebbianOptimizer && hebbianOptimizer.recommendTip) {
      const rec = await hebbianOptimizer.recommendTip({ healthScore: networkCtx.score, skipRate: networkCtx.skipRate, leaderQuality: 0.8 });
      if (rec) tip = rec.recommendedTip;
    }

    // Or use the Jito tip oracle
    const marketTip = await tipOracle.getRecommendedTip('medium');
    tip = Math.max(tip, marketTip.lamports);

    const result = await jitoManager.submitBundle(transactions, payerPubkey, tip);
    bundleSuccessCount++;

    // Learn from success
    if (hebbianOptimizer) {
      await hebbianOptimizer.learn({
        tipLamports: tip,
        status: 'submitted',
        healthScore: networkCtx.score,
        skipRate: networkCtx.skipRate,
        leaderQuality: 0.8,
      });
    }

    // Record to proof chain
    if (proofChain) {
      await proofChain.recordDecision(
        { bundleId: result.bundleId || 'bundle_' + Date.now(), failureType: 'submitted', stage: 'submitted', submissionSlot: slot, blockhashAge: 0, slotConditions: { skipRate: networkCtx.skipRate, congestionLevel: 0.3, leaderQuality: 0.8 }, recentTips: [marketTip.lamports], submissionLatency: 0 },
        { action: 'submit', tip_adjustment_percent: 0, blockhash_refresh: false, delay_ms: 0, reasoning_summary: 'Bundle submitted via main stack' },
        { tipSource: marketTip.source, success: true },
      );
    }

    log(`Bundle submitted: ${result.bundleId} (tip: ${tip} lamports)`);
    return result.bundleId;
  } catch (e: any) {
    bundleFailCount++;
    err(`Bundle submission failed: ${e.message}`);

    // Analyze failure with AI
    if (failureAgent) {
      try {
        const fc: FailureContext = {
          failureType: classifyFailureType(e.message),
          failureStage: 'submitted',
          submissionSlot: await connection.getSlot().catch(() => 0),
          submissionTimestamp: Date.now(),
          blockhashSlot: 0,
          blockhashAge: 0,
          slotConditions: { skipRate: 0.15, congestionLevel: 0.3, leaderQuality: 0.75 },
          recentTips: [tipLamports],
          submissionLatency: 0,
        };

        const retryParams = await failureAgent.analyzeFailure(fc);
        log(`AI analysis: ${retryParams.reasoning.decision.action} (confidence: ${retryParams.reasoning.confidence})`);
      } catch (aiErr: any) {
        warn(`AI analysis failed: ${aiErr.message}`);
      }
    }

    return null;
  }
}

function classifyFailureType(msg: string): FailureType {
  if (msg.includes('blockhash') || msg.includes('expire')) return 'expired_blockhash';
  if (msg.includes('fee') || msg.includes('tip')) return 'fee_too_low';
  if (msg.includes('timeout')) return 'timeout';
  if (msg.includes('compute')) return 'compute_exceeded';
  return 'bundle_rejected';
}

// ===== Stats =====

function getStats() {
  return {
    agent: { id: AGENT_ID, name: AGENT_NAME, version: AGENT_VERSION },
    uptime: Math.floor((Date.now() - serverStartTime) / 1000),
    bundles: {
      total: bundleCount,
      successful: bundleSuccessCount,
      failed: bundleFailCount,
      successRate: bundleCount > 0 ? Math.round((bundleSuccessCount / bundleCount) * 100) : null,
    },
    jito: jitoReady ? 'live' : 'disconnected',
    hebbian: !!hebbianOptimizer,
    proofChain: !!proofChain,
    knowledgeGraph: !!knowledgeGraph,
    networkHealth: !!networkHealth,
    faultInjector: !!faultInjector,
    deepseek: deepSeekClient?.isEnabled() || false,
    failureAgent: !!failureAgent,
    tipOracle: true,
    webhooks: true,
  };
}

// ===== Main =====

async function main() {
  console.log();
  console.log('╔' + '═'.repeat(60) + '╗');
  console.log('║     ' + '🤖 Solana TX-Stack (Full Stack)'.padEnd(56) + '║');
  console.log('╚' + '═'.repeat(60) + '╝');
  console.log();

  // Handle SIGINT/TERM
  process.on('SIGINT', async () => { await shutdown(); process.exit(0); });
  process.on('SIGTERM', async () => { await shutdown(); process.exit(0); });

  try {
    await initializeStack();
    await startMonitoring();

    console.log();
    console.log('📊 Stack Status:');
    console.log(`   Jito:              ${jitoReady ? '✅ LIVE' : '⚠️ Disconnected'}`);
    console.log(`   Hebbian Optimizer: ${hebbianOptimizer ? '✅ ON' : '❌ OFF'}`);
    console.log(`   Proof Chain:       ${proofChain ? '✅ ON' : '❌ OFF'}`);
    console.log(`   Knowledge Graph:   ${knowledgeGraph ? '✅ ON' : '❌ OFF'}`);
    console.log(`   Network Health:    ${networkHealth ? '✅ ON' : '❌ OFF'}`);
    console.log(`   Fault Injector:    ${faultInjector ? '✅ ON' : '❌ OFF'}`);
    console.log(`   DeepSeek AI:       ${deepSeekClient?.isEnabled() ? '✅ ON' : '⚠️ Fallback'}`);
    console.log(`   Tip Oracle:        ✅ ON`);
    console.log(`   Webhook Manager:   ✅ ON`);
    console.log(`   Yellowstone gRPC:  ${geyserClient ? '✅ Connected' : '⚠️ Disconnected'}`);
    console.log();
    console.log(`Press Ctrl+C to stop`);
    console.log();
  } catch (e: any) {
    err(`Fatal: ${e.message}`);
    process.exit(1);
  }
}

async function shutdown(): Promise<void> {
  console.log('\n🛑 Shutting down...');

  if (geyserClient) {
    try { await geyserClient.shutdown(); log('Yellowstone gRPC disconnected'); } catch {}
  }

  // Export final stats
  const stats = getStats();
  const statsPath = path.join(process.cwd(), 'stack-stats.json');
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
  log(`Stats written to stack-stats.json`);

  console.log('✅ Shutdown complete\n');
}

main();
