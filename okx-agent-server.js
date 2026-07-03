/**
 * OKX.AI ASP Agent Server
 * Provides HTTP endpoints for OKX marketplace to verify agent is online
 * 
 * Endpoints:
 * GET /health - Health check (OKX verifies this)
 * GET /status - Agent status and capabilities
 * POST /task - Receive task requests from OKX
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080;

// Agent metadata
const AGENT_INFO = {
  agentId: '3325',
  name: 'Solana MEV Agent',
  status: 'online',
  version: '1.0.0',
  capabilities: [
    'MEV bundle submission',
    'Jito Block Engine integration',
    'Real-time network monitoring',
    'AI-powered tip optimization',
    'Cryptographic audit trails'
  ],
  stats: {
    totalBundles: 65,
    successRate: '85%',
    averageLatency: '<100ms'
  },
  pricing: {
    standard: '10 USDT',
    complex: '20-30 USDT',
    highValue: '50 USDT'
  },
  contact: {
    email: 'emmanuelhosea09@gmail.com',
    responseTime: '<4 hours'
  }
};

// In-memory task queue
const taskQueue = [];

const server = http.createServer((req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);

  // Enable CORS for OKX.AI
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Route handling (parse URL without query strings)
  const urlPath = req.url.split('?')[0]; // Remove query strings
  
  if (urlPath === '/health' && req.method === 'GET') {
    handleHealthCheck(res);
  } else if (urlPath === '/status' && req.method === 'GET') {
    handleStatus(res);
  } else if (urlPath === '/task' && req.method === 'POST') {
    handleTaskRequest(req, res);
  } else if (urlPath === '/tasks' && req.method === 'GET') {
    handleGetTasks(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

function handleHealthCheck(res) {
  const response = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    agentId: AGENT_INFO.agentId,
    version: AGENT_INFO.version
  };
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response, null, 2));
  console.log('[HEALTH] OKX.AI health check responded');
}

function handleStatus(res) {
  const response = {
    ...AGENT_INFO,
    timestamp: new Date().toISOString(),
    queueLength: taskQueue.length,
    readyForTasks: true
  };
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response, null, 2));
}

function handleTaskRequest(req, res) {
  let body = '';
  
  req.on('data', chunk => {
    body += chunk.toString();
  });
  
  req.on('end', () => {
    try {
      const task = JSON.parse(body);
      
      // Validate task
      if (!task.taskId || !task.userId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid task format', required: ['taskId', 'userId'] }));
        return;
      }
      
      // Add to queue
      task.receivedAt = new Date().toISOString();
      task.status = 'pending';
      taskQueue.push(task);
      
      console.log(`[TASK] New task received: ${task.taskId} from user ${task.userId}`);
      
      // Save to file for persistence
      saveTaskQueue();
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        taskId: task.taskId,
        message: 'Task received and queued',
        estimatedResponse: '<4 hours',
        queuePosition: taskQueue.length
      }));
      
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON', details: error.message }));
    }
  });
}

function handleGetTasks(res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    tasks: taskQueue,
    count: taskQueue.length,
    timestamp: new Date().toISOString()
  }, null, 2));
}

function saveTaskQueue() {
  try {
    const taskFile = path.join(__dirname, 'task-queue.json');
    fs.writeFileSync(taskFile, JSON.stringify(taskQueue, null, 2));
    console.log('[TASK] Queue saved to task-queue.json');
  } catch (error) {
    console.error('[TASK] Failed to save queue:', error.message);
  }
}

// Load existing tasks on startup
function loadTaskQueue() {
  try {
    const taskFile = path.join(__dirname, 'task-queue.json');
    if (fs.existsSync(taskFile)) {
      const loaded = JSON.parse(fs.readFileSync(taskFile, 'utf-8'));
      taskQueue.push(...loaded);
      console.log(`[TASK] Loaded ${loaded.length} tasks from queue`);
    }
  } catch (error) {
    console.error('[TASK] Failed to load queue:', error.message);
  }
}

// Start server
loadTaskQueue();

server.listen(PORT, () => {
  console.log('\n🚀 OKX.AI ASP Agent Server Started');
  console.log(`   Port: ${PORT}`);
  console.log(`   Agent ID: ${AGENT_INFO.agentId}`);
  console.log(`   Status: ${AGENT_INFO.status}`);
  console.log('\n📡 Endpoints:');
  console.log(`   GET  /health  - Health check (for OKX verification)`);
  console.log(`   GET  /status  - Agent status and capabilities`);
  console.log(`   POST /task    - Receive task requests`);
  console.log(`   GET  /tasks   - View task queue`);
  console.log('\n✅ Agent is ready to receive tasks from OKX.AI marketplace\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM received, shutting down gracefully...');
  saveTaskQueue();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n🛑 SIGINT received, shutting down gracefully...');
  saveTaskQueue();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
