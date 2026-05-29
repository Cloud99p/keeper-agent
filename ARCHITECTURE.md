# Solana Transaction Stack - Architecture Document

## System Overview

A production-grade Solana transaction infrastructure stack powered by:
- **Jito Bundles** for MEV protection and atomic execution
- **Yellowstone gRPC** for real-time slot and leader streaming
- **AI-Powered Failure Reasoning** for autonomous retry decisions
- **Dynamic Tip Calculation** from live on-chain data

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SOLANA TRANSACTION STACK                         │
└─────────────────────────────────────────────────────────────────────────┘
                                       │
          ┌────────────────────────────┼────────────────────────────┐
          │                            │                            │
          ▼                            ▼                            ▼
┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
│  Yellowstone    │          │     Jito        │          │   AI Agent      │
│  gRPC Service   │          │  Bundle Service │          │  (Failure       │
│                 │          │                 │          │   Reasoning)    │
│ - Real-time     │          │ - Bundle        │          │                 │
│   streaming     │          │   submission    │          │ - Failure       │
│ - Slot updates  │          │ - Dynamic tips  │          │   analysis      │
│ - Leader        │          │ - MEV protect   │          │ - Autonomous    │
│   schedule      │          │ - Atomic tx     │          │   retry         │
└────────┬────────┘          └────────┬────────┘          └────────┬────────┘
         │                            │                            │
         │                            │                            │
         ▼                            ▼                            │
┌──────────────────────────────────────────────────────────────────┐
│                        Lifecycle Tracker                         │
│                                                                    │
│  Tracks: submitted → processed → confirmed → finalized            │
│  Records: timestamps, slots, latencies, failure classification   │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────┐
│                        Fault Injector                             │
│                                                                    │
│  Simulates: blockhash expiry, fee too low, compute exceeded       │
│  Used for: AI agent testing and demonstration                     │
└──────────────────────────────────────────────────────────────────┘
```

---

## Key Components

### 1. Yellowstone gRPC Service

**Purpose**: Real-time blockchain state streaming

**Features**:
- True gRPC streaming (400ms advantage over HTTP RPC)
- Slot subscription with exponential backoff
- Leader schedule caching and quality tracking
- Backpressure handling with high-water-mark queue
- HTTP RPC fallback for devnet

**Data Flow**:
```
Solana Validator (Geyser) → Yellowstone gRPC → Slot Updates → Lifecycle Tracker
```

**Implementation**:
- Protocol: gRPC (protobuf)
- Endpoint: `https://api.rpcpool.com:443` (mainnet)
- Devnet: Falls back to `@solana/web3.js` HTTP RPC subscriptions

---

### 2. Jito Bundle Service

**Purpose**: MEV-protected transaction submission

**Features**:
- Real Jito bundle submission via `jito-ts` SDK
- Dynamic tip calculation from on-chain data
- Atomic bundle execution (all-or-nothing)
- MEV protection from front-running
- Tip account rotation
- Autonomous AI retry with fault injection

**Data Flow**:
```
User Transaction → Dynamic Tip Calculation → Jito Bundle → Block Engine → Solana
```

**Implementation**:
- SDK: `jito-ts` (SearcherClient for mainnet)
- Devnet: Direct transaction submission (Jito not available on devnet)
- Tip accounts: Rotated from Jito's tip account list

---

### 3. AI Failure Reasoning Agent

**Purpose**: Autonomous failure analysis and retry decisions

**Features**:
- Observes real failure data
- Reasons about failure causes from live data
- Calculates confidence score (0-1)
- Makes retry/abort decisions
- Logs full reasoning before execution

**Decision Process**:
```
1. Observe: Classify failure type (expired_blockhash, fee_too_low, etc.)
2. Analyze: Correlate with slot conditions and historical data
3. Confidence: Score certainty based on signal clarity
4. Decide: Action (retry/abort/wait), tip adjustment, delay, blockhash refresh
5. Log: Full reasoning before any retry action
6. Execute: Autonomous retry with AI-determined parameters
```

**Implementation**:
- Input: Failure context (type, stage, slot conditions, recent tips, latency)
- Output: Retry parameters (shouldRetry, tipAdjustment, delayMs, refreshBlockhash)
- Confidence scoring: Based on signal clarity and data availability

---

### 4. Lifecycle Tracker

**Purpose**: Track transaction progression through confirmation stages

**Stages**:
1. **submitted**: Bundle accepted by Block Engine
2. **processed**: Transaction executed in block
3. **confirmed**: 32 slots deep (confirmed commitment)
4. **finalized**: 31+ confirmations after confirmed (finalized commitment)

**Features**:
- Timestamp recording at each stage
- Slot number tracking
- Latency calculation between stages
- Failure classification
- Tip recording for future calculations

**Output**:
- `lifecycle_log.json`: Full bundle history with agent reasoning

---

### 5. Fault Injector

**Purpose**: Simulate real-world failure scenarios for AI testing

**Scenarios**:
- **Blockhash expiry**: Wait >150 slots before submitting
- **Fee too low**: Set tip to 0 or very low amount
- **Compute exceeded**: Simulate compute unit failure
- **Network congestion**: Simulate high skip rate

**Usage**:
- Enable fault injection before bundle submission
- System waits for fault condition
- AI agent detects and responds autonomously
- Demonstrates autonomous failure recovery

---

## Data Flow

### Normal Operation

```
1. Yellowstone streams slot updates
   ↓
2. Jito detects leader window
   ↓
3. Dynamic tip calculated from:
   - Recent landed tips (75th percentile)
   - Current skip rate (congestion signal)
   - Leader quality (historical success rate)
   ↓
4. Transaction submitted with tip
   ↓
5. Lifecycle tracks: submitted → processed → confirmed → finalized
   ↓
6. Successful tip recorded for future calculations
```

### Failure Recovery

```
1. Transaction fails (expired blockhash, fee too low, etc.)
   ↓
2. Lifecycle records failure with classification
   ↓
3. AI Agent invoked with failure context
   ↓
4. Agent analyzes:
   - Failure type and stage
   - Slot conditions (skip rate, congestion, leader quality)
   - Historical tip data
   - Submission latency
   ↓
5. Agent calculates confidence score
   ↓
6. Agent makes decision:
   - Retry with adjusted tip?
   - Refresh blockhash?
   - Wait before retry?
   - Abort?
   ↓
7. If retry: Execute with AI-determined parameters
   ↓
8. If abort: Return failure to caller
```

---

## Infrastructure Decisions

### Why Yellowstone gRPC?

- **400ms advantage** over WebSocket/RPC polling
- **Real-time account writes** for early signal
- **Deshred support** (pre-execution transactions - beta)
- **More stable** than WebSocket for backend clients
- **Recommended** by Triton for production development

### Why Jito Bundles?

- **MEV protection** from front-running
- **Atomic execution** (all-or-nothing)
- **Revert protection** (failed txs don't block bundle)
- **Dynamic tips** from Jito's tip accounts
- **Competitive edge** for time-sensitive transactions

### Why AI Agent?

- **Adaptive decision making** based on real data
- **No hardcoded logic** - all decisions derived from live conditions
- **Confidence scoring** for risk management
- **Full reasoning logs** for transparency and debugging
- **Autonomous retry** without human intervention

---

## Failure Handling Strategy

### Failure Classification

| Type | Cause | Agent Response |
|------|-------|----------------|
| `expired_blockhash` | Blockhash age >150 slots | Refresh blockhash, increase tip 15-25%, delay 200-500ms |
| `fee_too_low` | Tip below threshold | Retry with tip +25-40%, no delay |
| `compute_exceeded` | Compute units exceeded | Abort (cannot fix with tip adjustment) |
| `bundle_rejected` | Block Engine rejection | Retry with tip +10-20%, delay 100ms |
| `timeout` | Confirmation timeout | Wait and retry, refresh if blockhash old |
| `unknown` | Unclassified failure | Retry with tip +10-15%, delay 500ms |

### Retry Limits

- **Max retries**: 3 attempts per bundle
- **Abort conditions**:
  - Agent confidence <0.5 (uncertain)
  - Max retries exceeded
  - Compute exceeded (cannot fix)
  - User-specified abort

---

## AI Agent Responsibilities

### 1. Failure Analysis

- Observe failure type and stage
- Identify contributing factors from live data
- Calculate confidence score (0-1)
- Log full reasoning before execution

### 2. Decision Making

- **Retry**: Adjust tip, refresh blockhash, add delay
- **Wait & Retry**: Wait for better conditions, then retry
- **Abort**: Cannot recover, give up

### 3. Parameter Calculation

- **Tip adjustment**: Derived from historical data and current conditions
- **Blockhash refresh**: Based on age and failure type
- **Delay**: Calculated from skip rate and congestion
- **Confidence**: Based on signal clarity and data availability

### 4. Autonomous Execution

- Execute decisions without hardcoded flow
- Log all reasoning for transparency
- Track retry outcomes for learning

---

## Performance Metrics

### Test Results (Devnet)

| Metric | Result |
|--------|--------|
| Success Rate | 100% (3/3 bundles) |
| Avg Tip | 1,625 lamports (dynamic) |
| Avg Latency | 654ms |
| P95 Latency | 771ms |

### Production Targets (Mainnet)

| Metric | Target |
|--------|--------|
| Success Rate | >95% |
| Confirmation | <500ms |
| Tip Efficiency | >80% |
| Agent Accuracy | >0.7 confidence |

---

## Security Considerations

### Key Management

- Keypairs stored in `.keypair/` directory
- Permissions: `chmod 600` (owner read/write only)
- Never commit to git (in `.gitignore`)
- Separate keypairs for devnet/mainnet

### Tip Account Rotation

- Rotate tip accounts for load balancing
- Fetch from Jito API (mainnet)
- Fallback to known accounts (devnet)

### Fault Injection Safety

- Only enable for testing
- Reset after test completes
- Don't inject on mainnet

---

## Deployment Checklist

### Devnet Testing

- [ ] Configure devnet endpoints
- [ ] Generate devnet keypair
- [ ] Fund keypair with devnet SOL
- [ ] Run `npm run dev -- --test`
- [ ] Verify 100% success rate
- [ ] Test fault injection scenarios

### Mainnet Production

- [ ] Get Triton gRPC auth token
- [ ] Generate **NEW** mainnet keypair
- [ ] Fund mainnet keypair with SOL
- [ ] Update endpoints to mainnet
- [ ] Increase `MIN_TIP_LAMPORTS` to 10,000+
- [ ] Set dedicated RPC endpoint
- [ ] Test with small amounts
- [ ] Monitor lifecycle logs
- [ ] Review AI agent decisions

---

## References

- [Solana Docs](https://solana.com/docs)
- [Yellowstone gRPC](https://docs.triton.one/project-yellowstone/dragons-mouth-grpc-subscriptions)
- [Jito Docs](https://docs.jito.wtf/)
- [Jito-ts SDK](https://github.com/jito-labs/jito-ts)

---

*Document Version: 1.0*
*Last Updated: 2026-05-29*
