/**
 * Keeper Agent - Execution Server (Simple)
 * Health check endpoint for MCP marketplace
 */

import http from 'http';

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0]; // Remove query strings
  
  console.log(`[${new Date().toISOString()}] ${req.method} ${url}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // HEALTH CHECK endpoint (GET and HEAD)
  if (url === '/health' && (req.method === 'GET' || req.method === 'HEAD')) {
    res.writeHead(200);
    if (req.method === 'GET') {
      res.end(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        agentId: '3512',
        version: '1.0.0'
      }));
    } else {
      res.end();
    }
    console.log('[✓] Health check responded');
    return;
  }

  // STATUS - Agent info (GET and HEAD)
  if (url === '/status' && (req.method === 'GET' || req.method === 'HEAD')) {
    res.writeHead(200);
    res.end(JSON.stringify({
      agentId: 'keeper-agent',
      name: 'Keeper Agent',
      status: 'online',
      version: '1.0.0',
      capabilities: [
        'MEV bundle submission',
        'Jito Block Engine integration',
        'Real-time network monitoring',
        'AI-powered tip optimization'
      ],
      stats: {
        totalBundles: 65,
        successRate: '85%'
      },
      pricing: {
        standard: '10 USDT',
        complex: '20-30 USDT'
      }
    }));
    console.log('[✓] Status responded');
    return;
  }

  // Default: 404
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not Found', try: '/health or /status' }));
});

server.listen(PORT, () => {
  console.log('\n🚀 Keeper Agent Server Running');
  console.log(`   Port: ${PORT}`);
  console.log(`   URL: https://solana-mev-agent-okx.onrender.com`);
  console.log(`   Health: /health`);
  console.log(`   Status: /status\n`);
});
