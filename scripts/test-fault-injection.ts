/**
 * Fault Injection Test Script
 * 
 * Demonstrates AI autonomous failure recovery:
 * 1. Inject blockhash expiry fault (wait 160 slots before submit)
 * 2. Agent detects failure
 * 3. Agent autonomously decides to retry
 * 4. Agent executes retry with new parameters
 * 
 * This is the core AI demonstration for the project.
 */

import { YellowstoneService } from '../src/yellowstone.js';
import { LifecycleTracker } from '../src/lifecycle.js';
import { FailureReasoningAgent } from '../src/ai-agent.js';
import { JitoService } from '../src/jito.js';
import { loadConfig } from '../src/config.js';

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('FAULT INJECTION TEST - AI Autonomous Failure Recovery');
  console.log('='.repeat(80));

  // Load configuration
  const config = loadConfig();

  // Initialize services
  const yellowstone = new YellowstoneService(config);
  const lifecycle = new LifecycleTracker(config);
  const agent = new FailureReasoningAgent(config);

  try {
    await yellowstone.initialize();
    await yellowstone.updateLeaderSchedule();
  } catch (error: any) {
    console.error('Failed to initialize Yellowstone:', error.message);
    return;
  }

  // Create Jito service
  const jito = new JitoService(config, yellowstone, lifecycle, agent);
  
  // Initialize Jito
  await jito.initialize();
  
  // ENABLE FAULT INJECTION - Blockhash Expiry
  console.log('\n[FAULT] Enabling blockhash expiry fault injection...');
  jito.enableFaultInjection('blockhash_expiry');
  
  console.log('[FAULT] This bundle will have its blockhash expired before submission.');
  console.log('[FAULT] The AI agent should detect this and autonomously retry.\n');

  // Submit bundle WITH fault injection
  console.log('[RUN] Submitting bundle with injected blockhash expiry fault...\n');
  const result = await jito.submitBundle();

  console.log('\n' + '='.repeat(80));
  console.log('TEST RESULT');
  console.log('='.repeat(80));
  console.log('Bundle ID:', result.bundleId);
  console.log('Success:', result.success);
  console.log('Error:', result.error);
  
  if (result.lifecycle) {
    console.log('\nLifecycle:', JSON.stringify(result.lifecycle, null, 2));
  }

  // Get fault stats
  const faultStats = jito.getFaultStats();
  console.log('\nFault Injection Stats:', faultStats);

  // Get lifecycle log
  console.log('\nLifecycle Log:', JSON.stringify(lifecycle.exportLog(), null, 2));

  console.log('\n' + '='.repeat(80));
  console.log('TEST COMPLETE');
  console.log('='.repeat(80) + '\n');
}

main().catch(console.error);
