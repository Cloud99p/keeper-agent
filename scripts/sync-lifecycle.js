/**
 * Lifecycle Log Sync Script
 * 
 * Automatically syncs lifecycle_log.json from root to dashboard folder
 * for live dashboard updates.
 * 
 * Usage: node scripts/sync-lifecycle.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_LOG = path.join(__dirname, '../lifecycle_log.json');
const DASHBOARD_LOG = path.join(__dirname, '../dashboard/lifecycle_log.json');

console.log('='.repeat(60));
console.log('🔄 Lifecycle Log Auto-Sync');
console.log('='.repeat(60));
console.log(`📁 Source: ${ROOT_LOG}`);
console.log(`📁 Target: ${DASHBOARD_LOG}`);
console.log('🔄 Syncing every 2 seconds...');
console.log('='.repeat(60));
console.log('Press Ctrl+C to stop');
console.log('='.repeat(60));

// Initial sync
if (fs.existsSync(ROOT_LOG)) {
  fs.copyFileSync(ROOT_LOG, DASHBOARD_LOG);
  console.log(`✅ Initial sync complete: ${new Date().toLocaleTimeString()}`);
} else {
  console.log('⏳ Waiting for lifecycle_log.json to be created...');
}

// Auto-sync every 2 seconds
let lastSize = fs.existsSync(ROOT_LOG) ? fs.statSync(ROOT_LOG).size : 0;

setInterval(() => {
  if (!fs.existsSync(ROOT_LOG)) {
    process.stdout.write('⏳ Waiting for lifecycle_log.json...\r');
    return;
  }
  
  const currentSize = fs.statSync(ROOT_LOG).size;
  
  // Only copy if file changed
  if (currentSize !== lastSize) {
    fs.copyFileSync(ROOT_LOG, DASHBOARD_LOG);
    lastSize = currentSize;
    console.log(`✅ Synced (${currentSize} bytes) - ${new Date().toLocaleTimeString()}`);
  }
}, 2000);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Sync stopped');
  process.exit(0);
});
