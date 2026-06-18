/**
 * Simple HTTP Server for TX-Stack Dashboard
 * 
 * Usage: node scripts/dashboard-server.js
 * Then open: http://localhost:3000
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const DASHBOARD_DIR = path.join(__dirname, '../dashboard');

// Fix __dirname for ES modules

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

    // Default to index.html
    let filePath = path.join(DASHBOARD_DIR, req.url === '/' ? 'index.html' : req.url);
    
    // Special case: lifecycle_log.json is in root folder (allowed for dashboard)
    if (req.url === '/lifecycle_log.json') {
        // Try both root folder and dashboard folder
        const rootLog = path.join(__dirname, '../lifecycle_log.json');
        const dashboardLog = path.join(DASHBOARD_DIR, 'lifecycle_log.json');
        
        let logFile = null;
        if (fs.existsSync(rootLog)) {
            logFile = rootLog;
            console.log(`[DASHBOARD] Serving lifecycle_log.json from root folder`);
        } else if (fs.existsSync(dashboardLog)) {
            logFile = dashboardLog;
            console.log(`[DASHBOARD] Serving lifecycle_log.json from dashboard folder`);
        }
        
        if (logFile) {
            // Serve the file directly
            fs.readFile(logFile, (err, content) => {
                if (err) {
                    console.error(`[DASHBOARD] Error reading lifecycle_log.json: ${err.message}`);
                    res.writeHead(500);
                    res.end('Server Error');
                } else {
                    console.log(`[DASHBOARD] Serving ${content.length} bytes of lifecycle data`);
                    res.writeHead(200, { 
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(content, 'utf-8');
                }
            });
            return;
        } else {
            // Return empty array if file doesn't exist yet
            console.log('[DASHBOARD] No lifecycle_log.json found in root or dashboard folder');
            res.writeHead(200, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end('[]');
            return;
        }
    }

    // Security: Prevent directory traversal
    if (!filePath.startsWith(DASHBOARD_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    // Get file extension
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Read and serve file
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // File not found, serve index.html for SPA routing
                if (ext === '') {
                    fs.readFile(path.join(DASHBOARD_DIR, 'index.html'), (err, content) => {
                        if (err) {
                            res.writeHead(500);
                            res.end('Server Error');
                        } else {
                            res.writeHead(200, { 'Content-Type': 'text/html' });
                            res.end(content, 'utf-8');
                        }
                    });
                } else {
                    res.writeHead(404);
                    res.end('Not Found');
                }
            } else {
                res.writeHead(500);
                res.end('Server Error');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('🚀 TX-Stack Dashboard Server');
    console.log('='.repeat(60));
    console.log(`📊 Dashboard running at: http://localhost:${PORT}`);
    console.log(`📁 Serving from: ${DASHBOARD_DIR}`);
    console.log('🔄 Auto-refreshes lifecycle_log.json every 5 seconds');
    console.log('='.repeat(60));
    console.log('Press Ctrl+C to stop');
    console.log('='.repeat(60));
});
