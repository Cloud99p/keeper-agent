/**
 * Lifecycle Tracker
 * 
 * Tracks bundle progression through confirmation stages.
 * Classifies failures and provides data for the Failure Reasoning Agent.
 * 
 * Stages:
 * - submitted: Bundle accepted by Block Engine
 * - processed: Transaction executed in block
 * - confirmed: 32 slots deep (confirmed commitment)
 * - finalized: 31+ confirmations after confirmed
 */

import { Config } from './config.js';

export type BundleStage = 'submitted' | 'processed' | 'confirmed' | 'finalized';

export type FailureType = 
  | 'expired_blockhash'
  | 'fee_too_low'
  | 'compute_exceeded'
  | 'bundle_rejected'
  | 'timeout'
  | 'unknown';

export interface StageTimestamp {
  timestamp: number;
  slot: number;
  latency_ms?: number;
}

export interface FailureInfo {
  occurred: boolean;
  stage: BundleStage;
  type: FailureType;
  details: string;
  agent_reasoning?: string;
  agent_decision?: string;
  retry_tip_adjustment?: number;
  retry_delay_ms?: number;
  retry_succeeded?: boolean;
}

export interface BundleLifecycle {
  bundle_id: string;
  tip_amount: number;
  submission_slot: number;
  blockhash_slot: number;
  stages: {
    submitted: StageTimestamp;
    processed?: StageTimestamp;
    confirmed?: StageTimestamp;
    finalized?: StageTimestamp;
  };
  failure?: FailureInfo;
  signature?: string;
  retry_count?: number;
}

export interface FailureContext {
  failureType: FailureType;
  failureStage: BundleStage;
  submissionSlot: number;
  submissionTimestamp: number;
  blockhashSlot: number;
  blockhashAge: number;
  slotConditions: {
    skipRate: number;
    congestionLevel: number;
    leaderQuality: number;
  };
  recentTips: number[];
  submissionLatency: number;
}

/**
 * Lifecycle tracker for bundle submissions
 */
export class LifecycleTracker {
  private config: Config;
  private bundles: Map<string, BundleLifecycle>;
  private recentTips: number[];
  private maxRecentTips: number;

  constructor(config: Config) {
    this.config = config;
    this.bundles = new Map();
    this.recentTips = [];
    this.maxRecentTips = 50; // Keep last 50 successful tips
  }

  /**
   * Create a new bundle lifecycle record
   */
  createBundle(
    bundleId: string,
    tipAmount: number,
    submissionSlot: number,
    blockhashSlot: number
  ): BundleLifecycle {
    const lifecycle: BundleLifecycle = {
      bundle_id: bundleId,
      tip_amount: tipAmount,
      submission_slot: submissionSlot,
      blockhash_slot: blockhashSlot,
      stages: {
        submitted: {
          timestamp: Date.now(),
          slot: submissionSlot,
        },
      },
      retry_count: 0,
    };

    this.bundles.set(bundleId, lifecycle);
    
    if (this.config.debug) {
      console.log('[LIFECYCLE] Created bundle:', bundleId, 'tip:', tipAmount);
    }

    return lifecycle;
  }

  /**
   * Mark bundle as submitted
   */
  markSubmitted(bundleId: string, slot: number, signature?: string): void {
    const lifecycle = this.bundles.get(bundleId);
    if (!lifecycle) {
      console.warn('[LIFECYCLE] Bundle not found:', bundleId);
      return;
    }

    lifecycle.stages.submitted = {
      timestamp: Date.now(),
      slot,
    };

    if (signature) {
      lifecycle.signature = signature;
    }

    if (this.config.debug) {
      console.log('[LIFECYCLE] Bundle submitted:', bundleId, 'slot:', slot);
    }
  }

  /**
   * Mark bundle as processed
   */
  markProcessed(bundleId: string, slot: number): void {
    const lifecycle = this.bundles.get(bundleId);
    if (!lifecycle) return;

    const submittedAt = lifecycle.stages.submitted.timestamp;
    const latency = Date.now() - submittedAt;

    lifecycle.stages.processed = {
      timestamp: Date.now(),
      slot,
      latency_ms: latency,
    };

    if (this.config.debug) {
      console.log('[LIFECYCLE] Bundle processed:', bundleId, 'latency:', latency, 'ms');
    }
  }

  /**
   * Mark bundle as confirmed
   */
  markConfirmed(bundleId: string, slot: number): void {
    const lifecycle = this.bundles.get(bundleId);
    if (!lifecycle) return;

    const submittedAt = lifecycle.stages.submitted.timestamp;
    const latency = Date.now() - submittedAt;

    lifecycle.stages.confirmed = {
      timestamp: Date.now(),
      slot,
      latency_ms: latency,
    };

    if (this.config.debug) {
      console.log('[LIFECYCLE] Bundle confirmed:', bundleId, 'latency:', latency, 'ms');
    }
  }

  /**
   * Mark bundle as finalized
   */
  markFinalized(bundleId: string, slot: number): void {
    const lifecycle = this.bundles.get(bundleId);
    if (!lifecycle) return;

    const submittedAt = lifecycle.stages.submitted.timestamp;
    const latency = Date.now() - submittedAt;

    lifecycle.stages.finalized = {
      timestamp: Date.now(),
      slot,
      latency_ms: latency,
    };

    // Record successful tip for future calculations
    this.recordSuccessfulTip(lifecycle.tip_amount);

    if (this.config.debug) {
      console.log('[LIFECYCLE] Bundle finalized:', bundleId, 'latency:', latency, 'ms');
    }
  }

  /**
   * Record failure with classification
   */
  markFailure(
    bundleId: string,
    stage: BundleStage,
    type: FailureType,
    details: string
  ): FailureInfo {
    const lifecycle = this.bundles.get(bundleId);
    if (!lifecycle) {
      throw new Error(`Bundle not found: ${bundleId}`);
    }

    const failure: FailureInfo = {
      occurred: true,
      stage,
      type,
      details,
    };

    lifecycle.failure = failure;

    console.log('[LIFECYCLE] Failure recorded:', {
      bundleId,
      stage,
      type,
      details,
    });

    return failure;
  }

  /**
   * Update failure with agent reasoning
   */
  updateFailureWithReasoning(
    bundleId: string,
    reasoning: string,
    decision: string,
    tipAdjustment: number,
    delayMs: number
  ): void {
    const lifecycle = this.bundles.get(bundleId);
    if (!lifecycle?.failure) return;

    lifecycle.failure.agent_reasoning = reasoning;
    lifecycle.failure.agent_decision = decision;
    lifecycle.failure.retry_tip_adjustment = tipAdjustment;
    lifecycle.failure.retry_delay_ms = delayMs;

    if (this.config.debug) {
      console.log('[LIFECYCLE] Failure updated with agent reasoning:', bundleId);
    }
  }

  /**
   * Mark retry outcome
   */
  markRetryOutcome(bundleId: string, succeeded: boolean): void {
    const lifecycle = this.bundles.get(bundleId);
    if (!lifecycle?.failure) return;

    lifecycle.failure.retry_succeeded = succeeded;
    lifecycle.retry_count = (lifecycle.retry_count ?? 0) + 1;

    if (this.config.debug) {
      console.log('[LIFECYCLE] Retry outcome:', bundleId, succeeded ? 'SUCCESS' : 'FAILED');
    }
  }

  /**
   * Record successful tip for future calculations
   */
  private recordSuccessfulTip(tipAmount: number): void {
    this.recentTips.push(tipAmount);
    
    // Keep only recent tips
    if (this.recentTips.length > this.maxRecentTips) {
      this.recentTips.shift();
    }
  }

  /**
   * Get recent successful tips
   */
  getRecentTips(count: number = 10): number[] {
    return this.recentTips.slice(-count);
  }

  /**
   * Get failure context for agent
   */
  getFailureContext(bundleId: string, slotConditions: {
    skipRate: number;
    congestionLevel: number;
    leaderQuality: number;
  }): FailureContext | null {
    const lifecycle = this.bundles.get(bundleId);
    if (!lifecycle?.failure) return null;

    const submittedAt = lifecycle.stages.submitted.timestamp;
    const submissionLatency = Date.now() - submittedAt;
    const blockhashAge = lifecycle.submission_slot - lifecycle.blockhash_slot;

    return {
      failureType: lifecycle.failure.type,
      failureStage: lifecycle.failure.stage,
      submissionSlot: lifecycle.submission_slot,
      submissionTimestamp: submittedAt,
      blockhashSlot: lifecycle.blockhash_slot,
      blockhashAge,
      slotConditions,
      recentTips: this.getRecentTips(10),
      submissionLatency,
    };
  }

  /**
   * Get bundle lifecycle
   */
  getBundle(bundleId: string): BundleLifecycle | undefined {
    return this.bundles.get(bundleId);
  }

  /**
   * Get all bundles
   */
  getAllBundles(): BundleLifecycle[] {
    return Array.from(this.bundles.values());
  }

  /**
   * Get bundles with failures
   */
  getFailedBundles(): BundleLifecycle[] {
    return Array.from(this.bundles.values()).filter(b => b.failure?.occurred);
  }

  /**
   * Get successful bundles
   */
  getSuccessfulBundles(): BundleLifecycle[] {
    return Array.from(this.bundles.values()).filter(b => !b.failure?.occurred && b.stages.finalized);
  }

  /**
   * Export lifecycle log to JSON
   */
  exportLog(): BundleLifecycle[] {
    return this.getAllBundles();
  }

  /**
   * Save lifecycle log to file
   */
  async saveToFile(filePath: string): Promise<void> {
    const fs = await import('fs');
    const bundles = this.getAllBundles();
    const logData = {
      generated_at: new Date().toISOString(),
      total_bundles: bundles.length,
      successful: bundles.filter(b => !b.failure).length,
      failed: bundles.filter(b => b.failure).length,
      agent_analyses: bundles.filter(b => b.failure?.agent_reasoning).length,
      bundles: bundles
    };
    fs.writeFileSync(filePath, JSON.stringify(logData, null, 2));
    console.log(`[LIFECYCLE] Saved ${bundles.length} bundles to ${filePath}`);
  }

  /**
   * Calculate latency statistics
   */
  getLatencyStats(): {
    avg_processed_ms: number;
    avg_confirmed_ms: number;
    avg_finalized_ms: number;
    p95_processed_ms: number;
    p95_confirmed_ms: number;
  } | null {
    const successful = this.getSuccessfulBundles();
    if (successful.length === 0) return null;

    const processedLatencies = successful
      .filter(b => b.stages.processed)
      .map(b => b.stages.processed!.latency_ms ?? 0);

    const confirmedLatencies = successful
      .filter(b => b.stages.confirmed)
      .map(b => b.stages.confirmed!.latency_ms ?? 0);

    const finalizedLatencies = successful
      .filter(b => b.stages.finalized)
      .map(b => b.stages.finalized!.latency_ms ?? 0);

    const percentile = (arr: number[], p: number): number => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const index = Math.floor(sorted.length * p);
      return sorted[Math.min(index, sorted.length - 1)] ?? 0;
    };

    const avg = (arr: number[]): number => 
      arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;

    return {
      avg_processed_ms: Math.round(avg(processedLatencies)),
      avg_confirmed_ms: Math.round(avg(confirmedLatencies)),
      avg_finalized_ms: Math.round(avg(finalizedLatencies)),
      p95_processed_ms: Math.round(percentile(processedLatencies, 0.95)),
      p95_confirmed_ms: Math.round(percentile(confirmedLatencies, 0.95)),
    };
  }
}

/**
 * Classify failure type from error message or condition
 */
export function classifyFailure(
  errorMessage: string,
  context: {
    blockhashAge: number;
    tipAmount: number;
    recentTipMedian: number;
    computeUnits?: number;
    computeLimit?: number;
  }
): FailureType {
  const lowerError = errorMessage.toLowerCase();

  // Expired blockhash
  if (
    lowerError.includes('blockhash expired') ||
    lowerError.includes('blockhash not found') ||
    context.blockhashAge > 150
  ) {
    return 'expired_blockhash';
  }

  // Fee too low
  if (
    lowerError.includes('fee') ||
    lowerError.includes('tip') ||
    lowerError.includes('insufficient funds') ||
    (context.tipAmount < context.recentTipMedian * 0.5)
  ) {
    return 'fee_too_low';
  }

  // Compute exceeded
  if (
    lowerError.includes('compute') ||
    lowerError.includes('program failed') ||
    (context.computeUnits && context.computeLimit && context.computeUnits > context.computeLimit)
  ) {
    return 'compute_exceeded';
  }

  // Bundle rejected
  if (
    lowerError.includes('rejected') ||
    lowerError.includes('invalid') ||
    lowerError.includes('simulation failed')
  ) {
    return 'bundle_rejected';
  }

  // Timeout
  if (lowerError.includes('timeout') || lowerError.includes('timed out')) {
    return 'timeout';
  }

  return 'unknown';
}
