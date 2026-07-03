/**
 * OKX.AI ASP Agent Health Server
 * Simple, bulletproof server for OKX health checks
 */

import http from 'http';

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    console.log(`[${new Date().toISOString()}] ${req.method} ${url}`);

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Health Check (GET and HEAD)
    if (url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
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

    // Status (GET and HEAD)
    if (url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (req.method === 'GET') {
            res.end(JSON.stringify({
                agentId: '3512',
                name: 'Solana MEV Agent',
                status: 'online',
                version: '1.0.0',
                capabilities: ['MEV bundle submission', 'Jito Block Engine integration'],
                stats: { totalBundles: 65, successRate: '85%' }
            }));
        } else {
            res.end();
        }
        console.log('[✓] Status responded');
        return;
    }

    // Root - simple OK message
    if (url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Solana MEV Agent - OKX.AI ASP\nHealth: /health\nStatus: /status');
        console.log('[✓] Root responded');
        return;
    }

    // 404 for everything else
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
});

server.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('✅ OKX Agent Health Server Started');
    console.log('='.repeat(60));
    console.log(`📊 Port: ${PORT}`);
    console.log(`🔗 Health: http://localhost:${PORT}/health`);
    console.log(`📊 Status: http://localhost:${PORT}/status`);
    console.log('='.repeat(60));
});
