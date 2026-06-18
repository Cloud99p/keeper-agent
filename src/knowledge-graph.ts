/**
 * Transaction Knowledge Graph
 * 
 * Stores bundle outcomes as queryable knowledge nodes with semantic relationships.
 * Unlike static logs, this enables pattern discovery and similarity-based retrieval.
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

import { createHash } from 'crypto';

export interface KnowledgeNode {
  id: string;
  concept: string;
  type: 'bundle' | 'leader' | 'failure_pattern' | 'success_pattern';
  attributes: Record<string, any>;
  embedding?: number[]; // 384-dim semantic embedding
  createdAt: number;
  confidence: number; // 0.0-1.0
}

export interface KnowledgeEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  weight: number; // 0.0-1.0
  createdAt: number;
}

export interface PatternMatch {
  node: KnowledgeNode;
  similarity: number;
  outcome: string;
  confidence: number;
}

export interface TransactionInsight {
  pattern: string;
  successRate: number;
  sampleSize: number;
  confidence: number;
  recommendation: string;
}

export class TransactionKnowledgeGraph {
  private nodes: Map<string, KnowledgeNode> = new Map();
  private edges: Map<string, KnowledgeEdge> = new Map();
  private nodeIndex: Map<string, string[]> = new Map(); // concept -> node IDs

  /**
   * Record a bundle outcome as a knowledge node
   */
  async recordBundle(bundle: {
    bundleId: string;
    status: string;
    submittedSlot: number;
    tipLamports: number;
    healthScore: number;
    latencyMs: number;
    failureType?: string;
    leaderId?: string;
    submittedAt: number;
  }): Promise<KnowledgeNode> {
    const node: KnowledgeNode = {
      id: `bundle_${bundle.bundleId}`,
      concept: `bundle_${bundle.status}_${bundle.healthScore}`,
      type: bundle.status === 'finalized' ? 'success_pattern' : 'failure_pattern',
      attributes: {
        bundleId: bundle.bundleId,
        status: bundle.status,
        submittedSlot: bundle.submittedSlot,
        tipLamports: bundle.tipLamports,
        healthScore: bundle.healthScore,
        latencyMs: bundle.latencyMs,
        failureType: bundle.failureType || 'none',
        leaderId: bundle.leaderId,
        timestamp: bundle.submittedAt,
      },
      embedding: this.generateEmbedding(bundle),
      createdAt: Date.now(),
      confidence: 1.0,
    };

    this.nodes.set(node.id, node);
    
    // Index by concept for fast retrieval
    if (!this.nodeIndex.has(node.concept)) {
      this.nodeIndex.set(node.concept, []);
    }
    this.nodeIndex.get(node.concept)!.push(node.id);

    // Create edges to related nodes
    await this.createEdges(node, bundle);

    console.log(`🧠 Knowledge recorded: ${node.id} (${bundle.status})`);
    
    return node;
  }

  /**
   * Generate simple embedding from bundle attributes
   * In production, use actual embedding model (e.g., Xenova/all-MiniLM-L6-v2)
   */
  private generateEmbedding(bundle: any): number[] {
    // Simplified embedding: normalize key attributes
    const embedding = new Array(384).fill(0);
    
    // Encode health score (0-100) into first 50 dimensions
    const healthNorm = bundle.healthScore / 100;
    for (let i = 0; i < 50; i++) {
      embedding[i] = healthNorm * Math.sin(i * 0.1);
    }
    
    // Encode tip amount into next 50 dimensions
    const tipNorm = Math.min(bundle.tipLamports / 5000, 1);
    for (let i = 50; i < 100; i++) {
      embedding[i] = tipNorm * Math.cos(i * 0.1);
    }
    
    // Encode skip rate into next 50 dimensions
    const skipNorm = bundle.skipRate || 0.15;
    for (let i = 100; i < 150; i++) {
      embedding[i] = skipNorm * Math.sin(i * 0.15);
    }
    
    // Encode status (binary)
    const statusVal = bundle.status === 'finalized' ? 1 : 0;
    for (let i = 150; i < 200; i++) {
      embedding[i] = statusVal;
    }
    
    return embedding;
  }

  /**
   * Create edges between related nodes
   */
  private async createEdges(node: KnowledgeNode, bundle: any): Promise<void> {
    // Edge to leader node
    if (bundle.leaderId) {
      const leaderNodeId = `leader_${bundle.leaderId}`;
      
      // Create leader node if doesn't exist
      if (!this.nodes.has(leaderNodeId)) {
        this.nodes.set(leaderNodeId, {
          id: leaderNodeId,
          concept: `leader_${bundle.leaderId}`,
          type: 'leader',
          attributes: {
            leaderId: bundle.leaderId,
            successCount: 0,
            totalCount: 0,
          },
          createdAt: Date.now(),
          confidence: 1.0,
        });
      }
      
      // Update leader stats
      const leaderNode = this.nodes.get(leaderNodeId)!;
      leaderNode.attributes.totalCount++;
      if (bundle.status === 'finalized') {
        leaderNode.attributes.successCount++;
      }
      leaderNode.attributes.successRate = 
        leaderNode.attributes.successCount / leaderNode.attributes.totalCount;
      
      // Create edge
      const edge: KnowledgeEdge = {
        id: `edge_${node.id}_${leaderNodeId}`,
        source: node.id,
        target: leaderNodeId,
        type: 'submitted_to',
        weight: bundle.status === 'finalized' ? 1.0 : 0.5,
        createdAt: Date.now(),
      };
      
      this.edges.set(edge.id, edge);
    }

    // Edge to health score node
    const healthNodeId = `health_${Math.floor(bundle.healthScore / 10) * 10}`;
    if (!this.nodes.has(healthNodeId)) {
      this.nodes.set(healthNodeId, {
        id: healthNodeId,
        concept: healthNodeId,
        type: 'bundle',
        attributes: {
          healthRange: healthNodeId,
          count: 0,
          successes: 0,
        },
        createdAt: Date.now(),
        confidence: 1.0,
      });
    }
    
    const healthNode = this.nodes.get(healthNodeId)!;
    healthNode.attributes.count++;
    if (bundle.status === 'finalized') {
      healthNode.attributes.successes++;
    }
    
    const healthEdge: KnowledgeEdge = {
      id: `edge_${node.id}_${healthNodeId}`,
      source: node.id,
      target: healthNodeId,
      type: 'under_conditions',
      weight: 1.0,
      createdAt: Date.now(),
    };
    
    this.edges.set(healthEdge.id, healthEdge);
  }

  /**
   * Find similar historical patterns using hybrid retrieval
   * (TF-IDF style filtering + semantic re-ranking)
   */
  async findSimilarPatterns(context: {
    healthScore: number;
    tipLamports: number;
    skipRate: number;
    leaderId?: string;
  }, limit: number = 10): Promise<PatternMatch[]> {
    // Step 1: Filter by health score range (fast filtering)
    const healthRange = Math.floor(context.healthScore / 10) * 10;
    const candidateConcepts = [
      `bundle_finalized_${healthRange}`,
      `bundle_failed_${healthRange}`,
      `bundle_finalized_${healthRange + 10}`,
      `bundle_failed_${healthRange + 10}`,
    ];
    
    const candidateNodes: KnowledgeNode[] = [];
    for (const concept of candidateConcepts) {
      const nodeIds = this.nodeIndex.get(concept) || [];
      for (const nodeId of nodeIds) {
        const node = this.nodes.get(nodeId);
        if (node) {
          candidateNodes.push(node);
        }
      }
    }
    
    // Step 2: Re-rank by embedding similarity
    const queryEmbedding = this.generateEmbedding(context);
    const ranked = candidateNodes
      .map(node => ({
        node,
        similarity: this.cosineSimilarity(queryEmbedding, node.embedding || []),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
    
    return ranked.map(r => ({
      node: r.node,
      similarity: r.similarity,
      outcome: r.node.attributes.status,
      confidence: r.node.confidence,
    }));
  }

  /**
   * Extract insights from the knowledge graph
   */
  async extractInsights(): Promise<TransactionInsight[]> {
    const insights: TransactionInsight[] = [];
    
    // Insight 1: Success rate by health score range
    const healthStats = new Map<number, { successes: number; total: number }>();
    
    for (const node of this.nodes.values()) {
      if (node.type === 'bundle') {
        const healthRange = Math.floor(node.attributes.healthScore / 10) * 10;
        if (!healthStats.has(healthRange)) {
          healthStats.set(healthRange, { successes: 0, total: 0 });
        }
        const stats = healthStats.get(healthRange)!;
        stats.total++;
        if (node.attributes.status === 'finalized') {
          stats.successes++;
        }
      }
    }
    
    for (const [range, stats] of healthStats.entries()) {
      const successRate = stats.total > 0 ? stats.successes / stats.total : 0;
      insights.push({
        pattern: `Health score ${range}-${range + 10}`,
        successRate,
        sampleSize: stats.total,
        confidence: stats.total >= 10 ? 0.9 : stats.total >= 5 ? 0.7 : 0.5,
        recommendation: this.generateRecommendation(successRate, range),
      });
    }
    
    // Insight 2: Leader performance
    const leaderStats = new Map<string, { successes: number; total: number }>();
    
    for (const node of this.nodes.values()) {
      if (node.type === 'leader') {
        leaderStats.set(node.attributes.leaderId, {
          successes: node.attributes.successCount,
          total: node.attributes.totalCount,
        });
      }
    }
    
    for (const [leaderId, stats] of leaderStats.entries()) {
      const successRate = stats.total > 0 ? stats.successes / stats.total : 0;
      insights.push({
        pattern: `Leader ${leaderId.substr(0, 8)}...`,
        successRate,
        sampleSize: stats.total,
        confidence: stats.total >= 5 ? 0.8 : 0.6,
        recommendation: successRate > 0.8 
          ? 'Prioritize submissions to this leader'
          : successRate < 0.5
          ? 'Consider higher tips for this leader'
          : 'Monitor performance',
      });
    }
    
    return insights.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0 || a.length !== b.length) {
      return 0;
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Generate recommendation based on success rate and conditions
   */
  private generateRecommendation(successRate: number, healthRange: number): string {
    if (successRate > 0.9) {
      return 'Excellent conditions - proceed with confidence';
    } else if (successRate > 0.75) {
      return 'Good conditions - normal tips recommended';
    } else if (successRate > 0.5) {
      return 'Moderate conditions - consider +25% tip';
    } else if (healthRange < 40) {
      return 'Poor conditions - consider +50% tip or pause submissions';
    } else {
      return 'Suboptimal conditions - increase tip or wait for better health';
    }
  }

  /**
   * Get graph statistics
   */
  getStats(): {
    totalNodes: number;
    totalEdges: number;
    nodesByType: Record<string, number>;
    avgConfidence: number;
  } {
    const nodesByType: Record<string, number> = {};
    let totalConfidence = 0;
    
    for (const node of this.nodes.values()) {
      nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
      totalConfidence += node.confidence;
    }
    
    return {
      totalNodes: this.nodes.size,
      totalEdges: this.edges.size,
      nodesByType,
      avgConfidence: this.nodes.size > 0 ? totalConfidence / this.nodes.size : 0,
    };
  }

  /**
   * Export graph for analysis
   */
  export(): { nodes: KnowledgeNode[]; edges: KnowledgeEdge[] } {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
    };
  }
}
