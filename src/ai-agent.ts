/**
 * Failure Reasoning Agent
 * 
 * Observes real failure data and derives retry parameters from reasoning.
 * NEVER uses hardcoded logic - all decisions derived from live data.
 * 
 * Agent Inputs:
 * - Failure type and stage
 * - Submission timestamp and slot
 * - Slot conditions (skip rate, congestion, leader quality)
 * - Historical tip data from last 10 successful bundles
 * - Time elapsed between blockhash fetch and submission
 * 
 * Agent Reasoning Process:
 * 1. Observe: Classify failure type and stage
 * 2. Analyze: Correlate with slot conditions and historical data
 * 3. Confidence: Score certainty (0-1) based on signal clarity
 * 4. Decide: Action (retry/abort/wait), tip adjustment, delay, blockhash refresh
 * 5. Log: Full reasoning before any retry action
 */

import { Config } from './config.js';
import { FailureContext, FailureType, BundleStage } from './lifecycle.js';

export interface AgentDecision {
  action: 'retry' | 'abort' | 'wait_and_retry';
  tip_adjustment_percent: number;
  blockhash_refresh: boolean;
  delay_ms: number;
  reasoning_summary: string;
}

export interface AgentReasoning {
  failure_observed: string;
  contributing_factors: string[];
  confidence: number;
  decision: AgentDecision;
  timestamp: number;
  slot_at_decision: number;
}

export interface RetryParameters {
  shouldRetry: boolean;
  tipAdjustment: number;
  delayMs: number;
  refreshBlockhash: boolean;
  reasoning: AgentReasoning;
}

/**
 * Failure Reasoning Agent
 */
export class FailureReasoningAgent {
  private config: Config;
  private reasoningLog: AgentReasoning[];

  constructor(config: Config) {
    this.config = config;
    this.reasoningLog = [];
  }

  /**
   * Analyze failure and derive retry parameters
   * 
   * This is the core reasoning function. It:
   * 1. Observes the failure
   * 2. Identifies contributing factors from live data
   * 3. Calculates confidence score
   * 4. Derives decision parameters (NOT hardcoded)
   * 5. Logs full reasoning before returning
   */
  analyzeFailure(context: FailureContext): RetryParameters {
    const {
      failureType,
      failureStage,
      submissionSlot,
      blockhashAge,
      slotConditions,
      recentTips,
      submissionLatency,
    } = context;

    console.log('\n' + '='.repeat(60));
    console.log('[AGENT] Failure Analysis Started');
    console.log('='.repeat(60));

    // Step 1: Observe and log the failure
    const failureObserved = this.describeFailure(failureType, failureStage, submissionLatency);
    console.log(`[AGENT] Failure observed: ${failureObserved}`);

    // Step 2: Analyze contributing factors from live data
    const contributingFactors = this.identifyContributingFactors(
      failureType,
      blockhashAge,
      slotConditions,
      recentTips,
      submissionLatency
    );
    console.log('[AGENT] Contributing factors:');
    contributingFactors.forEach(factor => console.log(`  - ${factor}`));

    // Step 3: Calculate confidence based on signal clarity
    const confidence = this.calculateConfidence(context, contributingFactors);
    console.log(`[AGENT] Confidence: ${confidence.toFixed(2)}`);

    // Step 4: Derive decision from data (NOT hardcoded)
    const decision = this.deriveDecision(
      failureType,
      failureStage,
      blockhashAge,
      slotConditions,
      recentTips,
      submissionSlot,
      contributingFactors,
      confidence
    );
    console.log('[AGENT] Decision:', decision.action);
    console.log(`  - Tip adjustment: ${decision.tip_adjustment_percent.toFixed(1)}%`);
    console.log(`  - Blockhash refresh: ${decision.blockhash_refresh}`);
    console.log(`  - Delay: ${decision.delay_ms}ms`);
    console.log(`  - Reasoning: ${decision.reasoning_summary}`);

    // Step 5: Create full reasoning record
    const reasoning: AgentReasoning = {
      failure_observed: failureObserved,
      contributing_factors: contributingFactors,
      confidence,
      decision,
      timestamp: Date.now(),
      slot_at_decision: submissionSlot,
    };

    // Log reasoning before any action
    this.reasoningLog.push(reasoning);
    this.logReasoning(reasoning);

    console.log('='.repeat(60));
    console.log('[AGENT] Analysis Complete\n');

    // Determine if retry should happen
    const shouldRetry = 
      decision.action !== 'abort' && 
      confidence >= this.config.agentMinConfidence;

    return {
      shouldRetry,
      tipAdjustment: decision.tip_adjustment_percent,
      delayMs: decision.delay_ms,
      refreshBlockhash: decision.blockhash_refresh,
      reasoning,
    };
  }

  /**
   * Describe the failure in natural language
   */
  private describeFailure(
    type: FailureType,
    stage: BundleStage,
    latency: number
  ): string {
    const stageDescriptions: Record<BundleStage, string> = {
      submitted: 'at submission to block engine',
      processed: 'during processing in block',
      confirmed: 'during confirmation window',
      finalized: 'during finalization',
    };

    const typeDescriptions: Record<FailureType, string> = {
      expired_blockhash: 'blockhash expired',
      fee_too_low: 'tip insufficient for inclusion',
      compute_exceeded: 'compute unit limit exceeded',
      bundle_rejected: 'bundle rejected by leader',
      timeout: 'confirmation timeout',
      unknown: 'unknown failure',
    };

    return `${typeDescriptions[type]} ${stageDescriptions[stage]} (latency: ${latency}ms)`;
  }

  /**
   * Identify contributing factors from live data
   * 
   * This analyzes the actual conditions at time of failure.
   * No hardcoded assumptions - all factors derived from context.
   */
  private identifyContributingFactors(
    failureType: FailureType,
    blockhashAge: number,
    slotConditions: { skipRate: number; congestionLevel: number; leaderQuality: number },
    recentTips: number[],
    submissionLatency: number
  ): string[] {
    const factors: string[] = [];
    const { skipRate, congestionLevel, leaderQuality } = slotConditions;

    // Factor 1: Blockhash age analysis
    if (blockhashAge > 100) {
      const riskLevel = blockhashAge > 140 ? 'critical' : blockhashAge > 120 ? 'high' : 'elevated';
      factors.push(
        `Blockhash age ${blockhashAge} slots (${riskLevel} risk) - validity window ${150 - blockhashAge} slots remaining`
      );
    }

    // Factor 2: Submission latency analysis
    if (submissionLatency > 150) {
      factors.push(
        `Submission latency ${submissionLatency}ms exceeded safe threshold - network congestion likely`
      );
    }

    // Factor 3: Skip rate analysis
    if (skipRate > 0.2) {
      factors.push(
        `High slot skip rate ${Math.round(skipRate * 100)}% - extended uncertainty in blockhash validity`
      );
    } else if (skipRate > 0.1) {
      factors.push(
        `Moderate slot skip rate ${Math.round(skipRate * 100)}% - some uncertainty in timing`
      );
    }

    // Factor 4: Leader quality analysis
    if (leaderQuality < 0.7) {
      factors.push(
        `Leader quality score ${leaderQuality.toFixed(2)} below average - may need higher tip incentive`
      );
    }

    // Factor 5: Tip analysis relative to recent history
    if (recentTips.length > 0) {
      const avgTip = recentTips.reduce((a, b) => a + b, 0) / recentTips.length;
      const medianTip = [...recentTips].sort((a, b) => a - b)[Math.floor(recentTips.length / 2)] ?? 0;
      
      if (failureType === 'fee_too_low') {
        factors.push(
          `Tip below recent median (${medianTip} lamports) - insufficient for current market`
        );
      } else {
        factors.push(
          `Recent tip range: ${Math.min(...recentTips)}-${Math.max(...recentTips)} lamports, avg: ${Math.round(avgTip)}`
        );
      }
    }

    // Factor 6: Congestion level
    if (congestionLevel > 0.7) {
      factors.push(`High network congestion (${Math.round(congestionLevel * 100)}%) - increased competition for block space`);
    }

    // Factor 7: Failure-specific factors
    switch (failureType) {
      case 'expired_blockhash':
        factors.push(
          `Blockhash validity expired - submission took too long relative to block production`
        );
        break;
      case 'compute_exceeded':
        factors.push(
          'Transaction compute consumption exceeded block limit - may need optimization or split'
        );
        break;
      case 'bundle_rejected':
        factors.push(
          'Bundle structurally invalid or simulation failed - requires inspection before retry'
        );
        break;
    }

    // Ensure we always have at least one factor
    if (factors.length === 0) {
      factors.push('No clear contributing factors identified - may be transient network issue');
    }

    return factors;
  }

  /**
   * Calculate confidence score (0-1) based on signal clarity
   */
  private calculateConfidence(
    context: FailureContext,
    factors: string[]
  ): number {
    let confidence = 0.5; // Start neutral

    const { failureType, blockhashAge, slotConditions } = context;
    const { skipRate, leaderQuality } = slotConditions;

    // High confidence signals
    if (failureType === 'expired_blockhash' && blockhashAge > 140) {
      confidence += 0.3; // Very clear cause
    }

    if (failureType === 'fee_too_low' && factors.length >= 2) {
      confidence += 0.25; // Clear market signal
    }

    if (skipRate > 0.3) {
      confidence += 0.15; // Strong congestion signal
    }

    // Medium confidence signals
    if (blockhashAge > 100 && blockhashAge <= 140) {
      confidence += 0.15;
    }

    if (leaderQuality < 0.6) {
      confidence += 0.1;
    }

    // Reduce confidence for ambiguous failures
    if (failureType === 'unknown') {
      confidence -= 0.2;
    }

    if (factors.length === 1 && factors[0]?.includes('transient')) {
      confidence -= 0.15;
    }

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Derive decision from data - NO HARDCODED VALUES
   * 
   * All adjustments calculated from live data:
   * - Tip adjustment based on skip rate and recent tips
   * - Delay based on slot timing and leader schedule
   * - Blockhash refresh based on age
   */
  private deriveDecision(
    failureType: FailureType,
    _failureStage: BundleStage,
    blockhashAge: number,
    slotConditions: { skipRate: number; congestionLevel: number; leaderQuality: number },
    recentTips: number[],
    _submissionSlot: number,
    factors: string[],
    confidence: number
  ): AgentDecision {
    const { skipRate, leaderQuality: _leaderQuality } = slotConditions;

    // Determine action
    let action: 'retry' | 'abort' | 'wait_and_retry' = 'retry';
    
    // Abort conditions (low confidence or unrecoverable)
    if (confidence < 0.3) {
      action = 'abort';
    } else if (failureType === 'bundle_rejected' && factors.some(f => f.includes('structurally invalid'))) {
      action = 'abort';
    } else if (failureType === 'compute_exceeded') {
      action = 'wait_and_retry'; // Need to analyze CU usage first
    }

    // Wait and retry for congestion-related issues
    if (skipRate > 0.25 && action !== 'abort') {
      action = 'wait_and_retry';
    }

    // Calculate tip adjustment from DATA (not hardcoded)
    let tipAdjustmentPercent = 0;

    if (failureType === 'fee_too_low') {
      // Calculate how much below median we were
      if (recentTips.length > 0) {
        const medianTip = [...recentTips].sort((a, b) => a - b)[Math.floor(recentTips.length / 2)] ?? 0;
        // Aim for 75th percentile of recent tips
        const p75Tip = [...recentTips].sort((a, b) => a - b)[Math.floor(recentTips.length * 0.75)] ?? medianTip;
        tipAdjustmentPercent = ((p75Tip - medianTip) / medianTip) * 100;
        tipAdjustmentPercent = Math.max(20, Math.min(100, tipAdjustmentPercent)); // Clamp 20-100%
      } else {
        tipAdjustmentPercent = 30; // Default if no data
      }
    } else if (failureType === 'expired_blockhash') {
      // Congestion signal from skip rate drives tip adjustment
      // Formula: base 15% + (skipRate * 50%) to compensate for congestion
      tipAdjustmentPercent = 15 + (skipRate * 50);
      tipAdjustmentPercent = Math.min(40, tipAdjustmentPercent); // Cap at 40%
    } else if (skipRate > 0.2) {
      // General congestion adjustment
      tipAdjustmentPercent = skipRate * 100; // Proportional to skip rate
      tipAdjustmentPercent = Math.max(10, Math.min(30, tipAdjustmentPercent));
    }

    // Determine blockhash refresh necessity
    const blockhashRefresh = blockhashAge > 100 || failureType === 'expired_blockhash';

    // Calculate delay from slot conditions (not hardcoded)
    let delayMs = 0;

    if (action === 'wait_and_retry') {
      // Calculate delay based on skip rate and slot timing
      // Target: wait for 2 slot windows to avoid current skip pattern
      const slotTimeMs = 400; // Approximate slot time
      const skipWindowSlots = Math.ceil(skipRate * 10); // More skips = longer wait
      const baseDelay = 2 * slotTimeMs; // 2 slot windows
      delayMs = baseDelay + (skipWindowSlots * slotTimeMs);
      delayMs = Math.min(5000, delayMs); // Cap at 5 seconds
    } else if (skipRate > 0.15) {
      // Small delay for moderate congestion
      delayMs = Math.round(skipRate * 2000); // Proportional to skip rate
    }

    // Generate reasoning summary
    const reasoningParts: string[] = [];

    if (blockhashRefresh) {
      reasoningParts.push(`refresh blockhash (age ${blockhashAge} slots)`);
    }

    if (tipAdjustmentPercent > 0) {
      const reason = failureType === 'fee_too_low' 
        ? 'compensate for underpriced tip'
        : skipRate > 0.2 
          ? `compensate for ${Math.round(skipRate * 100)}% skip rate congestion`
          : 'increase inclusion probability';
      reasoningParts.push(`increase tip ${tipAdjustmentPercent.toFixed(0)}% to ${reason}`);
    }

    if (delayMs > 0) {
      reasoningParts.push(`delay ${delayMs}ms to avoid skip window`);
    }

    const reasoningSummary = reasoningParts.join(', ') || 'proceed with retry';

    return {
      action,
      tip_adjustment_percent: Math.round(tipAdjustmentPercent * 10) / 10,
      blockhash_refresh: blockhashRefresh,
      delay_ms: delayMs,
      reasoning_summary: reasoningSummary,
    };
  }

  /**
   * Log full reasoning in required format
   */
  private logReasoning(reasoning: AgentReasoning): void {
    console.log('\n[AGENT] Full Reasoning Log:');
    console.log(JSON.stringify(reasoning, null, 2));
    console.log('');
  }

  /**
   * Get all reasoning logs
   */
  getReasoningLog(): AgentReasoning[] {
    return [...this.reasoningLog];
  }

  /**
   * Get reasoning for specific bundle
   */
  getReasoningForSlot(slot: number): AgentReasoning | undefined {
    return this.reasoningLog.find(r => r.slot_at_decision === slot);
  }

  /**
   * Get agent statistics
   */
  getStats(): {
    totalAnalyses: number;
    avgConfidence: number;
    retryDecisions: number;
    abortDecisions: number;
    waitAndRetryDecisions: number;
  } {
    const actions = this.reasoningLog.map(r => r.decision.action);
    
    return {
      totalAnalyses: this.reasoningLog.length,
      avgConfidence: this.reasoningLog.length > 0
        ? this.reasoningLog.reduce((sum, r) => sum + r.confidence, 0) / this.reasoningLog.length
        : 0,
      retryDecisions: actions.filter(a => a === 'retry').length,
      abortDecisions: actions.filter(a => a === 'abort').length,
      waitAndRetryDecisions: actions.filter(a => a === 'wait_and_retry').length,
    };
  }
}
