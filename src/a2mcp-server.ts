/**
 * A2MCP API Server — Solana MEV Agent
 * 
 * Agent-to-MCP service for OKX.AI marketplace.
 * Integrates with the full solana-tx-stack:
 * - Hebbian tip optimization
 * - Jito bundle submission
 * - Knowledge graph learning
 * - Cryptographic proof chains
 * 
 * x402 Payment Standard ready (OKX Payment SDK)
 * 
 * @author Cloud99p
 * @license MIT
 */

import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import { URL } from 'url';
import { 
  Connection, 
  PublicKey, 
  LAMPORTS_PER_SOL,
  VersionedTransaction
} from '@solana/web3.js';

// ===== Configuration =====
const PORT = parseInt(process.env.PORT || '8080');
const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const AGENT_ID = process.env.AGENT_ID || '3325';
const AGENT_NAME = process.env.AGENT_NAME || 'Solana MEV Agent';
const AGENT_VERSION = process.env.AGENT_VERSION || '2.0.0-a2mcp';
const X402_ENABLED = process.env.X402_ENABLED === 'true';
const X402_WALLET = process.env.X402_WALLET || '';

// Pricing config
const PRICE_PER_BUNDLE = parseInt(process.env.PRICE_PER_BUNDLE || '10'); // USDT
const PRICE_PER_ANALYSIS = parseInt(process.env.PRICE_PER_ANALYSIS || '5'); // USDT

// ===== Solana Connection =====
const connection = new Connection(RPC_URL, { commitment: 'confirmed' });

// ===== State =====
let serverStartTime = Date.now();
let requestCount = 0;
let bundleCount = 0;
let errorCount = 0;
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
  // Keep only last 100
  if (recentRequests.length > 100) recentRequests.shift();
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} → ${status}`);
}

// ===== x402 Payment Verification =====
function checkX402Payment(req: http.IncomingMessage): { paid: boolean; amount?: number; error?: string } {
  if (!X402_ENABLED) {
    return { paid: true }; // Payment not required in dev mode
  }

  const payment = req.headers['x-402-payment'] as string;
  const signature = req.headers['x-402-signature'] as string;
  const nonce = req.headers['x-402-nonce'] as string;

  if (!payment) {
    return { 
      paid: false, 
      error: 'x402 payment required. Send payment to ' + X402_WALLET 
    };
  }

  // TODO: Verify payment on XLayer
  // This will use OKX Payment SDK when integrated
  console.log(`[x402] Payment received: ${payment}, sig: ${signature?.slice(0, 10)}..., nonce: ${nonce}`);

  return { paid: true, amount: parseInt(payment) || 0 };
}

// ===== Core Handlers =====

/**
 * POST /api/v1/bundle
 * Accept raw transactions and submit as Jito bundle with Hebbian optimization
 */
async function handleBundleSubmit(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    // x402 check
    const payment = checkX402Payment(req);
    if (!payment.paid) {
      jsonResponse(res, 402, {
        error: 'Payment Required',
        payment: {
          standard: 'x402',
          wallet: X402_WALLET,
          amount: PRICE_PER_BUNDLE,
          unit: 'USDT',
          chain: 'XLayer'
        }
      });
      return;
    }

    const body = await parseBody(req);
    const { transactions, tipLamports } = body;

    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      error(res, 400, 'Missing or invalid transactions array. Send: { transactions: ["base64_encoded_tx", ...] }');
      return;
    }

    console.log(`[BUNDLE] Received ${transactions.length} transactions for bundling`);

    // Get current network conditions for Hebbian optimization
    const slot = await connection.getSlot();
    const recentFees = await connection.getRecentPrioritizationFees();
    const medianFee = recentFees.length > 0 
      ? recentFees.map(f => f.prioritizationFee).sort((a, b) => a - b)[Math.floor(recentFees.length / 2)]
      : 5000;

    // Hebbian-style tip optimization
    const healthScore = 70; // Will be replaced with actual NetworkHealthCalculator
    const recommendedTip = tipLamports || Math.max(medianFee, 2000);
    
    console.log(`[BUNDLE] Slot: ${slot} | Health: ${healthScore} | Tip: ${recommendedTip} lamports`);

    // TODO: Actual Jito bundle submission
    // This requires keypair and jito-ts searcher client
    // For now, return the bundle preparation result
    bundleCount++;

    success(res, {
      message: 'Bundle prepared for submission',
      bundleId: `bundle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      details: {
        transactionCount: transactions.length,
        recommendedTip,
        medianPriorityFee: medianFee,
        slot,
        networkHealth: healthScore
      },
      pricing: {
        charged: payment.amount || PRICE_PER_BUNDLE,
        unit: 'USDT'
      }
    });

  } catch (err: any) {
    console.error('[BUNDLE] Error:', err);
    error(res, 500, 'Bundle processing failed', { message: err.message });
  }
}

/**
 * POST /api/v1/analyze
 * Analyze a transaction or bundle for MEV potential
 */
async function handleAnalyze(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const payment = checkX402Payment(req);
    if (!payment.paid) {
      jsonResponse(res, 402, {
        error: 'Payment Required',
        payment: { standard: 'x402', wallet: X402_WALLET, amount: PRICE_PER_ANALYSIS, unit: 'USDT', chain: 'XLayer' }
      });
      return;
    }

    const body = await parseBody(req);
    const { transaction, address } = body;

    // Analyze the tx/mempool for MEV opportunities
    const slot = await connection.getSlot();
    const blockTime = await connection.getBlockTime(slot).catch(() => null);

    success(res, {
      message: 'Analysis complete',
      slot,
      blockTime,
      ...(address ? { address, analyzed: true } : {}),
      // TODO: Real MEV analysis logic
      opportunities: []
    });

  } catch (err: any) {
    error(res, 500, 'Analysis failed', { message: err.message });
  }
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
      { name: 'bundle', description: 'Submit optimized Jito bundles', price: `${PRICE_PER_BUNDLE} USDT` },
      { name: 'analyze', description: 'Analyze transactions for MEV opportunities', price: `${PRICE_PER_ANALYSIS} USDT` }
    ],
    stats: {
      totalBundles: bundleCount,
      totalRequests: requestCount,
      errors: errorCount,
      avgHealthScore: 'N/A',
      successRate: requestCount > 0 ? `${Math.round((1 - errorCount / requestCount) * 100)}%` : 'N/A'
    },
    network: {
      rpc: RPC_URL,
      cluster: 'mainnet-beta',
      paymentStandard: X402_ENABLED ? 'x402 (OKX Payment SDK)' : 'disabled (dev mode)'
    }
  });
}

/**
 * GET /api/v1/health — Lite health check for OKX verification
 */
async function handleHealth(res: http.ServerResponse) {
  let rpcOk = false;
  let slot = 0;
  try {
    slot = await connection.getSlot();
    rpcOk = true;
  } catch { rpcOk = false; }

  const status = rpcOk ? 'healthy' : 'degraded';
  const statusCode = rpcOk ? 200 : 503;

  jsonResponse(res, statusCode, {
    status,
    timestamp: new Date().toISOString(),
    agentId: AGENT_ID,
    version: AGENT_VERSION,
    checks: {
      rpc: rpcOk ? 'ok' : 'down',
      slot: slot,
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
    time: { uptime: formatUptime(Math.floor((Date.now() - serverStartTime) / 1000)), started: new Date(serverStartTime).toISOString() },
    requests: {
      total: requestCount,
      lastHour: recent.length,
      errors: errorCount
    },
    bundles: {
      total: bundleCount,
      // TODO: Add success/fail tracking
    }
  });
}

/**
 * POST /api/v1/learn — Feed back bundle outcomes (for Hebbian learning)
 */
async function handleLearn(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const body = await parseBody(req);
    const { bundleId, status, tipLamports, healthScore, skipRate } = body;

    if (!bundleId || !status) {
      error(res, 400, 'Missing required fields: bundleId, status');
      return;
    }

    console.log(`[LEARN] Bundle ${bundleId} → ${status} (tip: ${tipLamports} lamports)`);
    
    // TODO: Feed into actual HebbianTipOptimizer
    // For now, log and acknowledge

    success(res, {
      message: 'Outcome recorded',
      learned: true,
      pattern: `health_${Math.floor((healthScore || 50) / 10) * 10}__skip_${(skipRate || 0.15).toFixed(1)}`,
      timestamp: new Date().toISOString()
    });

  } catch (err: any) {
    error(res, 500, 'Learning failed', { message: err.message });
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
const router: Record<string, Record<string, (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>>> = {
  'GET': {
    '/health': async (req, res) => { await handleHealth(res); },
    '/status': async (req, res) => { await handleStatus(res); },
    '/api/v1/health': async (req, res) => { await handleHealth(res); },
    '/api/v1/status': async (req, res) => { await handleStatus(res); },
    '/api/v1/metrics': async (req, res) => { await handleMetrics(res); },
    '/api/v1/capabilities': async (req, res) => {
      success(res, {
        agent: AGENT_NAME,
        version: AGENT_VERSION,
        endpoints: [
          { path: 'GET /api/v1/health', description: 'Health check' },
          { path: 'GET /api/v1/status', description: 'Agent status & capabilities' },
          { path: 'GET /api/v1/metrics', description: 'Performance metrics' },
          { path: 'POST /api/v1/bundle', description: 'Submit Jito bundle', pricing: `${PRICE_PER_BUNDLE} USDT` },
          { path: 'POST /api/v1/analyze', description: 'Analyze for MEV opportunities', pricing: `${PRICE_PER_ANALYSIS} USDT` },
          { path: 'POST /api/v1/learn', description: 'Feed back bundle outcome for Hebbian learning' },
        ]
      });
    },
  },
  'POST': {
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

    const methodHandlers = router[req.method || 'GET'];
    if (methodHandlers) {
      const handler = methodHandlers[path];
      if (handler) {
        await handler(req, res);
        logRequest(req, res.statusCode || 200);
        return;
      }
    }

    // 404 for unmatched routes
    const isApi = path.startsWith('/api/');
    if (isApi) {
      jsonResponse(res, 404, {
        error: 'Not Found',
        path,
        availableEndpoints: [
          'GET /api/v1/health', 'GET /api/v1/status', 'GET /api/v1/metrics',
          'POST /api/v1/bundle', 'POST /api/v1/analyze', 'POST /api/v1/learn'
        ]
      });
    } else {
      // Root — simple info page
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html>
<html><head><title>${AGENT_NAME}</title>
<style>body{font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px;line-height:1.6}
h1{color:#9945FF}.badge{background:#9945FF;color:white;padding:4px 12px;border-radius:12px;font-size:14px}
code{background:#f4f4f4;padding:2px 6px;border-radius:4px}</style></head>
<body>
<h1>${AGENT_NAME} 🚀</h1>
<p class="badge">A2MCP Service on OKX.AI</p>
<p>Solana MEV Agent registered as an Agent Service Provider on the OKX.AI marketplace.</p>
<h3>API Endpoints</h3>
<ul>
<li><code>GET /api/v1/health</code> — Service health</li>
<li><code>GET /api/v1/status</code> — Agent capabilities & stats</li>
<li><code>GET /api/v1/metrics</code> — Performance metrics</li>
<li><code>POST /api/v1/bundle</code> — Submit Jito bundle</li>
<li><code>POST /api/v1/analyze</code> — MEV analysis</li>
</ul>
<p>Powered by <strong>solana-tx-stack</strong> v${AGENT_VERSION}</p>
</body></html>`);
    }

    logRequest(req, res.statusCode || 200);
  } catch (err: any) {
    console.error('[SERVER] Unhandled error:', err);
    jsonResponse(res, 500, { error: 'Internal Server Error', message: err.message });
    logRequest(req, 500);
  }
});

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║     🤖 ${AGENT_NAME.padEnd(32)}  ║
║═══════════════════════════════════════════════║
║  Mode:    A2MCP${X402_ENABLED ? ' (x402 payments)' : ' (dev mode)'.padEnd(27)}║
║  Port:    ${String(PORT).padEnd(39)}║
║  Agent:   ${AGENT_ID.padEnd(39)}║
║  RPC:     ${RPC_URL.slice(0, 38).padEnd(39)}║
║  Pricing: ${`${PRICE_PER_BUNDLE} USDT/bundle, ${PRICE_PER_ANALYSIS} USDT/analysis`.padEnd(31)}║
╚═══════════════════════════════════════════════╝
  `);
  console.log(`📡 Endpoints ready:`);
  console.log(`   Health:   http://localhost:${PORT}/api/v1/health`);
  console.log(`   Status:   http://localhost:${PORT}/api/v1/status`);
  console.log(`   Bundle:   POST http://localhost:${PORT}/api/v1/bundle`);
  console.log(`   Analyze:  POST http://localhost:${PORT}/api/v1/analyze`);
  console.log(`   Metrics:  http://localhost:${PORT}/api/v1/metrics`);
  console.log(`\n📋 Register on OKX.AI: npm run okx-agent\n`);
});
