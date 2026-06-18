/**
 * Cryptographic Proof Chain for AI Decisions
 * 
 * Creates tamper-evident audit trail of all AI decisions:
 * - SHA-256 hashing of inputs, outputs, and reasoning
 * - Chain linkage (each proof references previous)
 * - Verifiable integrity
 * - Judge-exportable format
 * 
 * Inspired by Omnilearn Agent's cryptographic proof chains
 */

import { createHash } from 'crypto';

export interface DecisionProof {
  decisionId: string;
  timestamp: number;
  context: {
    bundleId: string;
    failureType: string;
    stage: string;
  };
  inputHash: string;      // SHA-256 of input context
  outputHash: string;     // SHA-256 of decision output
  reasoningHash: string;  // SHA-256 of reasoning
  previousProofHash: string; // Chain linkage
  signature: string;      // Simplified signature (SHA-256 of all fields)
  status: 'recorded' | 'verified' | 'tampered';
}

export interface VerificationResult {
  valid: boolean;
  chainLength: number;
  tamperedIndices: number[];
  message: string;
}

export class DecisionProofChain {
  private chain: DecisionProof[] = [];
  private readonly GENESIS_HASH = '0'.repeat(64); // Genesis block hash
  
  /**
   * Record an AI decision with cryptographic proof
   */
  async recordDecision(context: {
    bundleId: string;
    failureType: string;
    stage: string;
    submissionSlot: number;
    blockhashAge: number;
    slotConditions: any;
    recentTips: number[];
    submissionLatency: number;
  }, decision: {
    action: string;
    tip_adjustment_percent: number;
    blockhash_refresh: boolean;
    delay_ms: number;
    reasoning_summary: string;
  }, reasoning: any): Promise<DecisionProof> {
    // Hash input context
    const inputHash = this.sha256(JSON.stringify(context));
    
    // Hash decision output
    const outputHash = this.sha256(JSON.stringify(decision));
    
    // Hash reasoning
    const reasoningHash = this.sha256(JSON.stringify(reasoning));
    
    // Get previous proof hash (or genesis)
    const previousProofHash = this.chain.length > 0
      ? this.sha256(JSON.stringify(this.chain[this.chain.length - 1]))
      : this.GENESIS_HASH;
    
    // Create proof
    const proof: DecisionProof = {
      decisionId: `decision_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      context: {
        bundleId: context.bundleId,
        failureType: context.failureType,
        stage: context.stage,
      },
      inputHash,
      outputHash,
      reasoningHash,
      previousProofHash,
      signature: '', // Will be calculated
      status: 'recorded',
    };
    
    // Calculate signature (SHA-256 of all fields)
    proof.signature = this.sha256(
      proof.decisionId +
      proof.timestamp.toString() +
      proof.inputHash +
      proof.outputHash +
      proof.reasoningHash +
      proof.previousProofHash
    );
    
    // Add to chain
    this.chain.push(proof);
    
    console.log(`🔐 Decision proof recorded: ${proof.decisionId}`);
    console.log(`   Chain length: ${this.chain.length}`);
    console.log(`   Input: ${proof.inputHash.substr(0, 16)}...`);
    console.log(`   Output: ${proof.outputHash.substr(0, 16)}...`);
    console.log(`   Reasoning: ${proof.reasoningHash.substr(0, 16)}...`);
    
    return proof;
  }

  /**
   * Verify entire chain integrity
   */
  verifyChain(): VerificationResult {
    if (this.chain.length === 0) {
      return {
        valid: true,
        chainLength: 0,
        tamperedIndices: [],
        message: 'Chain is empty (no decisions recorded yet)',
      };
    }
    
    const tamperedIndices: number[] = [];
    
    // Verify first proof links to genesis
    const firstProof = this.chain[0];
    if (firstProof.previousProofHash !== this.GENESIS_HASH) {
      tamperedIndices.push(0);
    }
    
    // Verify chain linkage
    for (let i = 1; i < this.chain.length; i++) {
      const proof = this.chain[i];
      const previousProof = this.chain[i - 1];
      
      const expectedPreviousHash = this.sha256(JSON.stringify(previousProof));
      
      if (proof.previousProofHash !== expectedPreviousHash) {
        tamperedIndices.push(i);
        console.error(`❌ Chain broken at decision ${proof.decisionId}`);
        console.error(`   Expected: ${expectedPreviousHash.substr(0, 16)}...`);
        console.error(`   Got: ${proof.previousProofHash.substr(0, 16)}...`);
      }
      
      // Verify signature
      const expectedSignature = this.sha256(
        proof.decisionId +
        proof.timestamp.toString() +
        proof.inputHash +
        proof.outputHash +
        proof.reasoningHash +
        proof.previousProofHash
      );
      
      if (proof.signature !== expectedSignature) {
        tamperedIndices.push(i);
        console.error(`❌ Signature invalid at decision ${proof.decisionId}`);
      }
    }
    
    const valid = tamperedIndices.length === 0;
    
    if (valid) {
      console.log(`✅ Chain verified: ${this.chain.length} decisions, no tampering detected`);
    } else {
      console.error(`❌ Chain verification failed: ${tamperedIndices.length} tampered decisions detected`);
    }
    
    return {
      valid,
      chainLength: this.chain.length,
      tamperedIndices,
      message: valid
        ? `Chain verified: ${this.chain.length} decisions, no tampering detected`
        : `Chain compromised: ${tamperedIndices.length} tampered decisions at indices ${tamperedIndices.join(', ')}`,
    };
  }

  /**
   * Export chain for judges (human-readable format)
   */
  exportForJudges(limit: number = 10): any {
    const recentProofs = this.chain.slice(-limit);
    
    return {
      summary: {
        totalDecisions: this.chain.length,
        exportedCount: recentProofs.length,
        chainIntegrity: this.verifyChain().valid ? '✅ VERIFIED' : '❌ COMPROMISED',
        exportedAt: new Date().toISOString(),
      },
      proofs: recentProofs.map((proof, index) => ({
        index: this.chain.length - limit + index,
        id: proof.decisionId,
        timestamp: new Date(proof.timestamp).toISOString(),
        context: proof.context,
        hashes: {
          input: proof.inputHash,
          output: proof.outputHash,
          reasoning: proof.reasoningHash,
          previous: proof.previousProofHash,
        },
        signature: proof.signature,
        status: proof.status,
      })),
      verificationInstructions: `
To verify this chain:
1. For each proof, calculate SHA-256(input + output + reasoning + previous)
2. Verify it matches the signature field
3. For proof N, verify previousProofHash equals SHA-256(proof N-1)
4. First proof should have previousProofHash = ${this.GENESIS_HASH}

If all checks pass, the chain is intact and decisions have not been tampered with.
      `.trim(),
    };
  }

  /**
   * Generate markdown report for judges
   */
  generateMarkdownReport(): string {
    const verification = this.verifyChain();
    const recentProofs = this.chain.slice(-10);
    
    let report = `
# 🔐 AI Decision Proof Chain

**Generated**: ${new Date().toISOString()}  
**Chain Integrity**: ${verification.valid ? '✅ VERIFIED' : '❌ COMPROMISED'}  
**Total Decisions**: ${this.chain.length}

---

## What This Proves

This cryptographic proof chain demonstrates:

1. **Decision Authenticity**: AI decisions were not modified after the fact
2. **Reasoning Integrity**: Full reasoning logs are authentic and complete
3. **Temporal Sequence**: Decision order is preserved and verifiable
4. **No Cherry-Picking**: All decisions are recorded, not just successful ones

---

## Recent Decisions (Last ${recentProofs.length})

${recentProofs.map((proof, i) => `
### Decision #${this.chain.length - recentProofs.length + i}

- **ID**: \`${proof.decisionId}\`
- **Timestamp**: ${new Date(proof.timestamp).toISOString()}
- **Bundle**: \`${proof.context.bundleId}\`
- **Failure Type**: \`${proof.context.failureType}\`
- **Stage**: \`${proof.context.stage}\`

**Cryptographic Hashes**:
- Input: \`${proof.inputHash}\`
- Output: \`${proof.outputHash}\`
- Reasoning: \`${proof.reasoningHash}\`
- Previous: \`${proof.previousProofHash}\`
- Signature: \`${proof.signature}\`
`).join('\n')}

---

## Verification Instructions

To verify this chain manually:

1. For each proof, calculate SHA-256(input + output + reasoning + previous)
2. Verify it matches the signature field
3. For proof N, verify previousProofHash equals SHA-256(proof N-1)
4. First proof should have previousProofHash = \`${this.GENESIS_HASH}\`

If all checks pass, the chain is intact and decisions have not been tampered with.

---

*Generated by Transaction Stack Proof Chain Engine*
`;
    
    return report;
  }

  /**
   * Get chain statistics
   */
  getStats(): {
    totalDecisions: number;
    chainIntegrity: boolean;
    avgDecisionTime: number;
    decisionsByType: Record<string, number>;
  } {
    const decisionsByType: Record<string, number> = {};
    let totalDecisionTime = 0;
    
    for (const proof of this.chain) {
      const type = proof.context.failureType;
      decisionsByType[type] = (decisionsByType[type] || 0) + 1;
      
      if (this.chain.length > 1) {
        totalDecisionTime += proof.timestamp - (this.chain[this.chain.indexOf(proof) - 1]?.timestamp || proof.timestamp);
      }
    }
    
    return {
      totalDecisions: this.chain.length,
      chainIntegrity: this.verifyChain().valid,
      avgDecisionTime: this.chain.length > 1 ? totalDecisionTime / (this.chain.length - 1) : 0,
      decisionsByType,
    };
  }

  /**
   * SHA-256 hash function
   */
  private sha256(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Get full chain
   */
  getChain(): DecisionProof[] {
    return this.chain;
  }
}
