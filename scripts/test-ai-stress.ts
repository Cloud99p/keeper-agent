/**
 * AI Agent Stress Test - Failure Reasoning Limits
 * 
 * Tests multiple failure scenarios to evaluate AI decision-making
 */

import dotenv from 'dotenv';
dotenv.config();

import { JitoService } from '../src/jito.js';
import { YellowstoneService } from '../src/yellowstone.js';
import { LifecycleTracker } from '../src/lifecycle.js';
import { FailureReasoningAgent } from '../src/ai-agent.js';
import { loadConfig } from '../src/config.js';

async function runStressTest() {
  console.log('================================================================================');
  console.log('AI AGENT STRESS TEST - Failure Reasoning Limits');
  console.log('================================================================================\n');

  const config = loadConfig();
  config.debug = true;
  config.agentMaxRetries = 5;
  config.agentMinConfidence = 0.3;

  const yellowstone = new YellowstoneService(config);
  const lifecycle = new LifecycleTracker(config);
  const agent = new FailureReasoningAgent(config);
  const jito = new JitoService(config, yellowstone, lifecycle, agent);

  try {
    await yellowstone.initialize();
    await jito.initialize();
    console.log('\n[TEST] Services initialized\n');

    // Test 1: Blockhash Expiry
    console.log('\n=== TEST 1: Blockhash Expiry (160 slots) ===');
    jito.enableFaultInjection();
    (jito as any).faultType = 'blockhash_expiry';
    (jito as any).faultDelaySlots = 160;
    (jito as any).faultDelayMs = 64000;
    
    await submitTestBundle(jito, 1);

    // Test 2: Network Congestion
    console.log('\n\n=== TEST 2: Network Congestion (5000ms delay) ===');
    jito.enableFaultInjection();
    (jito as any).faultType = 'network_congestion';
    (jito as any).faultDelayMs = 5000;
    
    await submitTestBundle(jito, 2);

    // Test 3: Leader Skip
    console.log('\n\n=== TEST 3: Leader Skip Simulation ===');
    jito.enableFaultInjection();
    (jito as any).faultType = 'leader_skip';
    (jito as any).faultSimulateSkip = true;
    
    await submitTestBundle(jito, 3);

    // Test 4: Normal (Recovery Test)
    console.log('\n\n=== TEST 4: Normal Operation (Recovery Test) ===');
    await submitTestBundle(jito, 4, true);

  } catch (error: any) {
    console.error('[FATAL] Test failed:', error.message);
  } finally {
    // Save lifecycle log to file
    try {
      await lifecycle.saveToFile('./lifecycle_log.json');
      console.log('\n✅ Lifecycle log saved to lifecycle_log.json');
    } catch (saveError: any) {
      console.error('❌ Failed to save lifecycle log:', saveError.message);
    }
    
    console.log('\n================================================================================');
    console.log('STRESS TEST COMPLETE');
    console.log('================================================================================');
  }
}

async function submitTestBundle(jito: JitoService, bundleNum: number, noFault = false) {
  try {
    console.log(`\n[TEST] Submitting bundle ${bundleNum}...`);
    
    await jito.submitBundle({
      amount: 1_000_000,
      recipient: (jito as any).tipAccounts[0],
    });
    
    console.log(`[TEST] Bundle ${bundleNum} completed`);
  } catch (error: any) {
    console.log(`[TEST] Bundle ${bundleNum} failed: ${error.message.substring(0, 150)}`);
  }
  
  // Delay between tests
  await new Promise(resolve => setTimeout(resolve, 3000));
}

runStressTest().catch(console.error);
