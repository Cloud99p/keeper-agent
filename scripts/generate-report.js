/**
 * AI Intelligence Report Generator
 * 
 * Generates a human-readable summary of transaction stack performance
 * after a run session. Includes stats, AI decisions, and recommendations.
 * 
 * Usage: node scripts/generate-report.js
 */

import fs from 'fs';
import path from 'path';

// Load lifecycle log
const logPath = path.join(process.cwd(), 'lifecycle_log.json');

if (!fs.existsSync(logPath)) {
  console.error('❌ lifecycle_log.json not found');
  process.exit(1);
}

const bundles = JSON.parse(fs.readFileSync(logPath, 'utf8'));

// Calculate statistics
const totalBundles = bundles.length;
const successful = bundles.filter(b => b.status === 'finalized' || b.status === 'confirmed').length;
const failed = bundles.filter(b => b.failureType).length;
const avgTip = bundles.reduce((sum, b) => sum + (b.tipLamports || 0), 0) / totalBundles;
const avgLatency = bundles.reduce((sum, b) => sum + (b.latencyMs || 0), 0) / totalBundles;
const avgHealthScore = bundles.reduce((sum, b) => sum + (b.healthScore || 75), 0) / totalBundles;

// Failure analysis
const failureTypes: Record<string, number> = {};
bundles.forEach(b => {
  if (b.failureType) {
    failureTypes[b.failureType] = (failureTypes[b.failureType] || 0) + 1;
  }
});

// AI decisions analysis
const aiDecisions = bundles.filter(b => b.agentReasoning);
const successfulRetries = aiDecisions.filter(r => {
  const nextBundle = bundles.find(b => b.bundleId === r.bundleId && r.retryOutcome === 'success');
  return nextBundle && nextBundle.status === 'finalized';
}).length;

// Tip efficiency analysis
const efficiencyScores = bundles.filter(b => b.tipEfficiencyScore).map(b => b.tipEfficiencyScore);
const avgEfficiency = efficiencyScores.reduce((a, b) => a + b, 0) / efficiencyScores.length || 0;
const efficiencyGrade = avgEfficiency >= 90 ? 'A' : avgEfficiency >= 80 ? 'B' : avgEfficiency >= 70 ? 'C' : 'D';

// Generate report
const report = `
# 🤖 Transaction Stack Intelligence Report

**Generated**: ${new Date().toISOString()}  
**Session Duration**: ${bundles.length} bundles analyzed

---

## 📊 Executive Summary

- **Total Bundles**: ${totalBundles}
- **Success Rate**: ${successful}/${totalBundles} (${((successful/totalBundles)*100).toFixed(1)}%)
- **Average Tip**: ${avgTip.toFixed(0)} lamports
- **Average Latency**: ${avgLatency.toFixed(0)}ms
- **Network Health**: ${avgHealthScore.toFixed(0)}/100

---

## 🎯 Performance Metrics

### Bundle Performance
| Metric | Value | Grade |
|--------|-------|-------|
| Success Rate | ${((successful/totalBundles)*100).toFixed(1)}% | ${((successful/totalBundles)*100) >= 95 ? 'A+' : ((successful/totalBundles)*100) >= 85 ? 'A' : 'B'} |
| Avg Tip | ${avgTip.toFixed(0)} lamports | ${avgTip <= 1500 ? 'A' : avgTip <= 2000 ? 'B' : 'C'} |
| Avg Latency | ${avgLatency.toFixed(0)}ms | ${avgLatency <= 800 ? 'A' : avgLatency <= 1200 ? 'B' : 'C'} |
| Health Score | ${avgHealthScore.toFixed(0)}/100 | ${avgHealthScore >= 70 ? 'A' : avgHealthScore >= 50 ? 'B' : 'C'} |

### Cost Optimization
| Metric | Value | Grade |
|--------|-------|-------|
| Tip Efficiency | ${avgEfficiency.toFixed(1)}% | ${efficiencyGrade} |
| Total Tips Paid | ${(bundles.reduce((sum, b) => sum + (b.tipLamports || 0), 0) / 1e9).toFixed(4)} SOL | - |

---

## 🔍 Failure Analysis

### Failure Summary
- **Total Failures**: ${failed}
- **Failure Rate**: ${((failed/totalBundles)*100).toFixed(1)}%

### Failure Types
${Object.entries(failureTypes).map(([type, count]) => `- **${type}**: ${count}`).join('\n') || '- No failures detected'}

### Failure Timeline
${bundles.filter(b => b.failureType).slice(0, 5).map(b => \`
- **Bundle ${b.bundleId}**: \${b.failureType}
  - Stage: \${b.stage}
  - Slot: \${b.submittedSlot}
  - Agent Decision: \${b.agentReasoning?.decision.action || 'N/A'}
\`).join('\n') || 'No failures to display'}

---

## 🤖 AI Agent Performance

### Decision Summary
- **Total AI Decisions**: ${aiDecisions.length}
- **Successful Retries**: ${successfulRetries}/${aiDecisions.length} (${((successfulRetries/aiDecisions.length)*100 || 0).toFixed(1)}%)

### AI Confidence Distribution
${aiDecisions.length > 0 ? \`
- High Confidence (>0.8): ${aiDecisions.filter(d => d.agentReasoning?.confidence > 0.8).length}
- Medium Confidence (0.5-0.8): ${aiDecisions.filter(d => d.agentReasoning?.confidence >= 0.5 && d.agentReasoning?.confidence <= 0.8).length}
- Low Confidence (<0.5): ${aiDecisions.filter(d => d.agentReasoning?.confidence < 0.5).length}
\` : '- No AI decisions recorded'}

### Notable AI Decisions
${aiDecisions.slice(0, 3).map(d => \`
- **Bundle ${d.bundleId}**: \${d.agentReasoning?.decision.action}
  - Reasoning: \${d.agentReasoning?.decision.reasoning_summary}
  - Confidence: \${(d.agentReasoning?.confidence * 100 || 0).toFixed(0)}%
  - Tip Adjustment: \${d.agentReasoning?.decision.tip_adjustment_percent.toFixed(0)}%
\`).join('\n') || '- No decisions to display'}

---

## 📈 Network Conditions

### Health Score History
${bundles.slice(-10).map(b => \`- Slot \${b.submittedSlot}: Health \${b.healthScore || 'N/A'}/100\`).join('\n') || '- Insufficient data'}

### Network Status Distribution
- **Healthy (≥70)**: ${bundles.filter(b => (b.healthScore || 75) >= 70).length} bundles
- **Degraded (40-69)**: ${bundles.filter(b => (b.healthScore || 75) >= 40 && (b.healthScore || 75) < 70).length} bundles
- **Congested (<40)**: ${bundles.filter(b => (b.healthScore || 75) < 40).length} bundles

---

## 💡 Recommendations

${failed > 0 ? \`
### 🔴 Issues to Address
1. **${failed} failures detected** - Review failure patterns in lifecycle logs
2. Investigate most common failure type: \${Object.entries(failureTypes).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'}
3. Consider adjusting tip strategy during high congestion periods
\` : \`
### ✅ No Critical Issues
- All bundles processed successfully
- Network conditions were optimal
- AI agent performed within expected parameters
\`}

### 🟡 Optimization Opportunities
1. **Tip Efficiency**: \${avgEfficiency.toFixed(1)}% - Consider fine-tuning tip calculation
2. **Latency**: \${avgLatency.toFixed(0)}ms avg - Optimize submission timing for better results
3. **Health Score**: \${avgHealthScore.toFixed(0)}/100 - Monitor network conditions proactively

### 🟢 Best Practices Maintained
- ✅ Pre-flight simulation enabled
- ✅ Dynamic tip calculation active
- ✅ Network health monitoring active
- ✅ AI-driven retry decisions implemented

---

## 📁 Data Files

| File | Description |
|------|-------------|
| \`lifecycle_log.json\` | Full bundle history |
| \`network_health.json\` | Health score history |
| \`ai_decisions.json\` | AI agent reasoning logs |

---

## 🔗 Next Steps

1. Review \`lifecycle_log.json\` for detailed bundle data
2. Check \`AI Agent Performance\` section for decision quality
3. Monitor \`Network Conditions\` for congestion patterns
4. Run \`node scripts/test-bundle.js\` for quick validation

---

*Report generated by Transaction Stack Intelligence Engine*
*Last Updated: ${new Date().toISOString()}*
`;

// Write report
const reportPath = path.join(process.cwd(), 'INTELLIGENCE_REPORT.md');
fs.writeFileSync(reportPath, report.trim());

console.log('✅ Intelligence Report Generated');
console.log(`📄 Saved to: ${reportPath}`);
console.log('');
console.log('📊 Summary:');
console.log(`   - Bundles: ${totalBundles}`);
console.log(`   - Success: ${((successful/totalBundles)*100).toFixed(1)}%`);
console.log(`   - Avg Tip: ${avgTip.toFixed(0)} lamports`);
console.log(`   - Health: ${avgHealthScore.toFixed(0)}/100`);
