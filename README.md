# Keeper Agent 🚀

**Onchain execution agent for the KeeperHub Hackathon.**

Submit transactions on Solana, Ethereum, Base, Sepolia, and more through a single MCP endpoint. Built for reliability: gas estimation, auto-retry, proof chain audit trail, x402/MPP payments.

---

## 🏆 For Judges — Quick Verification

### What This Agent Does

| Capability | What It Proves |
|-----------|----------------|
| **Multi-chain execution** | Routes Solana → Jito, EVM chains → KeeperHub MCP |
| **x402/MPP payments** | Auto-signs KeeperHub payment challenges (EIP-712 TransferWithAuthorization) |
| **Smart gas estimation** | Queries live RPC for `maxPriorityFeePerGas`, `estimateGas`, adapts to congestion |
| **Auto-retry (3 attempts)** | Exponential backoff when a tx fails or hits gas spikes |
| **Proof chain audit trail** | SHA-256 chain logging every decision: trigger → simulation → tx hash → outcome → timestamp |
| **Hebbian learning** | Pattern strengthening across failure types (knowledge graph) |
| **Webhook delivery** | Async result callbacks when tx lands or fails |

### How to Verify in 2 Minutes

```bash
# 1. Generate wallets (devnet)
./scripts/quickstart.sh

# 2. Start the server
./scripts/start-dev.sh

# 3. Send a test transaction
./scripts/test-tx.sh
# → Expected: txHash returned, visible on Sepolia Etherscan

# 4. Export proof chain
curl http://localhost:9090/api/v1/proof > proof-log.json
# → Shows: trigger → gas estimation → submission → tx hash → outcome
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm
- A [KeeperHub API key](https://app.keeperhub.com) (starts with `kh_`)

### Setup

```bash
git clone https://github.com/Cloud99p/keeper-agent.git
cd keeper-agent
npm install
```

### Option A: Devnet (Sepolia) — For Testing

**Free, no real money.** Recommended for first-time setup.

```bash
# 1. Generate wallets and print faucet links
./scripts/generate-wallets.sh

# 2. Fund both wallets via the faucet links printed above
#    Sepolia wallet → https://sepoliafaucet.com
#    Base wallet   → https://faucet.quicknode.com/base-sepolia

# 3. Create .env (copy from the script output)

# 4. Start the server
./scripts/start-dev.sh

# 5. In another terminal, test
./scripts/test-tx.sh
```

### Option B: Mainnet — For Production

**Real money required.** Only when you're ready for submission.

```bash
./scripts/start-mainnet.sh
```

### Option C: Windows

```bash
scripts\generate-wallets.bat
scripts\start-dev.bat
```

---

## 📡 Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/health` | Service health |
| GET | `/api/v1/brief` | Capabilities, prices, status |
| GET | `/api/v1/status` | Full status (chains, uptime, stack) |
| POST | `/api/v1/bundle` | **Submit transaction** — the main endpoint |
| GET | `/api/v1/proof` | Proof chain — audit trail for all decisions |
| GET | `/api/v1/insights` | Knowledge graph — pattern learning |
| GET | `/api/v1/stats` | Performance statistics |

### POST /api/v1/bundle

**Request body:**

```json
{
  "chain": "sepolia",
  "to": "0xRecipientAddress",
  "value": "0",
  "priority": "medium"
}
```

Supported chains: `solana`, `ethereum`, `base`, `base-sepolia`, `sepolia`, `polygon`, `arbitrum`, `optimism`

**Response (success):**

```json
{
  "success": true,
  "bundleId": "evm_0xabcd...",
  "details": {
    "chain": "sepolia",
    "txHash": "0x...",
    "status": "submitted",
    "proofHash": "evm_0xabcd..."
  }
}
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Client Request                     │
│         POST /api/v1/bundle { chain, to, value }    │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│               handleBundleSubmit                     │
│          a2mcp-server.ts                             │
│                                                      │
│  chain = 'solana'?     → JitoManager (existing)      │
│  chain = 'sepolia'?    → ExecutionAdapter            │
│  chain = 'ethereum'?   → ExecutionAdapter            │
│  chain = 'base'?       → ExecutionAdapter            │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│               ExecutionAdapter                       │
│          execution-adapter.ts                        │
│                                                      │
│  Routes to correct backend based on chain:           │
│  ┌──────────────────┐  ┌─────────────────────────┐  │
│  │ Solana → Jito    │  │ EVM → KeeperHub MCP     │  │
│  │ gRPC bundle sub  │  │ call_workflow(chain,tx)  │  │
│  └──────────────────┘  └─────────────────────────┘  │
│                            │                        │
│                            ▼                        │
│                    ┌────────────────────┐           │
│                    │  EvmTxBuilder      │           │
│                    │  - Gas estimation  │           │
│                    │  - EIP-1559 sign   │           │
│                    └────────────────────┘           │
│                            │                        │
│                            ▼                        │
│                    ┌────────────────────┐           │
│                    │  KeeperHubClient   │           │
│                    │  - callWorkflow()  │           │
│                    │  - x402 signing    │           │
│                    │  - retry on 402    │           │
│                    └────────────────────┘           │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│               Proof Chain + Webhook                  │
│          Every decision logged:                      │
│  trigger → gas estimate → submission → tx hash      │
│  → outcome → timestamp → SHA-256 hash               │
└─────────────────────────────────────────────────────┘
```

---

## 📁 Scripts

| Script | Purpose |
|--------|---------|
| `scripts/generate-wallets.sh` | Generate Sepolia + Base wallets for devnet |
| `scripts/generate-wallets.bat` | Same for Windows |
| `scripts/quickstart.sh` | Interactive walkthrough from zero to tx |
| `scripts/start-dev.sh` | Start server with Sepolia config |
| `scripts/start-dev.bat` | Same for Windows |
| `scripts/start-mainnet.sh` | Start server with mainnet (safety confirm) |
| `scripts/test-tx.sh` | Send test transaction, show result |

---

## 📋 Submission Checklist

| Requirement | Status | How to Verify |
|------------|--------|---------------|
| GitHub link | ✅ | This repo |
| Transaction via KeeperHub | 🟡 | Run `./scripts/test-tx.sh` — submit the resulting txHash |
| Uses MCP | ✅ | `POST /api/v1/bundle` is MCP-compatible |
| Uses x402/MPP | ✅ | `keeperhub-client.ts` handles 402 challenges |
| Proof of execution | 🟡 | `GET /api/v1/proof` exports full audit trail |
| Demo video | 🟡 | Record after successful tx |

---

## 🔐 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `KEEPERHUB_API_KEY` | ✅ | Your KeeperHub API key (starts with `kh_`) |
| `ETH_RPC_URL` | For EVM | RPC URL (default: Sepolia publicnode) |
| `ETH_PRIVATE_KEY` | For EVM | Wallet private key for signing |
| `ETH_WALLET_ADDRESS` | For EVM | Wallet address |
| `X402_WALLET` | For x402 | Base wallet address for USDC payments |
| `PORT` | No | Server port (default: 8080) |
| `DEBUG` | No | Verbose logging (default: false) |

---

Built for **KeeperHub: Agents Onchain Hackathon** (July 27 – August 13, 2026).
Prize pool: $5,000 + $1,000 bounties.

## License

MIT
