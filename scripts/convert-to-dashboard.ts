/**
 * Convert Lifecycle Log to Dashboard Format
 * 
 * Reads lifecycle_log.json and converts it to dashboard-bundles.json
 * which the dashboard can read in real-time.
 */

import fs from 'fs';
import path from 'path';

const INPUT_FILE = 'lifecycle_log.json';
const OUTPUT_FILE = 'dashboard-bundles.json';

if (!fs.existsSync(INPUT_FILE)) {
  console.error(`❌ ${INPUT_FILE} not found`);
  process.exit(1);
}

console.log('='.repeat(80));
console.log('📊 CONVERTING LIFECYCLE LOG TO DASHBOARD FORMAT');
console.log('='.repeat(80));
console.log();

const lifecycleLog = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
const bundles = lifecycleLog.bundles || [];

console.log(`Input: ${bundles.length} bundles from ${INPUT_FILE}`);
console.log();

// Convert to dashboard format
const dashboardData = {
  lastUpdated: new Date().toISOString(),
  totalBundles: bundles.length,
  confirmed: bundles.filter((b: any) => b.status === 'confirmed' || b.status === 'finalized').length,
  failed: bundles.filter((b: any) => b.status === 'failed').length,
  pending: bundles.filter((b: any) => b.status === 'pending' || !b.status).length,
  bundles: bundles.map((b: any) => {
    // Extract AI reasoning from multiple possible formats
    const aiReasoning = b.aiReasoning || b.agent_reasoning || b.failure?.agent_reasoning;
    
    return {
      bundleId: b.bundleId || b.signature || 'N/A',
      type: b.type || 'unknown',
      status: b.status || 'pending',
      stage: b.stage || 'submitted',
      slot: b.submittedSlot || b.slot || null,
      tipLamports: b.tipLamports || b.tip || 0,
      submittedAt: b.submittedAt || b.timestamp || null,
      confirmedAt: b.confirmedAt || null,
      finalizedAt: b.finalizedAt || null,
      
      // Failure info
      failureType: b.failureType || aiReasoning?.failureType || null,
      errorMessage: b.errorMessage || b.error || null,
      
      // AI Decision
      aiDecision: aiReasoning ? {
        action: aiReasoning.action || aiReasoning.decision?.action || 'analyzed',
        confidence: aiReasoning.confidence || aiReasoning.decision?.confidence || 0,
        reasoning: aiReasoning.reasoning || aiReasoning.reasoning_summary || aiReasoning.decision?.reasoning_summary || 'AI analysis complete',
        tipAdjustment: aiReasoning.tipAdjustment || aiReasoning.tip_adjustment || aiReasoning.tip_adjustment_percent || 0,
        delayMs: aiReasoning.delayMs || aiReasoning.delay_ms || 0,
        blockhashRefresh: aiReasoning.blockhashRefresh || aiReasoning.blockhash_refresh || false,
        model: aiReasoning.model || 'deepseek-chat',
        aiAnalyzed: true,
      } : null,
      
      // Hebbian learning
      hebbian: b.hebbian || null,
      
      // Knowledge Graph
      knowledgeGraph: b.knowledgeGraph || b.knowledge_graph || null,
      
      // Proof Chain
      proofChain: b.proofChain || b.proof_chain || null,
    };
  }),
  
  // Statistics for charts
  statistics: {
    successRate: ((bundles.filter((b: any) => b.status === 'confirmed' || b.status === 'finalized').length / bundles.length) * 100).toFixed(0) + '%',
    averageTipLamports: Math.round(bundles.reduce((sum: number, b: any) => sum + (b.tipLamports || b.tip || 0), 0) / bundles.length),
    totalTipsLamports: bundles.reduce((sum: number, b: any) => sum + (b.tipLamports || b.tip || 0), 0),
    totalTipsSOL: (bundles.reduce((sum: number, b: any) => sum + (b.tipLamports || b.tip || 0), 0) / 1000000).toFixed(4),
    aiAnalyzedCount: bundles.filter((b: any) => b.aiReasoning || b.agent_reasoning).length,
    failureTypes: bundles.reduce((acc: any, b: any) => {
      const type = b.failureType || b.aiReasoning?.failureType;
      if (type) {
        acc[type] = (acc[type] || 0) + 1;
      }
      return acc;
    }, {}),
  },
  
  // AI Decisions (for the AI Decisions panel)
  aiDecisions: bundles
    .filter((b: any) => b.aiReasoning || b.agent_reasoning)
    .map((b: any) => {
      const ai = b.aiReasoning || b.agent_reasoning;
      return {
        bundleId: b.bundleId || b.signature || 'N/A',
        failureType: b.failureType || ai.failureType || 'unknown',
        action: ai.action || ai.decision?.action || 'analyzed',
        confidence: ai.confidence || ai.decision?.confidence || 0,
        reasoning: ai.reasoning || ai.reasoning_summary || ai.decision?.reasoning_summary || 'AI analysis complete',
        tipAdjustment: ai.tipAdjustment || ai.tip_adjustment || ai.tip_adjustment_percent || 0,
        delayMs: ai.delayMs || ai.delay_ms || 0,
        blockhashRefresh: ai.blockhashRefresh || ai.blockhash_refresh || false,
        model: ai.model || 'deepseek-chat',
        timestamp: b.submittedAt || b.timestamp || new Date().toISOString(),
      };
    }),
};

// Write dashboard format
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(dashboardData, null, 2));
console.log(`✅ Output: ${OUTPUT_FILE}`);
console.log();

// Summary
console.log('='.repeat(80));
console.log('CONVERSION COMPLETE');
console.log('='.repeat(80));
console.log();
console.log('Dashboard Data Summary:');
console.log(`  - Total Bundles: ${dashboardData.totalBundles}`);
console.log(`  - Confirmed: ${dashboardData.confirmed}`);
console.log(`  - Failed: ${dashboardData.failed}`);
console.log(`  - Pending: ${dashboardData.pending}`);
console.log(`  - AI Decisions: ${dashboardData.aiDecisions.length}`);
console.log();
console.log('Statistics:');
console.log(`  - Success Rate: ${dashboardData.statistics.successRate}`);
console.log(`  - Average Tip: ${dashboardData.statistics.averageTipLamports} lamports`);
console.log(`  - Total Tips: ${dashboardData.statistics.totalTipsSOL} SOL`);
console.log(`  - AI Analyzed: ${dashboardData.statistics.aiAnalyzedCount} bundles`);
console.log();
console.log('Failure Types:');
Object.entries(dashboardData.statistics.failureTypes).forEach(([type, count]) => {
  console.log(`  - ${type}: ${count}`);
});
console.log();
console.log('Dashboard can now read:', OUTPUT_FILE);
console.log();

// Also update the dashboard HTML to read this file
console.log('💡 Tip: Configure dashboard to read this file for real-time updates');
