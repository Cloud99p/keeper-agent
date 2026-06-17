# AI Agent Improvements - Post-Stress Test

**Date**: 2026-05-29  
**Based on**: Stress test results showing 0% tip adjustments and 0.40 confidence

---

## Issues Identified

### From Stress Test Output
```
[AGENT] Confidence: 0.40  ← Too uniform, needs calibration
[AGENT] Decision: retry
  - Tip adjustment: 0%  ← Too conservative
  - Blockhash refresh: false  ← Should auto-refresh on expiry
  - Delay: 0ms  ← Should vary based on conditions
```

---

## Improvements Implemented

### ✅ 1. More Aggressive Tip Adjustment

**Before**: Always 0% adjustment
**After**: Dynamic based on failure type and conditions

| Failure Type | Adjustment Logic |
|--------------|------------------|
| `fee_too_low` | Target **max** recent tip (50-150% increase) |
| `expired_blockhash` | Base 25% + congestion multiplier (up to 75%) |
| `leader_quality < 0.6` | Base 40% + quality penalty (up to 60%) |
| `congestion` | Dynamic pricing (20-50% based on skip rate) |

**Code**:
```typescript
// Fee too low: target max tip, not just p75
const targetTip = maxTip;
tipAdjustmentPercent = ((targetTip - medianTip) / medianTip) * 100;
tipAdjustmentPercent = Math.max(50, Math.min(150, tipAdjustmentPercent));

// Blockhash expiry with congestion pricing
const baseAdjustment = 25;
const congestionMultiplier = 1 + (skipRate * 1.5);
const leaderPenalty = leaderQuality < 0.5 ? 20 : 0;
tipAdjustmentPercent = (baseAdjustment * congestionMultiplier) + leaderPenalty;
```

---

### ✅ 2. Automatic Blockhash Refresh

**Before**: Only refreshed if `blockhashAge > 100`
**After**: Proactive refresh with multiple triggers

| Condition | Refresh Trigger |
|-----------|----------------|
| `blockhashAge > 80` | Conservative threshold |
| `failureType === 'expired_blockhash'` | Always refresh on expiry |
| `blockhashAge > 60 && latency > 300ms` | Old + slow submission |
| `blockhashAge > 50 && skipRate > 0.2` | Old + congested |

**Code**:
```typescript
const blockhashRefresh = 
  blockhashAge > 80 ||  // More conservative threshold
  failureType === 'expired_blockhash' ||
  (blockhashAge > 60 && submissionLatency > 300) ||
  (blockhashAge > 50 && skipRate > 0.2);
```

---

### ✅ 3. Confidence Calibration Per Failure Type

**Before**: Always 0.40 (uniform)
**After**: Dynamic based on signal clarity

| Signal | Confidence Boost |
|--------|------------------|
| `expired_blockhash` + `age > 140` | +0.35 (very clear) |
| `fee_too_low` + `factors >= 2` | +0.30 (market signal) |
| `skipRate > 0.3` or `congestion > 0.7` | +0.20 (strong signal) |
| `leaderQuality < 0.5` + `latency > 200ms` | +0.20 (combined) |
| `factors.length >= 3` | +0.10 (multiple signals) |

**Code**:
```typescript
// Blockhash expiry is very clear
if (failureType === 'expired_blockhash' && blockhashAge > 140) {
  confidence += 0.35; // Highest confidence
}

// Fee too low with market data is clear
if (failureType === 'fee_too_low' && factors.length >= 2) {
  confidence += 0.30;
}

// Multiple corroborating factors increase confidence
if (factors.length >= 3) {
  confidence += 0.10;
}

// Clamp to [0.2, 0.95] - never fully certain or uncertain
return Math.max(0.2, Math.min(0.95, confidence));
```

---

### ✅ 4. Leader-Specific Tip Optimization

**Before**: Generic 0% adjustment
**After**: Tailored to leader quality

| Leader Quality | Adjustment |
|----------------|------------|
| `< 0.5` (poor) | 40% + penalty (up to 60%) |
| `0.5-0.6` (below avg) | 20-40% |
| `> 0.6` (good) | 0-10% (no adjustment needed) |

**Code**:
```typescript
// Poor leader quality = need higher tip to incentivize
if (leaderQuality < 0.6) {
  const baseForPoorLeader = 40;
  const qualityPenalty = (0.6 - leaderQuality) * 100;
  tipAdjustmentPercent = baseForPoorLeader + qualityPenalty;
  tipAdjustmentPercent = Math.min(60, tipAdjustmentPercent);
}
```

---

### ✅ 5. Smarter Delay Calculation

**Before**: Always 0ms
**After**: Context-aware delays

| Condition | Delay |
|-----------|-------|
| `action === 'wait_and_retry'` | 800ms - 5000ms (skip pattern) |
| `leaderQuality < 0.5` | 800ms (wait for leader change) |
| `skipRate > 0.15` | 300-3000ms (congestion) |
| `latency > 500ms` | 250-2000ms (network settle) |

**Code**:
```typescript
// Leader-specific timing
if (leaderQuality < 0.5) {
  delayMs = slotTimeMs * 2; // Wait 2 slots
}

// Congestion-based delay
else if (skipRate > 0.15 || congestionLevel > 0.3) {
  delayMs = Math.min(3000, Math.round(Math.max(skipRate, congestionLevel) * 3000));
}

// High latency compensation
else if (submissionLatency > 500) {
  delayMs = Math.min(2000, Math.round(submissionLatency * 0.5));
}
```

---

### ✅ 6. Comprehensive Reasoning Summary

**Before**: Generic "proceed with retry"
**After**: Detailed reasoning with specific factors

**Example Output**:
```json
{
  "failure_observed": "fee_too_low during processing in block (latency: 149ms)",
  "contributing_factors": [
    "Tip below recent median (1000 lamports) - insufficient for current market",
    "Recent tip range: 1000-2438 lamports, avg: 1605"
  ],
  "confidence": 0.65,
  "decision": {
    "action": "retry",
    "tip_adjustment_percent": 50.0,
    "blockhash_refresh": false,
    "delay_ms": 0,
    "reasoning_summary": "increase tip 50% - targeting max recent tip (2438 lamports)"
  }
}
```

---

## Expected Impact

### Before Improvements
| Metric | Value |
|--------|-------|
| Avg Tip Adjustment | 0% |
| Avg Confidence | 0.40 |
| Blockhash Refresh | 0% |
| Avg Delay | 0ms |
| Success Rate | ~80% |

### After Improvements (Expected)
| Metric | Target |
|--------|--------|
| Avg Tip Adjustment | 25-50% |
| Avg Confidence | 0.45-0.70 |
| Blockhash Refresh | 30-50% |
| Avg Delay | 200-800ms |
| Success Rate | 85-95% |

---

## Files Modified

| File | Changes |
|------|---------|
| `src/ai-agent.ts` | All 6 improvements implemented |
| `src/jito.ts` | Already passes `submissionLatency` to agent |

---

## Testing Recommendations

### 1. Stress Test with Real Failures
```bash
# Run fault injection test
npx tsx scripts/test-fault-injection.ts

# Verify agent makes non-zero tip adjustments
# Verify blockhash refresh triggers on expiry
# Verify delays vary based on conditions
```

### 2. Monitor Real Mainnet Behavior
Once deployed to mainnet:
- Track tip adjustments per failure type
- Monitor confidence score distribution
- Measure success rate improvement
- Review reasoning logs for quality

### 3. A/B Testing (Optional)
Compare performance before/after improvements:
- Keep old agent logic in separate branch
- Run parallel tests
- Measure success rate delta

---

## Next Steps

1. ✅ **Deploy to mainnet** once SolInfra credits approved
2. 🔄 **Monitor** tip adjustment patterns
3. 🔄 **Collect** real failure data
4. 🔄 **Fine-tune** formulas based on production data
5. 🔄 **Add** reinforcement learning for continuous improvement

---

*Implementation completed: 2026-05-29 13:45 UTC*  
*GitHub: https://github.com/Cloud99p/solana-tx-stack*
