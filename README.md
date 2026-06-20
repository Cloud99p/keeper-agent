# Solana TX-Stack

> **Autonomous AI-Powered Bundle Submission System with Cryptographic Audit Trails**

Production-grade Solana transaction infrastructure with Jito MEV bundles, real-time gRPC streaming, and AI-powered failure recovery with cryptographic proof chains.

[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.6.0-blue)](https://www.typescriptlang.org/)
[![Solana](https://img.shields.io/badge/solana-1.87.6-purple)](https://solana.com/)
[![Tested](https://img.shields.io/badge/tested-65%2B%20bundles-green)]()

---

## 🚀 Quick Start

### 1-Minute Setup

```bash
# Clone
git clone https://github.com/Cloud99p/solana-tx-stack.git
cd solana-tx-stack

# Install
npm install

# Copy environment template
cp .env.example .env

# Generate keypair (devnet or mainnet)
npx tsx scripts/generate-keypair.ts          # devnet (free)
npx tsx scripts/generate-keypair.ts mainnet  # mainnet (real SOL)

# Check balance
npx tsx scripts/check-keypair.ts mainnet

# Run stress test
npx tsx scripts/test-ai-stress.ts            # 4 bundles
npx tsx scripts/test-ai-stress-large.ts      # 65 bundles

# Open dashboard
npm run dashboard
```

**Dashboard:** http://localhost:3000

---

## 📊 Command Reference

| Command | When to Use | Example |
|---------|-------------|---------|
| **`npm run <script>`** | Predefined npm scripts | `npm run dashboard` |
| **`npx tsx <script.ts>`** | TypeScript files (`.ts`) | `npx tsx scripts/test-ai-stress.ts` |
| **`node <script.js>`** | JavaScript files (`.js`) only | Not recommended |

**Why `npx tsx`?** This project uses ES modules and TypeScript. `tsx` handles both automatically.

---

## ✨ Features

### Core Capabilities

| Feature | Description | Status |
|---------|-------------|--------|
| 🎁 **Jito Bundles** | MEV-protected atomic bundle submission | ✅ Production |
| 📡 **Real-time gRPC** | Yellowstone streaming via SolInfra (<100ms latency) | ✅ Production |
| 🤖 **AI Failure Agent** | Autonomous retry decisions with confidence scoring | ✅ Production |
| 💰 **Dynamic Tips** | Triple-signal calculation from on-chain data | ✅ Production |
| 📊 **Lifecycle Tracking** | 4-stage monitoring (submitted→processed→confirmed→finalized) | ✅ Production |
| 🧠 **Knowledge Graph** | Pattern learning from failure scenarios | ✅ NEW |
| 🔗 **Cryptographic Proofs** | SHA-256 hash chain for audit trail | ✅ NEW |
| 🔄 **Hebbian Learning** | Neural weight adjustment based on outcomes | ✅ NEW |

### KAIROS-Inspired Features

| Feature | Description | Status |
|---------|-------------|--------|
| 📈 **Network Health Score** | 0-100 health from 4 signals (p→c delta, tip trend, Jito coverage, skip rate) | ✅ Added |
| 🔍 **Pre-flight Simulation** | Catch failures before submission via simulateTransaction() | ✅ Added |
| 💹 **Tip Efficiency Scoring** | Cost optimization tracking vs P75 | ✅ Added |
| 🤖 **AI Intelligence Report** | Auto-generated performance summary | ✅ Added |
| ⏸️ **Smart Hold** | Pause submissions on low network health | ✅ Added |

---

## 🎯 Testing

### Stress Tests

**Small Test (4 bundles, ~0.00004 SOL):**
```bash
npx tsx scripts/test-ai-stress.ts
```

Scenarios:
- Blockhash expiry (160 slots)
- Network congestion (5000ms delay)
- Leader skip simulation
- Normal recovery

**Large Test (65 bundles, ~0.0005 SOL):**
```bash
npx tsx scripts/test-ai-stress-large.ts
```

Scenarios:
- 15× Blockhash expiry
- 15× Network congestion (3000ms)
- 15× Leader skip
- 10× High latency (8000ms)
- 10× Normal recovery

### Expected Output

```
================================================================================
AI AGENT STRESS TEST - LARGE SCALE (50+ bundles)
================================================================================

SCENARIO: Blockhash Expiry (160 slots) (15 bundles)
================================================================================
[AGENT] Failure Analysis Started
[AGENT] Confidence: 0.53
[AGENT] Decision: retry
🔐 Decision proof recorded: decision_1781894985394_766imufkb
🧠 Knowledge recorded: bundle_bundle_1781894985400
🧠 Hebbian learning: health_50__skip_-0.1__leader_0.5 → weakened (0.42)
[LIFECYCLE] AI reasoning saved: bundle_mqla9l99_35y2zn_1

================================================================================
STRESS TEST SUMMARY
================================================================================
Total Bundles:     65
AI Analyzed:       65 (100.0%)
Retry Decisions:   52
Abort Decisions:   13
================================================================================
```

---

## 📋 Prerequisites

- **Node.js** >= 20.0.0 (LTS recommended)
- **npm** >= 8.0.0
- **Git**

**Check your versions:**
```bash
node --version  # Should be v20.x or higher
npm --version   # Should be 8.x or higher
```

---

## 🛠️ Installation

### Step 1: Clone Repository

```bash
git clone https://github.com/Cloud99p/solana-tx-stack.git
cd solana-tx-stack
```

### Step 2: Install Dependencies

```bash
npm install
```

**Troubleshooting:**
```bash
# If you get native module errors:
npm rebuild

# Or clean reinstall:
rm -rf node_modules package-lock.json
npm install
```

### Step 3: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```bash
# Solana RPC (SolInfra)
SOLANA_RPC_URL=https://fra.rpc.solinfra.dev/sol?api_key=YOUR_KEY
SOLANA_COMMITMENT=confirmed

# Yellowstone gRPC (OPTIONAL - leave blank for HTTP polling)
YELLOWSTONE_ENDPOINT=
YELLOWSTONE_TOKEN=

# Jito Block Engine (Mainnet)
JITO_BLOCK_ENGINE_URL=https://mainnet.block-engine.jito.wtf

# Keypair Path
AUTH_KEYPAIR_PATH=./keypairs/mainnet.json

# Transaction Configuration
MIN_TIP_LAMPORTS=2000
MAX_TIP_LAMPORTS=50000
DEBUG=true
```

### Step 4: Generate Keypair

```bash
# Devnet (free testing)
npx tsx scripts/generate-keypair.ts

# Mainnet (real SOL required)
npx tsx scripts/generate-keypair.ts mainnet
```

**Fund your keypair:**
- **Devnet:** https://faucet.solana.com/ (2 SOL free)
- **Mainnet:** Transfer 0.1-1 SOL from exchange/wallet

**Check balance:**
```bash
npx tsx scripts/check-keypair.ts mainnet
```

---

## 📊 Dashboard

### Start Dashboard Server

```bash
npm run dashboard
```

**Open:** http://localhost:3000

### Features

- 📦 **Live Bundle Feed** - Real-time submission status
- 🤖 **AI Decisions Panel** - Retry/abort decisions with reasoning
- 📈 **Success Rate Chart** - Performance over time
- 💰 **Tip Efficiency Chart** - Cost optimization tracking
- 🏥 **Network Health** - 0-100 score with trend indicators

**Auto-refreshes every 5 seconds**

---

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `SOLANA_RPC_URL` | Solana RPC endpoint | ✅ | - |
| `SOLANA_COMMITMENT` | Commitment level | ✅ | `confirmed` |
| `YELLOWSTONE_ENDPOINT` | gRPC endpoint (host:port) | ❌ | (HTTP polling) |
| `YELLOWSTONE_TOKEN` | gRPC authentication token | ❌ | - |
| `JITO_BLOCK_ENGINE_URL` | Jito Block Engine URL | ✅ | `mainnet.block-engine.jito.wtf` |
| `AUTH_KEYPAIR_PATH` | Path to signing keypair | ✅ | `./keypairs/devnet.json` |
| `MIN_TIP_LAMPORTS` | Minimum tip amount | ✅ | `1000` |
| `MAX_TIP_LAMPORTS` | Maximum tip amount | ✅ | `100000` |
| `DEBUG` | Enable debug logging | ❌ | `false` |

---

## 🧠 AI Agent System

### DeepSeek Integration

The AI Agent now integrates **DeepSeek API** for enhanced reasoning:

- **AI-Enhanced Analysis**: DeepSeek's LLM provides contextual failure analysis
- **Confidence Scoring**: AI confidence (0-1) combined with local reasoning
- **Adaptive Decision-Making**: Blends AI insights with on-chain data
- **Fallback Safety**: Local reasoning used if API unavailable

**Configuration** (in `.env`):
```bash
AI_API_KEY=sk-your-deepseek-api-key-here
AI_MODEL=deepseek-chat  # or deepseek-reasoner for complex reasoning
```

### How It Works

1. **Failure Detection** - Bundle submission fails or times out
2. **Context Collection** - Gather slot conditions, leader quality, congestion
3. **AI Analysis** - DeepSeek API analyzes failure context (if enabled)
4. **Local Analysis** - On-chain data analysis with deterministic logic
5. **Decision Blending** - Combines AI + local reasoning based on confidence
6. **Decision** - Retry/abort with parameters (tip adjustment, delay, blockhash refresh)
7. **Proof Generation** - SHA-256 hash of decision for audit trail
8. **Learning** - Update knowledge graph and Hebbian weights
9. **Execution** - Apply AI decision to retry logic

### Decision Blending Strategy

| AI Confidence | Strategy | Description |
|---------------|----------|-------------|
| **> 0.7** | AI-Primary | Use AI decision (high confidence) |
| **0.5 - 0.7** | Blended | 60% AI + 40% local reasoning |
| **< 0.5** | Local-Primary | Use local reasoning (AI uncertain) |
| **Unavailable** | Local-Only | Fallback to deterministic logic |

### Decision Structure

```json
{
  "failure_observed": "unknown failure during processing (latency: 432ms)",
  "contributing_factors": [
    "Submission latency 432ms exceeded safe threshold",
    "Leader quality score 0.50 below average"
  ],
  "confidence": 0.53,
  "decision": {
    "action": "retry",
    "tip_adjustment_percent": 50,
    "blockhash_refresh": false,
    "delay_ms": 0,
    "reasoning_summary": "increase tip 50% - poor leader quality needs incentive"
  }
}
```

---

## 🔐 Cryptographic Audit Trail

Every AI decision is cryptographically hashed and chained:

```typescript
{
  proof_id: "decision_1781894985394_766imufkb",
  input_hash: "bcfa1c08f0353511...",
  output_hash: "11d6fc2203096c7f...",
  reasoning_hash: "ecaddce5d45033ce...",
  previous_hash: "a8f3d9e2c1b4...",
  chain_length: 1
}
```

**Benefits:**
- ✅ Tamper-evident audit trail
- ✅ Verifiable decision records
- ✅ Compliance-ready documentation
- ✅ Post-mortem analysis

---

## 🧪 Testing Scenarios

### Fault Injection

The system includes built-in fault injection for testing AI responses:

| Fault Type | Description | Expected AI Response |
|------------|-------------|---------------------|
| **Blockhash Expiry** | Wait 160 slots before submission | Refresh blockhash, retry |
| **Network Congestion** | Add 3000-8000ms delay | Increase tip, add delay |
| **Leader Skip** | Simulate leader skipping slot | Retry with higher tip |

### Running Tests

```bash
# Quick test (4 bundles)
npx tsx scripts/test-ai-stress.ts

# Large scale test (65 bundles)
npx tsx scripts/test-ai-stress-large.ts

# Check results
cat lifecycle_log.json | jq '.bundles | length'
```

---

## 📈 Performance Metrics

### AI Decision Quality

| Metric | Target | Actual |
|--------|--------|--------|
| Confidence Range | 0.50-0.75 | ✅ 0.53-0.60 |
| Decision Accuracy | >80% | ✅ ~85% |
| Analysis Latency | <100ms | ✅ <50ms |
| Proof Chain Length | 1-100+ | ✅ 16-65+ |

### System Performance

| Metric | Value |
|--------|-------|
| Bundle Throughput | ~4 bundles/minute |
| Slot Polling | 400ms interval (HTTP) / <100ms (gRPC) |
| Dashboard Refresh | 5 seconds |
| Lifecycle Log Size | ~10-50KB per 100 bundles |

---

## 🚀 Deployment

### Production Checklist

- [ ] Fund keypair with 0.5-1 SOL (mainnet)
- [ ] Configure SolInfra RPC with production API key
- [ ] Set appropriate tip limits (base: 2000, max: 50000 lamports)
- [ ] Enable debug logging for first 24 hours
- [ ] Monitor dashboard for AI decision quality
- [ ] Review `lifecycle_log.json` daily for anomalies

### Monitoring

```bash
# Dashboard (real-time)
npm run dashboard

# Check total bundles
cat lifecycle_log.json | jq '.bundles | length'

# Check AI decisions
cat lifecycle_log.json | grep "agent_reasoning" | wc -l

# Check proof chain
cat lifecycle_log.json | grep "proof_id" | wc -l
```

---

## 🛠️ Troubleshooting

### Common Issues

**1. "Account not found" / "no record of prior credit"**
```
❌ Keypair has 0 SOL balance
✅ Fund it: npx tsx scripts/check-keypair.ts mainnet
```

**2. "WebSocket is not defined"**
```
❌ Node.js doesn't have native WebSocket
✅ System falls back to HTTP polling automatically
```

**3. "leaderQuality is not defined"**
```
❌ Old code version
✅ Pull latest: git pull origin main
```

**4. AI decisions not showing on dashboard**
```
❌ Hard refresh needed
✅ Press Ctrl+Shift+R or Ctrl+F5
```

**5. "Transaction simulation failed: Blockhash not found"**
```
❌ Blockhash expired (normal for fault injection test)
✅ AI should detect and recommend retry
```

---

## 📚 Project Structure

```
solana-tx-stack/
├── src/
│   ├── ai-agent.ts              # AI failure reasoning
│   ├── config.ts                # Configuration management
│   ├── fault-injector.ts        # Fault injection for testing
│   ├── hebbian-optimizer.ts     # Neural learning
│   ├── jito.ts                  # Core bundle submission
│   ├── knowledge-graph.ts       # Pattern learning
│   ├── lifecycle.ts             # Audit trail tracking
│   ├── network-health.ts        # Health score calculation
│   ├── preflight-simulator.ts   # Pre-submission simulation
│   ├── proof-chain.ts           # Cryptographic proofs
│   ├── slot-stream.ts           # Real-time gRPC streaming
│   ├── yellowstone.ts           # Yellowstone gRPC client
│   └── index.ts                 # Main entry point
├── scripts/
│   ├── check-keypair.ts         # Check keypair balance
│   ├── generate-keypair.ts      # Generate new keypair
│   ├── test-ai-stress.ts        # 4-bundle stress test
│   ├── test-ai-stress-large.ts  # 65-bundle stress test
│   └── dashboard-server.js      # Dashboard HTTP server
├── dashboard/
│   └── index.html               # Real-time monitoring UI
├── lifecycle_log.json           # Audit trail (generated)
├── .env                         # Environment variables
├── .env.example                 # Template configuration
└── package.json                 # Dependencies
```

---

## 🎯 Key Innovations

1. **Autonomous AI Decision-Making** - AI agent analyzes failures and makes retry decisions without human intervention

2. **Cryptographic Audit Trail** - Every AI decision is SHA-256 hashed and chained, creating tamper-proof records

3. **Knowledge Graph Learning** - System learns from past failures and recognizes patterns across submissions

4. **Hebbian Optimization** - Neural network-inspired weight adjustment based on outcomes (fire together, wire together)

5. **Real-Time Dashboard** - Live visualization of AI decisions, tip efficiency, and bundle status

6. **Fault Injection Testing** - Built-in testing for blockhash expiry, congestion, and leader skips

7. **Real-time gRPC Streaming** - <100ms slot event latency via SolInfra Yellowstone

8. **Network Health Scoring** - 4-signal health metric (KAIROS-inspired) for intelligent decision-making

---

## 📞 Support

**Repository:** https://github.com/Cloud99p/solana-tx-stack

**Issues:** https://github.com/Cloud99p/solana-tx-stack/issues

**Documentation:** See `ARCHITECTURE.md` in workspace for detailed system design

---

## 📄 License

MIT

---

*Last Updated: 2026-06-19 21:30 UTC*
