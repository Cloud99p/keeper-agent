/**
 * Hebbian Tip Optimizer
 * 
 * "Neurons that fire together, wire together"
 * 
 * Learns optimal tip strategies through synaptic plasticity:
 * - Strengthen synapses for successful tip patterns
 * - Weaken synapses for failed tip patterns
 * - Apply synaptic decay to old patterns
 * 
 * @module tx-stack/ml-enhanced
 * @author Emmanuel Nenpan Hosea
 * @license MIT (tx-stack core) - ML components powered by Omnilearn
 * 
 * ML COMPONENT NOTICE:
 * This file is part of the ML Enhanced Edition of tx-stack.
 * Powered by Omnilearn Agent Framework © 2026 Emmanuel Nenpan Hosea - AGPL v3
 * Commercial use requires Omnilearn commercial license.
 * See: LICENSE-COMMERCIAL or contact emmanuelhosea09@gmail.com
 * 
 * Free for: personal, academic, open-source, and bounty submissions
 * Commercial deployment requires Omnilearn license ($5K-$50K)
 */

export interface SynapticWeight {
  pattern: string;
  weight: number; // Tip amount in lamports
  strength: number; // 0.0-1.0 (synaptic strength)
  successes: number;
  failures: number;
  lastActivated: number;
  createdAt: number;
}

export interface TipRecommendation {
  recommendedTip: number;
  confidence: number;
  pattern: string;
  alternativeTips: Array<{
    tip: number;
    confidence: number;
    pattern: string;
  }>;
}

export interface HebbianInsight {
  pattern: string;
  successRate: number;
  avgTip: number;
  strength: number;
  timesObserved: number;
  trend: 'strengthening' | 'weakening' | 'stable';
}

export class HebbianTipOptimizer {
  private synapticWeights: Map<string, SynapticWeight> = new Map();
  private readonly LEARNING_RATE = 0.1; // How much to adjust per outcome
  private readonly DECAY_RATE = 0.01; // Synaptic decay per bundle
  private readonly MIN_STRENGTH = 0.1; // Minimum strength before pruning
  
  /**
   * Learn from a bundle outcome
   */
  async learn(bundle: {
    tipLamports: number;
    status: string;
    healthScore: number;
    skipRate: number;
    leaderQuality: number;
  }): Promise<void> {
    const pattern = this.extractPattern(bundle);
    const success = bundle.status === 'finalized' || bundle.status === 'confirmed';
    
    // Get or create synaptic weight for this pattern
    let synapse = this.synapticWeights.get(pattern);
    
    if (!synapse) {
      synapse = {
        pattern,
        weight: bundle.tipLamports,
        strength: 0.5, // Start neutral
        successes: 0,
        failures: 0,
        lastActivated: Date.now(),
        createdAt: Date.now(),
      };
      this.synapticWeights.set(pattern, synapse);
    }
    
    // Hebbian learning: strengthen or weaken
    if (success) {
      this.strengthenSynapse(synapse, bundle.tipLamports);
    } else {
      this.weakenSynapse(synapse, bundle.tipLamports);
    }
    
    // Update activation timestamp
    synapse.lastActivated = Date.now();
    
    console.log(`🧠 Hebbian learning: ${pattern} → ${success ? 'strengthened' : 'weakened'} (strength: ${synapse.strength.toFixed(2)})`);
  }

  /**
   * Extract pattern signature from bundle context
   */
  private extractPattern(bundle: any): string {
    const healthRange = Math.floor(bundle.healthScore / 10) * 10;
    const skipRange = Math.floor((bundle.skipRate || 0.15) * 10) / 10;
    const leaderRange = Math.floor(bundle.leaderQuality * 10) / 10;
    
    return `health_${healthRange}__skip_${skipRange}__leader_${leaderRange}`;
  }

  /**
   * Strengthen synapse for successful outcomes
   */
  private strengthenSynapse(synapse: SynapticWeight, actualTip: number): void {
    synapse.successes++;
    
    // Move weight toward successful tip amount
    const tipDiff = actualTip - synapse.weight;
    synapse.weight += tipDiff * this.LEARNING_RATE;
    
    // Increase strength (capped at 1.0)
    synapse.strength = Math.min(1.0, synapse.strength + 0.05);
    
    // Boost confidence
    synapse.strength *= 1.02;
  }

  /**
   * Weaken synapse for failed outcomes
   */
  private weakenSynapse(synapse: SynapticWeight, actualTip: number): void {
    synapse.failures++;
    
    // Adjust weight away from failed tip amount
    const tipDiff = synapse.weight - actualTip;
    synapse.weight += tipDiff * this.LEARNING_RATE * 0.5;
    
    // Decrease strength (floored at MIN_STRENGTH)
    synapse.strength = Math.max(this.MIN_STRENGTH, synapse.strength - 0.08);
  }

  /**
   * Apply synaptic decay to all weights
   * (Old patterns gradually fade if not reinforced)
   */
  async applySynapticDecay(): Promise<void> {
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    
    for (const [pattern, synapse] of this.synapticWeights.entries()) {
      const age = now - synapse.lastActivated;
      const ageFactor = Math.min(age / maxAge, 1.0);
      
      // Older synapses decay faster
      synapse.strength *= (1.0 - (this.DECAY_RATE * ageFactor));
      
      // Prune very weak synapses
      if (synapse.strength < this.MIN_STRENGTH) {
        console.log(`🧠 Pruning weak synapse: ${pattern} (strength: ${synapse.strength.toFixed(2)})`);
        this.synapticWeights.delete(pattern);
      }
    }
    
    console.log(`🧠 Synaptic decay applied. Active synapses: ${this.synapticWeights.size}`);
  }

  /**
   * Get recommended tip for current conditions
   */
  async recommendTip(context: {
    healthScore: number;
    skipRate: number;
    leaderQuality: number;
  }): Promise<TipRecommendation> {
    const pattern = this.extractPattern(context);
    
    // Find exact pattern match
    let synapse = this.synapticWeights.get(pattern);
    
    if (synapse) {
      return {
        recommendedTip: Math.round(synapse.weight),
        confidence: synapse.strength,
        pattern,
        alternativeTips: [],
      };
    }
    
    // Find similar patterns
    const similarPatterns = this.findSimilarPatterns(pattern);
    
    if (similarPatterns.length > 0) {
      // Weighted average of similar patterns
      let totalWeight = 0;
      let weightedTip = 0;
      let weightedConfidence = 0;
      
      const alternatives: Array<{ tip: number; confidence: number; pattern: string }> = [];
      
      for (const sim of similarPatterns) {
        const simSynapse = this.synapticWeights.get(sim.pattern);
        if (simSynapse) {
          const similarityWeight = sim.similarity * simSynapse.strength;
          totalWeight += similarityWeight;
          weightedTip += simSynapse.weight * similarityWeight;
          weightedConfidence += simSynapse.strength * similarityWeight;
          
          alternatives.push({
            tip: Math.round(simSynapse.weight),
            confidence: simSynapse.strength,
            pattern: sim.pattern,
          });
        }
      }
      
      if (totalWeight > 0) {
        return {
          recommendedTip: Math.round(weightedTip / totalWeight),
          confidence: weightedConfidence / totalWeight,
          pattern: `${pattern} (interpolated from ${similarPatterns.length} similar)`,
          alternativeTips: alternatives.slice(0, 3),
        };
      }
    }
    
    // Fallback to default tip
    return {
      recommendedTip: 1000, // Default 1000 lamports
      confidence: 0.3,
      pattern: 'default (no learned patterns)',
      alternativeTips: [],
    };
  }

  /**
   * Find similar patterns using pattern string similarity
   */
  private findSimilarPatterns(targetPattern: string, limit: number = 5): Array<{
    pattern: string;
    similarity: number;
  }> {
    const candidates: Array<{ pattern: string; similarity: number }> = [];
    
    for (const [pattern] of this.synapticWeights.entries()) {
      if (pattern === targetPattern) {
        continue;
      }
      
      const similarity = this.patternSimilarity(targetPattern, pattern);
      if (similarity > 0.6) {
        candidates.push({ pattern, similarity });
      }
    }
    
    return candidates
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  /**
   * Calculate pattern string similarity (0.0-1.0)
   */
  private patternSimilarity(a: string, b: string): number {
    const partsA = a.split('__');
    const partsB = b.split('__');
    
    if (partsA.length !== partsB.length) {
      return 0;
    }
    
    let matchingParts = 0;
    
    for (let i = 0; i < partsA.length; i++) {
      const [typeA, valA] = partsA[i].split('_');
      const [typeB, valB] = partsB[i].split('_');
      
      if (typeA === typeB) {
        const numA = parseFloat(valA);
        const numB = parseFloat(valB);
        
        if (Math.abs(numA - numB) <= 10) {
          matchingParts++;
        }
      }
    }
    
    return matchingParts / partsA.length;
  }

  /**
   * Get learned insights
   */
  getInsights(): HebbianInsight[] {
    const insights: HebbianInsight[] = [];
    
    for (const [pattern, synapse] of this.synapticWeights.entries()) {
      const successRate = synapse.successes + synapse.failures > 0
        ? synapse.successes / (synapse.successes + synapse.failures)
        : 0;
      
      // Determine trend
      let trend: 'strengthening' | 'weakening' | 'stable';
      if (synapse.strength > 0.7) {
        trend = 'strengthening';
      } else if (synapse.strength < 0.4) {
        trend = 'weakening';
      } else {
        trend = 'stable';
      }
      
      insights.push({
        pattern,
        successRate,
        avgTip: Math.round(synapse.weight),
        strength: synapse.strength,
        timesObserved: synapse.successes + synapse.failures,
        trend,
      });
    }
    
    return insights.sort((a, b) => b.timesObserved - a.timesObserved);
  }

  /**
   * Identify "core neurons" - high-confidence successful patterns
   */
  identifyCoreNeurons(): SynapticWeight[] {
    const coreNeurons: SynapticWeight[] = [];
    
    for (const synapse of this.synapticWeights.values()) {
      const successRate = synapse.successes + synapse.failures > 0
        ? synapse.successes / (synapse.successes + synapse.failures)
        : 0;
      
      if (synapse.strength > 0.8 && successRate > 0.85 && synapse.timesObserved >= 5) {
        coreNeurons.push(synapse);
      }
    }
    
    return coreNeurons;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalSynapses: number;
    avgStrength: number;
    avgSuccessRate: number;
    coreNeurons: number;
  } {
    const synapses = Array.from(this.synapticWeights.values());
    const totalStrength = synapses.reduce((sum, s) => sum + s.strength, 0);
    const totalSuccessRate = synapses.reduce((sum, s) => 
      sum + (s.successes / (s.successes + s.failures || 1)), 0
    );
    
    return {
      totalSynapses: synapses.length,
      avgStrength: synapses.length > 0 ? totalStrength / synapses.length : 0,
      avgSuccessRate: synapses.length > 0 ? totalSuccessRate / synapses.length : 0,
      coreNeurons: this.identifyCoreNeurons().length,
    };
  }

  /**
   * Export learned patterns
   */
  export(): SynapticWeight[] {
    return Array.from(this.synapticWeights.values());
  }
}
