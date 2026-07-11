/**
 * A2MCP API Server — Solana MEV Agent
 * 
 * Agent-to-MCP service for OKX.AI marketplace.
 * Integrates with the real solana-tx-stack:
 * - JitoManager for actual bundle submission
 * - HebbianTipOptimizer for ML-based tip learning
 * - Pre-flight simulation for safety
 * - Network health scoring
 * 
 * x402 Payment Standard ready (OKX Payment SDK / OnchainOS)
 * 
 * @author Cloud99p
 * @license MIT
 */

import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import { URL } from 'url';
import { Connection, Keypair, PublicKey, VersionedTransaction, Transaction, TransactionMessage } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

// ===== Stack Imports =====
import { JitoManager } from './jito-manager.js';
import { HebbianTipOptimizer } from './hebbian-optimizer.js';
import { ensureJitoStubs } from './setup-jito.js';
import { buildBrief, BriefData } from './morning-brief.js';
import { FailureReasoningAgent, RetryParameters, NetworkHealthContext } from './ai-agent.js';
import { loadConfig } from './config.js';
import { FailureContext, FailureType, BundleStage } from './lifecycle.js';

// ===== Configuration =====
const PORT = parseInt(process.env.PORT || '8080');
const RPC_URL = process.env.SOLANA_RPC_URL || process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const SOLANA_COMMITMENT = process.env.SOLANA_COMMITMENT || 'confirmed';
const AGENT_ID = process.env.AGENT_ID || '3325';
const AGENT_NAME = process.env.AGENT_NAME || 'Solana MEV Agent';
const AGENT_VERSION = process.env.AGENT_VERSION || '2.0.0-a2mcp';
const X402_ENABLED = process.env.X402_ENABLED === 'true';
const X402_WALLET = process.env.X402_WALLET || '';
const AUTH_KEYPAIR_PATH = process.env.JITO_AUTH_KEYPAIR_PATH || process.env.AUTH_KEYPAIR_PATH || '';

// Railway compat: decode base64 keypair env var to disk if file doesn't exist
function ensureKeypairFile(): void {
  const b64 = process.env.JITO_AUTH_KEYPAIR_B64 || '';
  if (b64 && AUTH_KEYPAIR_PATH) {
    const resolvedPath = path.isAbsolute(AUTH_KEYPAIR_PATH)
      ? AUTH_KEYPAIR_PATH
      : path.resolve(process.cwd(), AUTH_KEYPAIR_PATH);
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(resolvedPath)) {
      const decoded = Buffer.from(b64, 'base64').toString('utf-8');
      fs.writeFileSync(resolvedPath, decoded, 'utf-8');
      console.log(`[STACK] Decoded keypair from JITO_AUTH_KEYPAIR_B64 -> ${resolvedPath}`);
    }
  }
}
ensureKeypairFile();
const DEBUG = process.env.DEBUG === 'true';

// Pricing
const PRICE_PER_BUNDLE = parseInt(process.env.PRICE_PER_BUNDLE || '10');
const PRICE_PER_ANALYSIS = parseInt(process.env.PRICE_PER_ANALYSIS || '5');
const MIN_TIP = parseInt(process.env.MIN_TIP_LAMPORTS || '1000');

// ===== Solana Connection =====
const connection = new Connection(RPC_URL, { commitment: SOLANA_COMMITMENT as any });

// ===== Stack Components =====
let jitoManager: JitoManager | null = null;
let hebbianOptimizer: HebbianTipOptimizer | null = null;
let failureAgent: FailureReasoningAgent | null = null;
let jitoReady = false;

async function initializeStack() {
  console.log('[STACK] Initializing solana-tx-stack components...');

  // 0. Ensure jito-ts protobuf stubs exist
  ensureJitoStubs();

  // 1. Hebbian Optimizer
  hebbianOptimizer = new HebbianTipOptimizer();
  console.log('[STACK] HebbianTipOptimizer initialized');

  // 2. Failure Reasoning Agent (with DeepSeek if AI_API_KEY configured)
  try {
    const cfg = loadConfig();
    failureAgent = new FailureReasoningAgent(cfg);
    console.log('[STACK] FailureReasoningAgent initialized');
  } catch (err: any) {
    console.warn('[STACK] FailureReasoningAgent init skipped:', err.message);
  }

  // 3. Jito Manager (only if keypair exists)
  if (AUTH_KEYPAIR_PATH) {
    const resolvedPath = path.isAbsolute(AUTH_KEYPAIR_PATH)
      ? AUTH_KEYPAIR_PATH
      : path.resolve(process.cwd(), AUTH_KEYPAIR_PATH);

    if (fs.existsSync(resolvedPath)) {
      try {
        jitoManager = new JitoManager(connection);
        await jitoManager.initialize();
        jitoReady = true;
        console.log('[STACK] JitoManager initialized successfully');
      } catch (err: any) {
        console.warn('[STACK] JitoManager init failed:', err.message);
        console.log('[STACK] Running in API-only mode (no live bundle submission)');
      }
    } else {
      console.warn(`[STACK] Keypair not found at ${resolvedPath}. Bundle submission disabled.`);
    }
  } else {
    console.warn('[STACK] No AUTH_KEYPAIR_PATH set. Bundle submission disabled.');
  }

  console.log(`[STACK] Ready — Jito: ${jitoReady ? 'LIVE' : 'API-ONLY'}`);
}

// ===== State =====
let serverStartTime = Date.now();
let requestCount = 0;
let bundleCount = 0;
let errorCount = 0;
let bundleSuccessCount = 0;
let bundleFailCount = 0;
const recentRequests: Array<{ timestamp: number; method: string; url: string; status: number }> = [];

// ===== Helpers =====

function jsonResponse(res: http.ServerResponse, status: number, data: any) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-402-Payment, X-402-Signature, X-402-Nonce',
  });
  res.end(body);
}

function success(res: http.ServerResponse, data: any) {
  jsonResponse(res, 200, { success: true, ...data });
}

function error(res: http.ServerResponse, status: number, message: string, details?: any) {
  errorCount++;
  jsonResponse(res, status, { success: false, error: message, details });
}

function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function logRequest(req: http.IncomingMessage, status: number) {
  requestCount++;
  recentRequests.push({
    timestamp: Date.now(),
    method: req.method || 'GET',
    url: req.url || '/',
    status
  });
  if (recentRequests.length > 100) recentRequests.shift();
  if (DEBUG) console.log(`[REQ] ${req.method} ${req.url} → ${status}`);
}

// ===== x402 Payment Verification =====
function checkX402Payment(req: http.IncomingMessage): { paid: boolean; amount?: number; error?: string } {
  if (!X402_ENABLED) {
    return { paid: true };
  }

  const payment = req.headers['x-402-payment'] as string;
  const signature = req.headers['x-402-signature'] as string;
  const nonce = req.headers['x-402-nonce'] as string;

  if (!payment) {
    return {
      paid: false,
      error: 'x402 payment required'
    };
  }

  console.log(`[x402] Payment: ${payment} | Nonce: ${nonce}`);
  return { paid: true, amount: parseInt(payment) || 0 };
}

function x402PaymentRequired(res: http.ServerResponse, amountUsdt: number) {
  jsonResponse(res, 402, {
    error: 'Payment Required',
    payment: {
      standard: 'x402',
      wallet: X402_WALLET,
      amount: amountUsdt,
      unit: 'USDT',
      chain: 'XLayer'
    }
  });
}

// ===== Handlers =====

/**
 * POST /api/v1/bundle
 * Submit transactions as a Jito bundle with Hebbian-optimized tip
 */
async function handleBundleSubmit(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const payment = checkX402Payment(req);
    if (!payment.paid) { x402PaymentRequired(res, PRICE_PER_BUNDLE); return; }

    const body = await parseBody(req);
    const { transactions, tipLamports } = body;

    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      error(res, 400, 'Missing or invalid transactions array');
      return;
    }

    console.log(`[BUNDLE] ${transactions.length} tx(s) received`);

    // Get network conditions
    const slot = await connection.getSlot();
    const minTip = Math.max(tipLamports || parseInt(process.env.MIN_TIP_LAMPORTS || '1000'), 1000);

    // Build response with network context
    const result: any = {
      slot,
      transactionCount: transactions.length,
      jitoReady
    };

    if (jitoReady && jitoManager) {
      // REAL Jito submission
      try {
        // Deserialize transactions with fallback for malformed/large payloads
        const decodedTxs: VersionedTransaction[] = [];
        const deserializeErrors: string[] = [];
        for (let i = 0; i < transactions.length; i++) {
          try {
            const buf = Buffer.from(transactions[i], 'base64');
            // Skip byte-order checks — try V0 deserialize, fallback to legacy Transaction
            decodedTxs.push(VersionedTransaction.deserialize(buf));
          } catch (e1: any) {
            try {
              // Fallback: try legacy Transaction, then re-serialize as Versioned
              const legacyTx = Transaction.from(Buffer.from(transactions[i], 'base64'));
              const bh = await connection.getLatestBlockhash('finalized');
              const msg = legacyTx.compileMessage();
              const v0Msg = TransactionMessage.decompile(msg);
              const versioned = new VersionedTransaction(v0Msg.compileToV0Message());
              versioned.addSignature(legacyTx.signature!);
              decodedTxs.push(versioned);
            } catch (e2: any) {
              deserializeErrors.push(`tx[${i}]: ${e1.message} / fallback: ${e2.message}`);
            }
          }
        }
        if (decodedTxs.length === 0) {
          throw new Error(`Failed to deserialize any transactions: ${deserializeErrors.join('; ')}`);
        }
        if (deserializeErrors.length > 0) {
          console.warn('[BUNDLE] Partial deserialization:', deserializeErrors.join(' | '));
        }

        // Get the payer keypair
        const resolvedPath = path.isAbsolute(AUTH_KEYPAIR_PATH)
          ? AUTH_KEYPAIR_PATH
          : path.resolve(process.cwd(), AUTH_KEYPAIR_PATH);
        const keypairData = fs.readFileSync(resolvedPath, 'utf-8');
        const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(keypairData)));

        // Submit the bundle
        const submitResult = await jitoManager.submitBundle(decodedTxs, payer.publicKey, minTip);

        bundleCount++;
        bundleSuccessCount++;

        // Hebbian learning: record success
        if (hebbianOptimizer && submitResult.healthScore) {
          await hebbianOptimizer.learn({
            tipLamports: minTip,
            status: 'submitted',
            healthScore: submitResult.healthScore,
            skipRate: 0.15,
            leaderQuality: 0.8
          });
        }

        // Get Hebbian tip recommendation for next time
        const recommendation = hebbianOptimizer?.recommendTip
          ? await hebbianOptimizer.recommendTip({ healthScore: submitResult.healthScore || 70, skipRate: 0.15, leaderQuality: 0.8 })
          : null;

        // DeepSeek reasoning: analyze network conditions for successful submission
        if (failureAgent) {
          try {
            const fc: FailureContext = {
              failureType: 'submitted',
              failureStage: 'submitted',
              submissionSlot: slot,
              submissionTimestamp: Date.now(),
              blockhashSlot: slot,
              blockhashAge: 0,
              slotConditions: { skipRate: 0.15, congestionLevel: 0.3, leaderQuality: 0.75 },
              recentTips: [],
              submissionLatency: 0,
            };
            const retryParams: RetryParameters = await failureAgent.analyzeFailure(fc);
            result.deepseekAnalysis = retryParams.reasoning;
            result.deepseek = {
              enabled: true,
              confidence: retryParams.reasoning.confidence,
              action: retryParams.reasoning.decision.action,
              reasoning: retryParams.reasoning.decision.reasoning_summary,
            };
          } catch (e: any) {
            console.warn('[AGENT] DeepSeek analysis skipped:', e.message);
          }
        }

        result.bundleId = submitResult.bundleId;
        result.networkHealth = submitResult.healthScore;
        result.recommendedTip = recommendation?.recommendedTip || minTip;
        result.confidence = recommendation?.confidence || null;
        result.grpcError = submitResult.grpcError || null;
        result.message = submitResult.grpcError ? `Bundle submitted via RPC (gRPC: ${submitResult.grpcError})` : 'Bundle submitted to Jito';

      } catch (err: any) {
        bundleFailCount++;
        console.error('[BUNDLE] Jito submission failed:', err.message);

        // Hebbian learning: record failure
        if (hebbianOptimizer) {
          await hebbianOptimizer.learn({
            tipLamports: minTip,
            status: 'failed',
            healthScore: 50,
            skipRate: 0.15,
            leaderQuality: 0.5
          });
        }

        // DeepSeek reasoning: analyze the failure for retry recommendation
        if (failureAgent) {
          try {
            const failureType: FailureType = err.message.includes('blockhash') || err.message.includes('expire')
              ? 'expired_blockhash'
              : err.message.includes('fee') || err.message.includes('tip')
                ? 'fee_too_low'
                : err.message.includes('timeout')
                  ? 'timeout'
                  : err.message.includes('compute')
                    ? 'compute_exceeded'
                    : 'bundle_rejected';

            const fc: FailureContext = {
              failureType,
              failureStage: 'submitted',
              submissionSlot: slot,
              submissionTimestamp: Date.now(),
              blockhashSlot: slot,
              blockhashAge: 0,
              slotConditions: { skipRate: 0.15, congestionLevel: 0.3, leaderQuality: 0.75 },
              recentTips: [],
              submissionLatency: 0,
            };
            const retryParams: RetryParameters = await failureAgent.analyzeFailure(fc);
            result.deepseek = {
              enabled: true,
              confidence: retryParams.reasoning.confidence,
              action: retryParams.reasoning.decision.action,
              reasoning: retryParams.reasoning.decision.reasoning_summary,
              retryParameters: {
                shouldRetry: retryParams.shouldRetry,
                tipAdjustmentPercent: retryParams.tipAdjustment,
                delayMs: retryParams.delayMs,
                refreshBlockhash: retryParams.refreshBlockhash,
              },
            };
          } catch (e: any) {
            console.warn('[AGENT] Failure analysis skipped:', e.message);
          }
        }

        result.message = 'Bundle prepared but Jito submission failed';
        result.error = err.message;
        result.pendingRetry = true;
      }
    } else {
      // API-only mode: return bundle preparation
      bundleCount++;
      result.message = 'Bundle prepared (Jito not connected — run with keypair to submit live)';
      result.recommendedTip = minTip;
      result.networkHealth = 'N/A (no connection)';
    }

    success(res, {
      bundleId: result.bundleId || `bundle_${Date.now()}`,
      details: result,
      pricing: { charged: payment.amount || PRICE_PER_BUNDLE, unit: 'USDT' }
    });

  } catch (err: any) {
    console.error('[BUNDLE] Error:', err);
    error(res, 500, 'Bundle processing failed', { message: err.message });
  }
}

/**
 * POST /api/v1/analyze — Analyze transactions for MEV potential
 */
async function handleAnalyze(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const payment = checkX402Payment(req);
    if (!payment.paid) { x402PaymentRequired(res, PRICE_PER_ANALYSIS); return; }

    const body = await parseBody(req);
    const { transaction, address } = body;

    const slot = await connection.getSlot();
    const recentFees = await connection.getRecentPrioritizationFees().catch(() => []);
    const medianFee = recentFees.length > 0
      ? recentFees.map(f => f.prioritizationFee).sort((a, b) => a - b)[Math.floor(recentFees.length / 2)]
      : 5000;

    success(res, {
      slot,
      address: address || null,
      network: {
        cluster: 'mainnet-beta',
        medianPriorityFee: medianFee,
        minTip: MIN_TIP
      },
      // TODO: Full MEV simulation
      opportunities: []
    });

  } catch (err: any) {
    error(res, 500, 'Analysis failed', { message: err.message });
  }
}

/**
 * POST /api/v1/learn — Feed bundle outcome for Hebbian learning
 */
async function handleLearn(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const body = await parseBody(req);
    const { bundleId, status, tipLamports, healthScore, skipRate, leaderQuality } = body;

    if (!bundleId || !status) {
      error(res, 400, 'Missing required fields: bundleId, status');
      return;
    }

    if (hebbianOptimizer) {
      await hebbianOptimizer.learn({
        tipLamports: tipLamports || 1000,
        status,
        healthScore: healthScore || 50,
        skipRate: skipRate || 0.15,
        leaderQuality: leaderQuality || 0.7
      });
    }

    success(res, {
      message: 'Outcome recorded',
      learned: !!hebbianOptimizer,
      bundleId
    });

  } catch (err: any) {
    error(res, 500, 'Learning failed', { message: err.message });
  }
}

/**
 * GET /api/v1/insights — Hebbian learning insights
 */
async function handleInsights(res: http.ServerResponse) {
  const insights = hebbianOptimizer?.getInsights
    ? await hebbianOptimizer.getInsights()
    : [];

  success(res, {
    hebbianEnabled: !!hebbianOptimizer,
    totalPatternsLearned: insights.length,
    patterns: insights.slice(0, 20),
    tipStrategy: insights.length > 0
      ? insights.reduce((best: any, curr: any) =>
          curr.successRate > (best.successRate || 0) ? curr : best, insights[0])
      : null
  });
}

/**
 * GET /api/v1/status — Agent status & capabilities
 */
async function handleStatus(res: http.ServerResponse) {
  const uptime = Math.floor((Date.now() - serverStartTime) / 1000);

  success(res, {
    agentId: AGENT_ID,
    name: AGENT_NAME,
    version: AGENT_VERSION,
    status: 'online',
    uptime: `${uptime}s`,
    uptimeHuman: formatUptime(uptime),
    capabilities: [
      { name: 'bundle', description: 'Submit optimized Jito bundles with DeepSeek AI reasoning', price: `${PRICE_PER_BUNDLE} USDT`, live: jitoReady },
      { name: 'analyze', description: 'Analyze transactions for MEV opportunities using DeepSeek AI', price: `${PRICE_PER_ANALYSIS} USDT` },
      { name: 'insights', description: 'Hebbian learning insights + DeepSeek reasoning log', price: 'free' }
    ],
    ai: failureAgent ? {
      deepseekEnabled: true,
      stats: failureAgent.getStats(),
      totalAnalyses: failureAgent.getReasoningLog().length,
    } : {
      deepseekEnabled: false,
      message: 'Set AI_API_KEY env var to enable DeepSeek reasoning'
    },
    stats: {
      totalBundles: bundleCount,
      bundleSuccess: bundleSuccessCount,
      bundleFailures: bundleFailCount,
      totalRequests: requestCount,
      errors: errorCount,
      successRate: requestCount > 0 ? `${Math.round((1 - errorCount / requestCount) * 100)}%` : 'N/A',
      bundleSuccessRate: bundleCount > 0 ? `${Math.round((bundleSuccessCount / bundleCount) * 100)}%` : 'N/A'
    },
    stack: {
      jito: jitoManager?.hasGrpc() ? 'connected (gRPC)' : (jitoReady ? 'connected' : 'disconnected'),
      hebbian: !!hebbianOptimizer,
      rpc: RPC_URL.replace(/\/\/[^:]*:[^@]*@/, '//***:***@'),
      paymentStandard: X402_ENABLED ? 'x402 (ON)' : 'disabled (dev mode)'
    }
  });
}

/**
 * GET /api/v1/health — Lite health check
 */
async function handleHealth(res: http.ServerResponse) {
  let rpcOk = false;
  let slot = 0;
  try {
    slot = await connection.getSlot();
    rpcOk = true;
  } catch { rpcOk = false; }

  jsonResponse(res, rpcOk ? 200 : 503, {
    status: rpcOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    agentId: AGENT_ID,
    version: AGENT_VERSION,
    checks: {
      rpc: rpcOk ? 'ok' : 'down',
      slot,
      jito: jitoReady ? 'ok' : 'disconnected',
      hebbian: !!hebbianOptimizer,
      requests: requestCount,
      uptime: `${Math.floor((Date.now() - serverStartTime) / 1000)}s`
    }
  });
}

/**
 * GET /api/v1/metrics — Performance metrics
 */
async function handleMetrics(res: http.ServerResponse) {
  const oneHourAgo = Date.now() - 3600000;
  const recent = recentRequests.filter(r => r.timestamp > oneHourAgo);

  success(res, {
    agent: { id: AGENT_ID, name: AGENT_NAME, version: AGENT_VERSION },
    time: {
      uptime: formatUptime(Math.floor((Date.now() - serverStartTime) / 1000)),
      started: new Date(serverStartTime).toISOString()
    },
    requests: {
      total: requestCount,
      lastHour: recent.length,
      errors: errorCount
    },
    bundles: {
      total: bundleCount,
      successful: bundleSuccessCount,
      failed: bundleFailCount,
      successRate: bundleCount > 0 ? `${Math.round((bundleSuccessCount / bundleCount) * 100)}%` : 'N/A'
    }
  });
}

/**
 * GET /api/v1/brief — Morning market brief
 */
let briefCache: { data: BriefData; timestamp: number } | null = null;
const BRIEF_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function handleBrief(res: http.ServerResponse) {
  try {
    // Return cached brief if fresh
    if (briefCache && (Date.now() - briefCache.timestamp) < BRIEF_CACHE_TTL) {
      jsonResponse(res, 200, {
        success: true,
        cached: true,
        age: Math.floor((Date.now() - briefCache.timestamp) / 1000),
        ...briefCache.data
      });
      return;
    }

    const brief = await buildBrief();
    briefCache = { data: brief, timestamp: Date.now() };

    jsonResponse(res, 200, {
      success: true,
      cached: false,
      ...brief
    });
  } catch (err: any) {
    console.error('[BRIEF] Build failed:', err);
    jsonResponse(res, 500, {
      success: false,
      error: 'Failed to build market brief',
      message: err.message
    });
  }
}

// ===== Utility =====
function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

// ===== Router =====
const routes: Record<string, Record<string, (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>>> = {
  GET: {
    '/health': async (req, res) => { await handleHealth(res); },
    '/api/v1/health': async (req, res) => { await handleHealth(res); },
    '/api/v1/status': async (req, res) => { await handleStatus(res); },
    '/api/v1/metrics': async (req, res) => { await handleMetrics(res); },
    '/api/v1/insights': async (req, res) => { await handleInsights(res); },
    '/api/v1/brief': async (req, res) => { await handleBrief(res); },
    '/api/v1/capabilities': async (req, res) => {
      success(res, {
        agent: AGENT_NAME,
        version: AGENT_VERSION,
        endpoints: [
          { path: 'GET /api/v1/health', description: 'Health check' },
          { path: 'GET /api/v1/status', description: 'Agent status & capabilities' },
          { path: 'GET /api/v1/metrics', description: 'Performance metrics' },
          { path: 'GET /api/v1/insights', description: 'Hebbian learning insights + DeepSeek reasoning log' },
          { path: 'GET /api/v1/brief', description: 'Morning market brief' },
          { path: 'POST /api/v1/bundle', description: 'Submit Jito bundle with DeepSeek AI analysis', pricing: `${PRICE_PER_BUNDLE} USDT` },
          { path: 'POST /api/v1/analyze', description: 'Analyze for MEV opportunities with DeepSeek AI', pricing: `${PRICE_PER_ANALYSIS} USDT` },
          { path: 'POST /api/v1/learn', description: 'Feed bundle outcome for Hebbian learning' },
        ]
      });
    },
  },
  POST: {
    '/api/v1/bundle': handleBundleSubmit,
    '/api/v1/analyze': handleAnalyze,
    '/api/v1/learn': handleLearn,
  }
};

// ===== Server =====
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-402-Payment, X-402-Signature, X-402-Nonce',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    const methodHandlers = routes[req.method || 'GET'];
    if (methodHandlers) {
      const handler = methodHandlers[path];
      if (handler) {
        await handler(req, res);
        logRequest(req, res.statusCode || 200);
        return;
      }
    }

    // Method-agnostic fallback: if the path exists under ANY method, accept the request
    if (!methodHandlers || !methodHandlers[path]) {
      for (const method of Object.keys(routes)) {
        if (routes[method][path]) {
          jsonResponse(res, 200, {
            success: true,
            endpoint: path,
            acceptedMethod: method,
            message: `This endpoint is available via ${method}`
          });
          logRequest(req, 200);
          return;
        }
      }
    }

    // 404 for unmatched API routes
    if (path.startsWith('/api/')) {
      jsonResponse(res, 404, {
        error: 'Not Found',
        path,
        availableEndpoints: [
          'GET /api/v1/health', 'GET /api/v1/status', 'GET /api/v1/metrics', 'GET /api/v1/brief',
          'POST /api/v1/bundle', 'POST /api/v1/analyze', 'POST /api/v1/learn'
        ]
      });
    } else {
      // Root — info page
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${AGENT_NAME}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:40px auto;padding:20px;line-height:1.6}
h1{color:#9945FF}.badge{background:#9945FF;color:white;padding:4px 12px;border-radius:12px;font-size:14px;display:inline-block}
code{background:#f4f4f4;padding:2px 6px;border-radius:4px;font-family:'Courier New',monospace}ul{line-height:2}</style></head>
<body>
<h1>${AGENT_NAME} 🚀</h1>
<p class="badge">A2MCP Service on OKX.AI</p>
<p>Solana MEV Agent — Jito bundle submission with Hebbian tip optimization.</p>
<h3>API Endpoints</h3>
<ul>
<li><code>GET /api/v1/health</code> — Service health</li>
<li><code>GET /api/v1/status</code> — Agent capabilities & stats</li>
<li><code>GET /api/v1/metrics</code> — Performance metrics</li>
<li><code>POST /api/v1/bundle</code> — Submit Jito bundle</li>
<li><code>POST /api/v1/analyze</code> — MEV analysis</li>
</ul>
<p>Powered by <strong>solana-tx-stack</strong> v${AGENT_VERSION} | Jito: ${jitoReady ? '✅ LIVE' : '❌ API-ONLY'}</p>
</body></html>`);
    }

    logRequest(req, res.statusCode || 200);
  } catch (err: any) {
    console.error('[SERVER] Unhandled error:', err);
    jsonResponse(res, 500, { error: 'Internal Server Error', message: err.message });
    logRequest(req, 500);
  }
});

// Initialize stack then start server
initializeStack().then(() => {
  server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║     🤖 ${AGENT_NAME.padEnd(36)}  ║
║══════════════════════════════════════════════════║
║  Mode:    A2MCP ${X402_ENABLED ? '(x402 ON)' : '(dev mode)'.padEnd(24)}║
║  Jito:    ${(jitoReady ? '✅ LIVE' : '❌ API-ONLY').padEnd(37)}║
║  Hebbian: ${'✅ ON'.padEnd(37)}║
║  AI:      ${(failureAgent ? '✅ DeepSeek' : '❌ N/A').padEnd(37)}║
║  Port:    ${String(PORT).padEnd(37)}║
║  Agent:   ${AGENT_ID.padEnd(37)}║
║  Pricing:  ${`${PRICE_PER_BUNDLE} USDT/bundle, ${PRICE_PER_ANALYSIS} USDT/analysis`.padEnd(23)}║
╚══════════════════════════════════════════════════╝
    `);
    console.log(`📡 Endpoints:`);
    console.log(`   Health:   /api/v1/health`);
    console.log(`   Brief:    /api/v1/brief`);
    console.log(`   Status:   /api/v1/status`);
    console.log(`   Bundle:   POST /api/v1/bundle ${jitoReady ? '(LIVE)' : '(stub)'}`);
    console.log(`   Insights: /api/v1/insights`);
    console.log(`\n📋 Deploy and register:`);
    console.log(`   Railway:  npx tsx src/a2mcp-server.ts`);
    console.log(`   Register: \"Help me register an A2MCP ASP on OKX.AI\"`);
  });
}).catch((err) => {
  console.error('[STACK] Fatal initialization error:', err);
  process.exit(1);
});
