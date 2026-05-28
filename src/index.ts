/**
 * Solana Transaction Stack - Main Orchestrator
 * 
 * Entry point that orchestrates the full workflow:
 * 1. Initialize Yellowstone gRPC connection
 * 2. Initialize Jito bundle service
 * 3. Submit multiple bundles to generate lifecycle data
 * 4. Handle failures with AI agent reasoning
 * 5. Export lifecycle log
 * 
 * Usage:
 *   npm run dev           # Run once
 *   npm run dev -- --test # Run test mode (fewer bundles)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './config.js';
import { YellowstoneService } from './yellowstone.js';
import { LifecycleTracker } from './lifecycle.js';
import { FailureReasoningAgent } from './ai-agent.js';
import { JitoService } from './jito.js';

// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main orchestrator class
 */
class SolanaTxStack {
  private config: any;
  private yellowstone: YellowstoneService;
  private lifecycle: LifecycleTracker;
  private agent: FailureReasoningAgent;
  private jito: JitoService;
  private isTestMode: boolean;

  constructor(isTestMode: boolean = false) {
    this.isTestMode = isTestMode;
    this.config = loadConfig();
    this.yellowstone = new YellowstoneService(this.config);
    this.lifecycle = new LifecycleTracker(this.config);
    this.agent = new FailureReasoningAgent(this.config);
    this.jito = new JitoService(this.config, this.yellowstone, this.lifecycle, this.agent);
  }

  /**
   * Initialize all services
   */
  async initialize(): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log('SOLANA TRANSACTION STACK - Initializing');
    console.log('='.repeat(60));
    console.log('Test mode:', this.isTestMode);
    console.log('Debug mode:', this.config.debug);
    console.log('');

    // Initialize Yellowstone
    await this.yellowstone.initialize();

    // Initialize Jito
    await this.jito.initialize();

    console.log('\n[INIT] All services initialized\n');
  }

  /**
   * Run the full workflow
   */
  async run(): Promise<void> {
    try {
      // Determine number of bundles to submit
      const bundleCount = this.isTestMode ? 3 : 12;
      console.log(`[RUN] Submitting ${bundleCount} bundles...\n`);

      const results: Array<{
        bundleId: string;
        success: boolean;
        tipAmount: number;
        error?: string;
      }> = [];

      // Submit bundles
      for (let i = 0; i < bundleCount; i++) {
        console.log(`\n>>> Bundle ${i + 1}/${bundleCount} <<<\n`);

        const result = await this.jito.submitBundle();
        results.push({
          bundleId: result.bundleId,
          success: result.success,
          tipAmount: result.lifecycle?.tip_amount ?? 0,
          error: result.error,
        });

        // Delay between bundles to avoid rate limiting
        if (i < bundleCount - 1) {
          const delay = this.isTestMode ? 2000 : 5000;
          console.log(`\n[WAIT] Waiting ${delay}ms before next bundle...\n`);
          await this.sleep(delay);
        }
      }

      // Generate report
      await this.generateReport(results);

      // Export lifecycle log
      await this.exportLifecycleLog();

      console.log('\n' + '='.repeat(60));
      console.log('SOLANA TRANSACTION STACK - Complete');
      console.log('='.repeat(60));

    } catch (error: any) {
      console.error('[RUN] Fatal error:', error);
      throw error;
    }
  }

  /**
   * Generate summary report
   */
  private async generateReport(
    results: Array<{ bundleId: string; success: boolean; tipAmount: number; error?: string }>
  ): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log('EXECUTION REPORT');
    console.log('='.repeat(60));

    const total = results.length;
    const successful = results.filter(r => r.success).length;
    const failed = total - successful;
    const successRate = ((successful / total) * 100).toFixed(1);

    const tips = results.map(r => r.tipAmount).filter(t => t > 0);
    const avgTip = tips.length > 0 ? tips.reduce((a, b) => a + b, 0) / tips.length : 0;
    const minTip = Math.min(...tips, 0);
    const maxTip = Math.max(...tips, 0);

    console.log(`Total bundles: ${total}`);
    console.log(`Successful: ${successful} (${successRate}%)`);
    console.log(`Failed: ${failed}`);
    console.log('');
    console.log('Tip Statistics:');
    console.log(`  Average: ${Math.round(avgTip)} lamports`);
    console.log(`  Min: ${minTip} lamports`);
    console.log(`  Max: ${maxTip} lamports`);
    console.log('');

    // Agent statistics
    const agentStats = this.agent.getStats();
    console.log('Agent Statistics:');
    console.log(`  Total analyses: ${agentStats.totalAnalyses}`);
    console.log(`  Average confidence: ${agentStats.avgConfidence.toFixed(2)}`);
    console.log(`  Retry decisions: ${agentStats.retryDecisions}`);
    console.log(`  Abort decisions: ${agentStats.abortDecisions}`);
    console.log(`  Wait & retry decisions: ${agentStats.waitAndRetryDecisions}`);
    console.log('');

    // Latency statistics
    const latencyStats = this.lifecycle.getLatencyStats();
    if (latencyStats) {
      console.log('Latency Statistics:');
      console.log(`  Avg processed: ${latencyStats.avg_processed_ms}ms`);
      console.log(`  Avg confirmed: ${latencyStats.avg_confirmed_ms}ms`);
      console.log(`  Avg finalized: ${latencyStats.avg_finalized_ms}ms`);
      console.log(`  P95 processed: ${latencyStats.p95_processed_ms}ms`);
      console.log(`  P95 confirmed: ${latencyStats.p95_confirmed_ms}ms`);
      console.log('');
    }

    // Failed bundles with agent reasoning
    const failedBundles = this.lifecycle.getFailedBundles();
    if (failedBundles.length > 0) {
      console.log('Failed Bundles with Agent Reasoning:');
      for (const bundle of failedBundles) {
        console.log(`\n  Bundle: ${bundle.bundle_id}`);
        console.log(`  Failure type: ${bundle.failure?.type}`);
        console.log(`  Stage: ${bundle.failure?.stage}`);
        console.log(`  Agent decision: ${bundle.failure?.agent_decision}`);
        console.log(`  Tip adjustment: ${bundle.failure?.retry_tip_adjustment}%`);
        console.log(`  Delay: ${bundle.failure?.retry_delay_ms}ms`);
      }
    }
  }

  /**
   * Export lifecycle log to JSON file
   */
  private async exportLifecycleLog(): Promise<void> {
    const logPath = path.resolve(__dirname, '..', this.config.lifecycleLogPath);
    const bundles = this.lifecycle.exportLog();

    const logData = {
      generated_at: new Date().toISOString(),
      total_bundles: bundles.length,
      successful: this.lifecycle.getSuccessfulBundles().length,
      failed: this.lifecycle.getFailedBundles().length,
      agent_analyses: this.agent.getReasoningLog().length,
      bundles,
      agent_reasoning_log: this.agent.getReasoningLog(),
    };

    fs.writeFileSync(logPath, JSON.stringify(logData, null, 2));
    console.log('\n[EXPORT] Lifecycle log written to:', logPath);
    console.log('[EXPORT] Total entries:', bundles.length);
    console.log('[EXPORT] Failed entries:', logData.failed);
    console.log('[EXPORT] Agent reasoning logs:', logData.agent_analyses);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const isTestMode = args.includes('--test') || args.includes('-t');

  try {
    const stack = new SolanaTxStack(isTestMode);
    await stack.initialize();
    await stack.run();
    process.exit(0);
  } catch (error: any) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run if executed directly
main();
