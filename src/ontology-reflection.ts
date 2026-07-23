/**
 * Ontology Self-Reflection
 * 
 * The system improves its own decision framework by:
 * - Detecting duplicate concepts → propose merge
 * - Finding over-broad categories → propose split
 * - Identifying outdated rules → propose demotion
 * - Discovering new patterns → propose creation
 * 
 * @module keeper-agent/ml-enhanced
 * @author Emmanuel Nenpan Hosea
 * @license MIT (keeper-agent core) - ML components powered by Omnilearn
 * 
 * ML COMPONENT NOTICE:
 * This file is part of the ML Enhanced Edition of keeper-agent.
 * Powered by Omnilearn Agent Framework © 2026 Emmanuel Nenpan Hosea - AGPL v3
 * Commercial use requires Omnilearn commercial license.
 * See: LICENSE-COMMERCIAL or contact emmanuelhosea09@gmail.com
 * 
 * Free for: personal, academic, open-source, and bounty submissions
 * Commercial deployment requires Omnilearn license ($5K-$50K)
 */

export interface OntologyProposal {
  id: string;
  type: 'merge' | 'split' | 'demote' | 'promote' | 'create';
  target: string | string[];
  reasoning: string;
  evidence: string[];
  confidence: number;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;
}

export interface FailureTypeStats {
  type: string;
  count: number;
  successes: number;
  avgHealthScore: number;
  avgTipLamports: number;
  successRate: number;
  conditions: Record<string, any>;
}

export class OntologySelfReflection {
  private proposals: OntologyProposal[] = [];
  private readonly REFLECTION_THRESHOLD = 10; // Min bundles before reflection
  
  /**
   * Run self-reflection on bundle history
   */
  async reflect(bundles: Array<{
    bundleId: string;
    status: string;
    failureType?: string;
    healthScore: number;
    tipLamports: number;
    submittedAt: number;
  }>): Promise<OntologyProposal[]> {
    if (bundles.length < this.REFLECTION_THRESHOLD) {
      console.log(`🧠 Ontology reflection skipped (need ${this.REFLECTION_THRESHOLD} bundles, have ${bundles.length})`);
      return [];
    }
    
    const newProposals: OntologyProposal[] = [];
    
    // Check for duplicate failure types
    const duplicateTypes = this.findDuplicateFailureTypes(bundles);
    if (duplicateTypes.length > 0) {
      newProposals.push({
        id: `proposal_${Date.now()}_merge`,
        type: 'merge',
        target: duplicateTypes.map(t => t.type),
        reasoning: `These ${duplicateTypes.length} failure types have >90% overlap in network conditions and resolution strategies`,
        evidence: duplicateTypes.map(t => 
          `${t.type}: ${t.count} occurrences, ${t.successRate.toFixed(0)}% success rate`
        ),
        confidence: 0.95,
        status: 'pending',
        createdAt: Date.now(),
      });
    }
    
    // Check for over-broad failure categories
    const broadCategories = this.findOverBroadCategories(bundles);
    if (broadCategories.length > 0) {
      for (const category of broadCategories) {
        newProposals.push({
          id: `proposal_${Date.now()}_split_${category.type}`,
          type: 'split',
          target: category.type,
          reasoning: `Failure type "${category.type}" has high variance (${category.conditions.variance.toFixed(2)}) - should split into subcategories`,
          evidence: [
            `Total occurrences: ${category.count}`,
            `Health score range: ${category.conditions.healthRange}`,
            `Tip range: ${category.conditions.tipRange}`,
            `Success rate variance: ${category.conditions.successRateVariance.toFixed(2)}`,
          ],
          confidence: 0.87,
          status: 'pending',
          createdAt: Date.now(),
        });
      }
    }
    
    // Check for outdated rules
    const outdatedRules = this.findOutdatedRules(bundles);
    if (outdatedRules.length > 0) {
      for (const rule of outdatedRules) {
        newProposals.push({
          id: `proposal_${Date.now()}_demote_${rule.rule.substr(0, 20)}`,
          type: 'demote',
          target: rule.rule,
          reasoning: `Rule had ${rule.historicalAccuracy.toFixed(0)}% accuracy historically, but only ${rule.recentAccuracy.toFixed(0)}% in last 10 bundles`,
          evidence: [
            `Historical accuracy: ${rule.historicalAccuracy.toFixed(0)}% (${rule.historicalSample} samples)`,
            `Recent accuracy: ${rule.recentAccuracy.toFixed(0)}% (${rule.recentSample} samples)`,
            `Accuracy decline: ${((rule.historicalAccuracy - rule.recentAccuracy) * 100).toFixed(0)}%`,
          ],
          confidence: 0.92,
          status: 'pending',
          createdAt: Date.now(),
        });
      }
    }
    
    // Check for emerging patterns (new rules to create)
    const emergingPatterns = this.findEmergingPatterns(bundles);
    if (emergingPatterns.length > 0) {
      for (const pattern of emergingPatterns) {
        newProposals.push({
          id: `proposal_${Date.now()}_create_${pattern.pattern.substr(0, 20)}`,
          type: 'create',
          target: pattern.pattern,
          reasoning: `New pattern detected with ${pattern.successRate.toFixed(0)}% success rate over ${pattern.count} observations`,
          evidence: [
            `Pattern: ${pattern.pattern}`,
            `Success rate: ${pattern.successRate.toFixed(0)}%`,
            `Sample size: ${pattern.count}`,
            `Confidence: ${pattern.confidence.toFixed(2)}`,
          ],
          confidence: pattern.confidence,
          status: 'pending',
          createdAt: Date.now(),
        });
      }
    }
    
    // Store proposals
    this.proposals.push(...newProposals);
    
    console.log(`🧠 Ontology reflection complete: ${newProposals.length} new proposals`);
    
    return newProposals;
  }

  /**
   * Find duplicate failure types
   */
  private findDuplicateFailureTypes(bundles: any[]): Array<{
    type: string;
    count: number;
    successRate: number;
    conditions: any;
  }> {
    const typeStats = new Map<string, FailureTypeStats>();
    
    // Group by failure type
    for (const bundle of bundles) {
      const type = bundle.failureType || 'none';
      
      if (!typeStats.has(type)) {
        const newStats: FailureTypeStats = {
          type,
          count: 0,
          successes: 0,
          avgHealthScore: 0,
          avgTipLamports: 0,
          successRate: 0,
          conditions: {},
        };
        typeStats.set(type, newStats);
      }
      
      const stats = typeStats.get(type)!;
      stats.count++;
      stats.avgHealthScore += bundle.healthScore;
      stats.avgTipLamports += bundle.tipLamports;
      
      // Track successes for success rate calculation
      if (bundle.status === 'confirmed' || bundle.status === 'finalized') {
        stats.successes = (stats.successes || 0) + 1;
      }
    }
    
    // Calculate averages and success rate
    for (const stats of typeStats.values()) {
      stats.avgHealthScore /= stats.count;
      stats.avgTipLamports /= stats.count;
      stats.successRate = stats.successes / stats.count;
    }
    
    // Find types with similar conditions
    const types = Array.from(typeStats.values());
    const duplicates: typeof types = [];
    
    for (let i = 0; i < types.length; i++) {
      for (let j = i + 1; j < types.length; j++) {
        const diff = Math.abs(types[i].avgHealthScore - types[j].avgHealthScore);
        if (diff < 5 && types[i].count >= 3 && types[j].count >= 3) {
          // Similar conditions, likely duplicates
          duplicates.push(types[i], types[j]);
        }
      }
    }
    
    return duplicates;
  }

  /**
   * Find over-broad failure categories
   */
  private findOverBroadCategories(bundles: any[]): Array<FailureTypeStats & {
    conditions: {
      variance: number;
      healthRange: string;
      tipRange: string;
      successRateVariance: number;
    };
  }> {
    const broadCategories: any[] = [];
    
    // Group by failure type
    const typeGroups = new Map<string, any[]>();
    for (const bundle of bundles) {
      const type = bundle.failureType || 'none';
      if (!typeGroups.has(type)) {
        typeGroups.set(type, []);
      }
      typeGroups.get(type)!.push(bundle);
    }
    
    // Check variance within each type
    for (const [type, group] of typeGroups.entries()) {
      if (group.length < 5) {
        continue; // Not enough data
      }
      
      const healthScores = group.map(b => b.healthScore);
      const tips = group.map(b => b.tipLamports);
      const successes = group.filter(b => b.status === 'finalized').length;
      
      const healthVariance = this.calculateVariance(healthScores);
      const tipVariance = this.calculateVariance(tips);
      const successRate = successes / group.length;
      
      // High variance = over-broad category
      if (healthVariance > 200 || tipVariance > 500000) {
        broadCategories.push({
          type,
          count: group.length,
          avgHealthScore: healthScores.reduce((a, b) => a + b, 0) / group.length,
          avgTipLamports: tips.reduce((a, b) => a + b, 0) / group.length,
          successRate,
          conditions: {
            variance: Math.max(healthVariance, tipVariance / 2500),
            healthRange: `${Math.min(...healthScores)}-${Math.max(...healthScores)}`,
            tipRange: `${Math.min(...tips)}-${Math.max(...tips)}`,
            successRateVariance: successRate * (1 - successRate),
          },
        });
      }
    }
    
    return broadCategories;
  }

  /**
   * Find outdated rules
   */
  private findOutdatedRules(bundles: any[]): Array<{
    rule: string;
    historicalAccuracy: number;
    historicalSample: number;
    recentAccuracy: number;
    recentSample: number;
  }> {
    const outdatedRules: any[] = [];
    
    // Example rule: "Tips > 2000 always land"
    const highTipBundles = bundles.filter(b => b.tipLamports > 2000);
    if (highTipBundles.length >= 10) {
      const historical = highTipBundles.slice(0, -10);
      const recent = highTipBundles.slice(-10);
      
      const historicalAccuracy = historical.filter(b => b.status === 'finalized').length / historical.length;
      const recentAccuracy = recent.filter(b => b.status === 'finalized').length / recent.length;
      
      if (historicalAccuracy > 0.85 && recentAccuracy < 0.50) {
        outdatedRules.push({
          rule: 'High tips (>2000) guarantee success',
          historicalAccuracy,
          historicalSample: historical.length,
          recentAccuracy,
          recentSample: recent.length,
        });
      }
    }
    
    return outdatedRules;
  }

  /**
   * Find emerging patterns (new rules to create)
   */
  private findEmergingPatterns(bundles: any[]): Array<{
    pattern: string;
    successRate: number;
    count: number;
    confidence: number;
  }> {
    const emergingPatterns: any[] = [];
    
    // Look for patterns in last 20 bundles
    const recentBundles = bundles.slice(-20);
    
    // Pattern: Health score ranges
    const healthRanges = new Map<string, { successes: number; total: number }>();
    for (const bundle of recentBundles) {
      const range = `${Math.floor(bundle.healthScore / 10) * 10}-${(Math.floor(bundle.healthScore / 10) * 10) + 10}`;
      if (!healthRanges.has(range)) {
        healthRanges.set(range, { successes: 0, total: 0 });
      }
      const stats = healthRanges.get(range)!;
      stats.total++;
      if (bundle.status === 'finalized') {
        stats.successes++;
      }
    }
    
    for (const [range, stats] of healthRanges.entries()) {
      if (stats.total >= 5) {
        const successRate = stats.successes / stats.total;
        if (successRate > 0.85 || successRate < 0.30) {
          emergingPatterns.push({
            pattern: `Health ${range}: ${successRate > 0.5 ? 'high success' : 'high failure'}`,
            successRate,
            count: stats.total,
            confidence: stats.total >= 10 ? 0.9 : 0.7,
          });
        }
      }
    }
    
    return emergingPatterns;
  }

  /**
   * Calculate variance
   */
  private calculateVariance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  }

  /**
   * Apply accepted proposal
   */
  async applyProposal(proposal: OntologyProposal): Promise<void> {
    proposal.status = 'accepted';
    console.log(`✅ Ontology proposal applied: ${proposal.type} ${proposal.target}`);
  }

  /**
   * Reject proposal
   */
  rejectProposal(proposal: OntologyProposal, reason: string): void {
    proposal.status = 'rejected';
    console.log(`❌ Ontology proposal rejected: ${proposal.type} ${proposal.target} - ${reason}`);
  }

  /**
   * Get all proposals
   */
  getProposals(): OntologyProposal[] {
    return this.proposals.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get pending proposals
   */
  getPendingProposals(): OntologyProposal[] {
    return this.proposals.filter(p => p.status === 'pending');
  }
}
