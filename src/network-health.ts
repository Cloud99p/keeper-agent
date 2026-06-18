/**
 * Network Health Calculator
 * 
 * Computes a 0-100 health score from 4 independent signals:
 * - Confirmation latency (40 points): processed→confirmed delta
 * - Skip rate (25 points): leader skip rate
 * - Leader quality (20 points): historical success rate
 * - Tip volatility (15 points): tip floor stability
 * 
 * Inspired by KAIROS implementation for SuperteamNG bounty
 */

import { Connection, PublicKey } from '@solana/web3.js';

export interface NetworkHealth {
  score: number;              // 0-100
  confirmationLatencyMs: number;
  skipRate: number;           // 0.0-1.0
  leaderQuality: number;      // 0.0-1.0
  tipVolatility: number;      // 0.0-1.0 (lower = more stable = better)
  status: 'healthy' | 'degraded' | 'congested';
  timestamp: number;
}

export interface HealthSignals {
  latencyScore: number;       // 0-100
  skipScore: number;          // 0-100
  leaderScore: number;        // 0-100
  tipScore: number;           // 0-100
}

export class NetworkHealthCalculator {
  private connection: Connection;
  private recentLatencies: number[] = [];
  private recentSkipRates: number[] = [];
  private recentTips: number[] = [];
  private leaderHistory: Map<string, { successes: number; total: number }> = new Map();

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Calculate comprehensive network health score
   */
  async calculateHealth(): Promise<NetworkHealth> {
    // Signal 1: Confirmation latency (40 points)
    const latencyScore = await this.calcLatencyScore();
    
    // Signal 2: Skip rate (25 points)
    const skipScore = await this.calcSkipScore();
    
    // Signal 3: Leader quality (20 points)
    const leaderScore = await this.calcLeaderScore();
    
    // Signal 4: Tip volatility (15 points)
    const tipScore = await this.calcTipScore();
    
    // Weighted total
    const totalScore = Math.round(
      latencyScore * 0.40 +
      skipScore * 0.25 +
      leaderScore * 0.20 +
      tipScore * 0.15
    );
    
    // Determine status
    let status: 'healthy' | 'degraded' | 'congested';
    if (totalScore >= 70) {
      status = 'healthy';
    } else if (totalScore >= 40) {
      status = 'degraded';
    } else {
      status = 'congested';
    }
    
    const health: NetworkHealth = {
      score: totalScore,
      confirmationLatencyMs: this.recentLatencies[this.recentLatencies.length - 1] || 0,
      skipRate: this.recentSkipRates[this.recentSkipRates.length - 1] || 0,
      leaderQuality: leaderScore / 100,
      tipVolatility: 1 - (tipScore / 100),
      status,
      timestamp: Date.now(),
    };
    
    return health;
  }

  /**
   * Signal 1: Confirmation Latency Score (40 points)
   * 
   * Healthy: <1000ms = 100 points
   * Degraded: 1000-3000ms = 50-99 points
   * Congested: >3000ms = 0-49 points
   */
  private async calcLatencyScore(): Promise<number> {
    const latency = this.recentLatencies[this.recentLatencies.length - 1] || 2000;
    
    if (latency < 800) return 100;
    if (latency > 5000) return 0;
    
    // Linear interpolation: 800ms=100, 5000ms=0
    return Math.max(0, Math.min(100, Math.round(100 - ((latency - 800) / 4200) * 100)));
  }

  /**
   * Signal 2: Skip Rate Score (25 points)
   * 
   * <10% skip = 100 points
   * >30% skip = 0 points
   */
  private async calcSkipScore(): Promise<number> {
    const skipRate = this.recentSkipRates[this.recentSkipRates.length - 1] || 0.15;
    
    if (skipRate < 0.05) return 100;
    if (skipRate > 0.35) return 0;
    
    // Linear interpolation: 5%=100, 35%=0
    return Math.max(0, Math.min(100, Math.round(100 - ((skipRate - 0.05) / 0.30) * 100)));
  }

  /**
   * Signal 3: Leader Quality Score (20 points)
   * 
   * Based on historical success rate of recent leaders
   * >90% = 100 points
   * <50% = 0 points
   */
  private async calcLeaderScore(): Promise<number> {
    if (this.leaderHistory.size === 0) {
      return 75; // Default if no history
    }
    
    let totalSuccesses = 0;
    let totalAttempts = 0;
    
    for (const [, stats] of this.leaderHistory) {
      totalSuccesses += stats.successes;
      totalAttempts += stats.total;
    }
    
    if (totalAttempts === 0) return 75;
    
    const successRate = totalSuccesses / totalAttempts;
    
    if (successRate > 0.90) return 100;
    if (successRate < 0.50) return 0;
    
    // Linear interpolation: 50%=0, 90%=100
    return Math.round((successRate - 0.50) / 0.40 * 100);
  }

  /**
   * Signal 4: Tip Volatility Score (15 points)
   * 
   * Low volatility (stable tip floor) = high score
   * High volatility (erratic tips) = low score
   */
  private async calcTipScore(): Promise<number> {
    if (this.recentTips.length < 3) {
      return 80; // Default if insufficient data
    }
    
    // Calculate coefficient of variation (std dev / mean)
    const mean = this.recentTips.reduce((a, b) => a + b, 0) / this.recentTips.length;
    const variance = this.recentTips.reduce((sum, tip) => sum + Math.pow(tip - mean, 2), 0) / this.recentTips.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / mean;
    
    // CV < 0.2 = stable (100 points)
    // CV > 0.8 = volatile (0 points)
    if (cv < 0.15) return 100;
    if (cv > 0.8) return 0;
    
    return Math.max(0, Math.min(100, Math.round(100 - ((cv - 0.15) / 0.65) * 100)));
  }

  /**
   * Record latency measurement from lifecycle tracking
   */
  recordLatency(latencyMs: number) {
    this.recentLatencies.push(latencyMs);
    if (this.recentLatencies.length > 20) {
      this.recentLatencies.shift();
    }
  }

  /**
   * Record skip rate measurement
   */
  recordSkipRate(skipRate: number) {
    this.recentSkipRates.push(skipRate);
    if (this.recentSkipRates.length > 10) {
      this.recentSkipRates.shift();
    }
  }

  /**
   * Record tip amount for volatility tracking
   */
  recordTip(tipLamports: number) {
    this.recentTips.push(tipLamports);
    if (this.recentTips.length > 15) {
      this.recentTips.shift();
    }
  }

  /**
   * Update leader statistics
   */
  recordLeaderOutcome(leaderId: string, success: boolean) {
    if (!this.leaderHistory.has(leaderId)) {
      this.leaderHistory.set(leaderId, { successes: 0, total: 0 });
    }
    
    const stats = this.leaderHistory.get(leaderId)!;
    stats.total++;
    if (success) {
      stats.successes++;
    }
  }

  /**
   * Get health signals breakdown (for AI agent)
   */
  async getSignals(): Promise<HealthSignals> {
    return {
      latencyScore: await this.calcLatencyScore(),
      skipScore: await this.calcSkipScore(),
      leaderScore: await this.calcLeaderScore(),
      tipScore: await this.calcTipScore(),
    };
  }

  /**
   * Get formatted health summary for AI agent prompt
   */
  async getAiContext(): Promise<string> {
    const health = await this.calculateHealth();
    const signals = await this.getSignals();
    
    return `
NETWORK HEALTH ASSESSMENT:
- Overall Score: ${health.score}/100 (${health.status})
- Confirmation Latency: ${health.confirmationLatencyMs}ms (Score: ${signals.latencyScore}/100)
- Skip Rate: ${(health.skipRate * 100).toFixed(1)}% (Score: ${signals.skipScore}/100)
- Leader Quality: ${(health.leaderQuality * 100).toFixed(1)}% (Score: ${signals.leaderScore}/100)
- Tip Volatility: ${(health.tipVolatility * 100).toFixed(1)}% (Score: ${signals.tipScore}/100)

RECOMMENDATIONS:
${health.score >= 70 ? '- Network is healthy - proceed with normal tips' : ''}
${health.score >= 40 && health.score < 70 ? '- Network is degraded - consider +25-50% tip increase' : ''}
${health.score < 40 ? '- Network is congested - consider +50-100% tip increase or pause submissions' : ''}
`.trim();
  }
}
