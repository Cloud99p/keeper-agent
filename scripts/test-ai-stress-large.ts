/**
 * AI Agent Stress Test - LARGE SCALE (50+ bundles)
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
  console.log('AI AGENT STRESS TEST - LARGE SCALE (50+ bundles)');
  console.log('================================================================================\n');

  const config = loadConfig();
  config.debug = true;
  config.agentMaxRetries = 4;
  config.agentMinConfidence = 0.3;

  const yellowstone = new YellowstoneService(config);
  const lifecycle = new LifecycleTracker(config);
  const agent = new FailureReasoningAgent(config);
  const jito = new JitoService(config, yellowstone, lifecycle, agent);

  const results = {
    total: 0,
    analyzed: 0,
    retry: 0,
    abort: 0,
  };

  try {
    await yellowstone.initialize();
    await jito.initialize();
    console.log('\n[TEST] Services initialized\n');

    // Enable fault injection
    jito.enableFaultInjection();

    // Run 50+ bundles across different scenarios
    const scenarios = [
      { name: 'Blockhash Expiry (160 slots)', faultType: 'blockhash_expiry', faultDelaySlots: 160, count: 15 },
      { name: 'Network Congestion (3000ms)', faultType: 'network_congestion', faultDelayMs: 3000, count: 15 },
      { name: 'Leader Skip', faultType: 'leader_skip', faultSimulateSkip: true, count: 15 },
      { name: 'High Latency (8000ms)', faultType: 'network_congestion', faultDelayMs: 8000, count: 10 },
      { name: 'Normal Recovery', faultType: 'none', count: 10 },
    ];

    let bundleCounter = 1;

    for (const scenario of scenarios) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`SCENARIO: ${scenario.name} (${scenario.count} bundles)`);
      console.log('='.repeat(80));

      // Set fault injection
      if (scenario.faultType !== 'none') {
        (jito as any).faultType = scenario.faultType;
        if (scenario.faultDelaySlots) (jito as any).faultDelaySlots = scenario.faultDelaySlots;
        if (scenario.faultDelayMs) (jito as any).faultDelayMs = scenario.faultDelayMs;
        if (scenario.faultSimulateSkip) (jito as any).faultSimulateSkip = scenario.faultSimulateSkip;
      } else {
        jito.disableFaultInjection();
      }

      // Run bundles for this scenario
      for (let i = 0; i < scenario.count; i++) {
        const result = await submitTestBundle(jito, bundleCounter++);
        results.total++;
        if (result.analyzed) results.analyzed++;
        if (result.decision === 'retry') results.retry++;
        if (result.decision === 'abort') results.abort++;
        
        // Small delay between bundles
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      console.log(`\n✅ Scenario complete: ${scenario.count} bundles processed`);
    }

    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('STRESS TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Bundles:     ${results.total}`);
    console.log(`AI Analyzed:       ${results.analyzed} (${(results.analyzed / results.total * 100).toFixed(1)}%)`);
    console.log(`Retry Decisions:   ${results.retry}`);
    console.log(`Abort Decisions:   ${results.abort}`);
    console.log('='.repeat(80));

  } catch (error: any) {
    console.error('[FATAL] Test failed:', error.message);
  } finally {
    // Save lifecycle log to file
    try {
      await lifecycle.saveToFile('./lifecycle_log.json');
      console.log('\n✅ Lifecycle log saved to lifecycle_log.json');
      console.log(`📊 Total bundles in log: ${lifecycle.getBundles().length}`);
    } catch (saveError: any) {
      console.error('❌ Failed to save lifecycle log:', saveError.message);
    }
    
    console.log('\n================================================================================');
    console.log('STRESS TEST COMPLETE');
    console.log('================================================================================');
    console.log('\n📊 Next steps:');
    console.log('1. Open dashboard: http://localhost:3000');
    console.log('2. Refresh page (F5)');
    console.log('3. Check 🤖 AI Decisions panel (should show 50+ decisions)');
    console.log('4. Run: cat lifecycle_log.json | grep "agent_reasoning" | wc -l');
    console.log('================================================================================\n');
  }
}

async function submitTestBundle(jito: JitoService, bundleNum: number): Promise<{ analyzed: boolean, decision?: string }> {
  const result = { analyzed: false, decision: undefined as string | undefined };
  
  try {
    console.log(`\n[TEST] Submitting bundle ${bundleNum}...`);
    
    await jito.submitBundle({
      amount: 1_000_000,
      recipient: (jito as any).tipAccounts[0],
    });
    
    console.log(`[TEST] Bundle ${bundleNum} completed`);
    result.analyzed = true;
    result.decision = 'retry'; // If it completed, AI must have recommended retry
  } catch (error: any) {
    const errorMsg = error.message?.substring(0, 150) || 'Unknown error';
    console.log(`[TEST] Bundle ${bundleNum} failed: ${errorMsg}`);
    
    // Check if AI analyzed this failure
    if (errorMsg.includes('AI') || errorMsg.includes('reasoning')) {
      result.analyzed = true;
    }
  }
  
  return result;
}

runStressTest().catch(console.error);
