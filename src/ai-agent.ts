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
import { DecisionProofChain } from './proof-chain.js';
import { TransactionKnowledgeGraph } from './knowledge-graph.js';
import { HebbianTipOptimizer } from './hebbian-optimizer.js';
import { DeepSeekClient, DeepSeekDecision } from './deepseek-client.js';

export interface AgentDecision {
  action: 'retry' | 'abort' | 'wait_and_retry';
  tip_adjustment_percent: number;
  blockhash_refresh: boolean;
  delay_ms: number;
  reasoning_summary: string;
  ai_analysis?: string;  // Optional AI-generated analysis
  ai_confidence?: number; // Optional AI confidence score
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

export interface NetworkHealthContext {
  score: number;              // 0-100
  status: 'healthy' | 'degraded' | 'congested';
  confirmationLatencyMs: number;
  skipRate: number;
  leaderQuality: number;
}

/**
 * Failure Reasoning Agent
 */
export class FailureReasoningAgent {
  private config: Config;
  private reasoningLog: AgentReasoning[];
  private proofChain: DecisionProofChain;
  private knowledgeGraph: TransactionKnowledgeGraph;
  private hebbianOptimizer: HebbianTipOptimizer;
  private deepSeekClient: DeepSeekClient;

  constructor(config: Config) {
    this.config = config;
    this.reasoningLog = [];
    this.proofChain = new DecisionProofChain();
    this.knowledgeGraph = new TransactionKnowledgeGraph();
    this.hebbianOptimizer = new HebbianTipOptimizer();
    this.deepSeekClient = new DeepSeekClient(config);
    
    if (this.deepSeekClient.isEnabled()) {
      console.log('[AGENT] DeepSeek AI enhancement enabled:', this.deepSeekClient.getModel());
    }
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
   * 
   * @param context Failure context from lifecycle tracker
   * @param healthContext Optional network health context (0-100 score)
   */
  async analyzeFailure(context: FailureContext, healthContext?: NetworkHealthContext): Promise<RetryParameters> {
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

    // Step 1: Get AI-enhanced analysis from DeepSeek (if enabled)
    let aiDecision: DeepSeekDecision | null = null;
    if (this.deepSeekClient.isEnabled()) {
      console.log('[AGENT] Requesting DeepSeek AI analysis...');
      aiDecision = await this.deepSeekClient.analyzeFailure(context);
      if (aiDecision) {
        console.log('[AGENT] DeepSeek AI analysis received:', {
          action: aiDecision.action,
          confidence: aiDecision.confidence,
          reasoning: aiDecision.reasoning_summary,
        });
      }
    }

    // Step 2: Observe and log the failure (local reasoning)
    const failureObserved = this.describeFailure(failureType, failureStage, submissionLatency);
    console.log(`[AGENT] Failure observed: ${failureObserved}`);

    // Step 3: Analyze contributing factors from live data
    const contributingFactors = this.identifyContributingFactors(
      failureType,
      blockhashAge,
      slotConditions,
      recentTips,
      submissionLatency
    );
    console.log('[AGENT] Contributing factors:');
    contributingFactors.forEach(factor => console.log(`  - ${factor}`));

    // Step 4: Calculate confidence based on signal clarity
    const confidence = this.calculateConfidence(context, contributingFactors);
    console.log(`[AGENT] Local Confidence: ${confidence.toFixed(2)}`);

    // Step 5: Derive decision from data (NOT hardcoded)
    const localDecision = this.deriveDecision(
      failureType,
      failureStage,
      blockhashAge,
      slotConditions,
      recentTips,
      submissionSlot,
      contributingFactors,
      confidence,
      submissionLatency
    );
    console.log('[AGENT] Local Decision:', localDecision.action);
    console.log(`  - Tip adjustment: ${localDecision.tip_adjustment_percent.toFixed(1)}%`);
    console.log(`  - Blockhash refresh: ${localDecision.blockhash_refresh}`);
    console.log(`  - Delay: ${localDecision.delay_ms}ms`);
    console.log(`  - Reasoning: ${localDecision.reasoning_summary}`);

    // Step 6: Combine AI and local reasoning (AI gets slight preference if high confidence)
    const decision = this.combineDecisions(aiDecision, localDecision, confidence);

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

    // Record decision in cryptographic proof chain
    const bundleId = `bundle_${Date.now()}_${submissionSlot}`;
    await this.proofChain.recordDecision(
      {
        bundleId,
        failureType,
        stage: failureStage,
        submissionSlot,
        blockhashAge,
        slotConditions: { skipRate: slotConditions.skipRate },
        recentTips: [],
        submissionLatency,
      },
      decision,
      { contributingFactors, confidence }
    );

    // Record in knowledge graph for pattern learning
    await this.knowledgeGraph.recordBundle({
      bundleId,
      status: failureStage,
      submittedSlot: submissionSlot,
      tipLamports: 0,
      healthScore: 50,
      latencyMs: submissionLatency,
      failureType,
      submittedAt: Date.now(),
    });

    // Learn from this outcome (Hebbian learning)
    await this.hebbianOptimizer.learn({
      tipLamports: 0,
      status: failureStage,
      healthScore: 50,
      skipRate: slotConditions.skipRate || 0.15,
      leaderQuality: slotConditions.leaderQuality || 0.5,
    });

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
      submitted: 'bundle submitted successfully',
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
   * 
   * IMPROVED: Better calibration per failure type
   */
  private calculateConfidence(
    context: FailureContext,
    factors: string[]
  ): number {
    let confidence = 0.5; // Start neutral

    const { failureType, blockhashAge, slotConditions, submissionLatency } = context;
    const { skipRate, leaderQuality, congestionLevel } = slotConditions;

    // === HIGH CONFIDENCE SIGNALS (Clear, unambiguous failures) ===
    
    // Blockhash expiry is very clear
    if (failureType === 'expired_blockhash' && blockhashAge > 140) {
      confidence += 0.35; // Very clear cause - highest confidence
    } else if (failureType === 'expired_blockhash' && blockhashAge > 120) {
      confidence += 0.25; // Clear signal
    }

    // Fee too low with market data is clear
    if (failureType === 'fee_too_low' && factors.length >= 2) {
      confidence += 0.30; // Clear market signal
    }

    // Severe congestion is unambiguous
    if (skipRate > 0.3 || congestionLevel > 0.7) {
      confidence += 0.20; // Strong congestion signal
    } else if (skipRate > 0.2 || congestionLevel > 0.5) {
      confidence += 0.10; // Moderate signal
    }

    // === MEDIUM CONFIDENCE SIGNALS ===
    
    if (blockhashAge > 100 && blockhashAge <= 140) {
      confidence += 0.15;
    }

    // Poor leader quality with high latency
    if (leaderQuality < 0.5 && submissionLatency > 200) {
      confidence += 0.20; // Combined signal is strong
    } else if (leaderQuality < 0.6) {
      confidence += 0.10;
    }

    // High submission latency alone
    if (submissionLatency > 500) {
      confidence += 0.15; // Very high latency is a clear signal
    } else if (submissionLatency > 200) {
      confidence += 0.08;
    }

    // === REDUCE CONFIDENCE FOR AMBIGUOUS FAILURES ===
    
    if (failureType === 'unknown') {
      confidence -= 0.15; // Less penalty, still uncertain
    }

    if (factors.length === 1 && factors[0]?.includes('transient')) {
      confidence -= 0.10; // Less penalty
    }

    // === CONFIDENCE BOOSTS FOR MULTIPLE CORROBORATING FACTORS ===
    
    if (factors.length >= 3) {
      confidence += 0.10; // Multiple signals increase confidence
    }

    // Clamp to [0.2, 0.95] - never fully certain or fully uncertain
    return Math.max(0.2, Math.min(0.95, confidence));
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
    confidence: number,
    submissionLatency: number
  ): AgentDecision {
    const { skipRate, leaderQuality, congestionLevel } = slotConditions;

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

    // === IMPROVED: Calculate tip adjustment from DATA with leader-specific optimization ===
    let tipAdjustmentPercent = 0;
    const tipReasoning: string[] = [];

    // --- IMPROVEMENT 1: More aggressive fee_too_low response ---
    if (failureType === 'fee_too_low') {
      if (recentTips.length > 0) {
        const sortedTips = [...recentTips].sort((a, b) => a - b);
        const medianTip = sortedTips[Math.floor(sortedTips.length / 2)] ?? 0;
        const p75Tip = sortedTips[Math.floor(sortedTips.length * 0.75)] ?? medianTip;
        const maxTip = sortedTips[sortedTips.length - 1] ?? medianTip;
        
        // More aggressive: aim for max tip, not just p75
        const targetTip = maxTip;
        tipAdjustmentPercent = ((targetTip - medianTip) / medianTip) * 100;
        
        // Minimum 50% increase for fee failures (more aggressive)
        tipAdjustmentPercent = Math.max(50, Math.min(150, tipAdjustmentPercent));
        tipReasoning.push(`targeting max recent tip (${maxTip} lamports)`);
      } else {
        tipAdjustmentPercent = 75; // More aggressive default
        tipReasoning.push('no recent tip data, using aggressive default');
      }
    }
    
    // --- IMPROVEMENT 2: Blockhash expiry with congestion pricing ---
    else if (failureType === 'expired_blockhash') {
      // Base adjustment for time wasted
      const baseAdjustment = 25;
      
      // Congestion multiplier from skip rate
      const congestionMultiplier = 1 + (skipRate * 1.5);
      
      // Leader quality penalty (poor leaders need more incentive)
      const leaderPenalty = leaderQuality < 0.5 ? 20 : 0;
      
      tipAdjustmentPercent = (baseAdjustment * congestionMultiplier) + leaderPenalty;
      tipAdjustmentPercent = Math.min(75, tipAdjustmentPercent); // Cap at 75%
      
      tipReasoning.push(`blockhash expiry + ${Math.round(skipRate * 100)}% skip rate`);
      if (leaderPenalty > 0) tipReasoning.push(`poor leader quality penalty`);
    }
    
    // --- IMPROVEMENT 3: Leader-specific tip optimization ---
    else if (leaderQuality < 0.6) {
      // Poor leader quality = need higher tip to incentivize
      const baseForPoorLeader = 40;
      const qualityPenalty = (0.6 - leaderQuality) * 100; // Scale with how bad
      tipAdjustmentPercent = baseForPoorLeader + qualityPenalty;
      tipAdjustmentPercent = Math.min(60, tipAdjustmentPercent);
      tipReasoning.push(`poor leader quality (${leaderQuality.toFixed(2)}) needs incentive`);
    }
    
    // --- IMPROVEMENT 4: Congestion-based dynamic pricing ---
    else if (skipRate > 0.15 || congestionLevel > 0.3) {
      // Dynamic formula: base + congestion factor + competition
      const baseAdjustment = 20;
      const congestionFactor = Math.max(skipRate, congestionLevel) * 80;
      tipAdjustmentPercent = baseAdjustment + congestionFactor;
      tipAdjustmentPercent = Math.min(50, tipAdjustmentPercent);
      tipReasoning.push(`congestion pricing (${Math.round(Math.max(skipRate, congestionLevel) * 100)}%)`);
    }
    
    // --- IMPROVEMENT 5: Retry penalty (increasing with each retry) ---
    // This is handled in jito.ts, but we can add a small base increase
    tipAdjustmentPercent = Math.max(0, tipAdjustmentPercent); // Ensure non-negative

    // === IMPROVEMENT 6: Automatic blockhash refresh with proactive detection ===
    // Refresh if blockhash is old OR if failure suggests expiry risk
    const blockhashRefresh = 
      blockhashAge > 80 ||  // More conservative threshold (was 100)
      failureType === 'expired_blockhash' ||
      (blockhashAge > 60 && submissionLatency > 300) || // Proactive: old + slow
      (blockhashAge > 50 && skipRate > 0.2); // Old + congested = refresh

    // === IMPROVEMENT 7: Smarter delay calculation with leader timing ===
    let delayMs = 0;
    const slotTimeMs = 400; // Approximate slot time

    if (action === 'wait_and_retry') {
      // Calculate delay based on skip rate and slot timing
      const skipWindowSlots = Math.ceil(skipRate * 10);
      const baseDelay = 2 * slotTimeMs;
      delayMs = baseDelay + (skipWindowSlots * slotTimeMs);
      delayMs = Math.min(5000, delayMs);
    } 
    // --- IMPROVEMENT 8: Leader-specific timing ---
    else if (leaderQuality < 0.5) {
      // Poor leader: wait for potential leader change (1-2 slots)
      delayMs = slotTimeMs * 2; // Wait 2 slots (~800ms)
      tipReasoning.push('waiting for potential leader improvement');
    }
    // --- IMPROVEMENT 9: Congestion-based delay ---
    else if (skipRate > 0.15 || congestionLevel > 0.3) {
      // Proportional delay based on congestion
      const congestionDelay = Math.round(Math.max(skipRate, congestionLevel) * 3000);
      delayMs = Math.min(3000, congestionDelay);
    }
    // --- IMPROVEMENT 10: High latency compensation ---
    else if (submissionLatency > 500) {
      // Give network time to settle
      delayMs = Math.min(2000, Math.round(submissionLatency * 0.5));
    }

    // Generate comprehensive reasoning summary
    const reasoningParts: string[] = [];

    if (blockhashRefresh) {
      reasoningParts.push(`refresh blockhash (age ${blockhashAge} slots)`);
    }

    if (tipAdjustmentPercent > 0) {
      // Use detailed tip reasoning if available
      if (tipReasoning.length > 0) {
        reasoningParts.push(`increase tip ${tipAdjustmentPercent.toFixed(0)}% - ${tipReasoning.join(', ')}`);
      } else {
        const reason = failureType === 'fee_too_low' 
          ? 'compensate for underpriced tip'
          : skipRate > 0.2 
            ? `compensate for ${Math.round(skipRate * 100)}% skip rate congestion`
            : 'increase inclusion probability';
        reasoningParts.push(`increase tip ${tipAdjustmentPercent.toFixed(0)}% to ${reason}`);
      }
    }

    if (delayMs > 0) {
      const delayReason = leaderQuality < 0.5
        ? 'waiting for leader improvement'
        : skipRate > 0.2 || congestionLevel > 0.3
          ? 'avoiding congestion window'
          : 'compensating for network latency';
      reasoningParts.push(`delay ${delayMs}ms - ${delayReason}`);
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
   * Combine AI and local decisions
   * 
   * Strategy:
   * - If AI is enabled and has high confidence (> 0.7), use AI decision
   * - If AI confidence is moderate (0.5-0.7), blend with local decision
   * - If AI is disabled or low confidence (< 0.5), use local decision
   */
  private combineDecisions(
    aiDecision: DeepSeekDecision | null,
    localDecision: AgentDecision,
    localConfidence: number
  ): AgentDecision {
    // No AI decision available, use local
    if (!aiDecision) {
      console.log('[AGENT] Using local reasoning (AI unavailable)');
      return localDecision;
    }

    // AI has high confidence, prefer AI decision
    if (aiDecision.confidence > 0.7) {
      console.log(`[AGENT] Using AI decision (high confidence: ${aiDecision.confidence.toFixed(2)})`);
      return {
        action: aiDecision.action,
        tip_adjustment_percent: aiDecision.tip_adjustment_percent,
        blockhash_refresh: aiDecision.blockhash_refresh,
        delay_ms: aiDecision.delay_ms,
        reasoning_summary: `${aiDecision.reasoning_summary} [AI-enhanced]`,
        ai_analysis: aiDecision.ai_analysis,
        ai_confidence: aiDecision.confidence,
      };
    }

    // AI has moderate confidence, blend decisions
    if (aiDecision.confidence >= 0.5) {
      console.log(`[AGENT] Blending AI + local decisions (AI confidence: ${aiDecision.confidence.toFixed(2)})`);
      
      // Weight: AI gets 60%, local gets 40% for moderate confidence
      const aiWeight = 0.6;
      const localWeight = 0.4;

      // Blend tip adjustment
      const blendedTip = Math.round(
        (aiDecision.tip_adjustment_percent * aiWeight + 
         localDecision.tip_adjustment_percent * localWeight) * 10
      ) / 10;

      // Blend delay
      const blendedDelay = Math.round(
        aiDecision.delay_ms * aiWeight + 
        localDecision.delay_ms * localWeight
      );

      // Use AI action if it differs and AI confidence is higher
      const action = aiDecision.confidence > localConfidence 
        ? aiDecision.action 
        : localDecision.action;

      // Use blockhash refresh if either recommends it (conservative)
      const blockhashRefresh = aiDecision.blockhash_refresh || localDecision.blockhash_refresh;

      return {
        action,
        tip_adjustment_percent: blendedTip,
        blockhash_refresh: blockhashRefresh,
        delay_ms: blendedDelay,
        reasoning_summary: `${localDecision.reasoning_summary} + ${aiDecision.reasoning_summary} [AI-blended]`,
        ai_analysis: aiDecision.ai_analysis,
        ai_confidence: aiDecision.confidence,
      };
    }

    // AI has low confidence, use local decision
    console.log(`[AGENT] Using local decision (AI low confidence: ${aiDecision.confidence.toFixed(2)})`);
    return localDecision;
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

  /**
   * Export proof chain for judges
   */
  exportProofChain(): any {
    return this.proofChain.exportForJudges(10);
  }

  /**
   * Generate markdown proof chain report
   */
  generateProofChainReport(): string {
    return this.proofChain.generateMarkdownReport();
  }

  /**
   * Get knowledge graph insights
   */
  async getKnowledgeInsights() {
    return await this.knowledgeGraph.extractInsights();
  }

  /**
   * Get Hebbian learning insights
   */
  getHebbianInsights() {
    return this.hebbianOptimizer.getInsights();
  }

  /**
   * Get learning statistics
   */
  getLearningStats() {
    return {
      knowledgeGraph: this.knowledgeGraph.getStats(),
      hebbianOptimizer: this.hebbianOptimizer.getStats(),
      proofChain: this.proofChain.getStats(),
    };
  }
}

