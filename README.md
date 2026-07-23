# Keeper Agent 🚀

**Onchain execution agent for the KeeperHub Hackathon.**

An A2MCP-compatible agent that executes transactions onchain through KeeperHub's execution layer. Originally built as a Solana MEV bundle submission system with Jito integration, now being adapted for Ethereum via KeeperHub's MCP server, x402/MPP payments, and smart gas estimation.

## What It Does

1. **Receives transaction requests** via MCP-compatible HTTP endpoints
2. **Estimates optimal fees** using market-aware gas pricing (adapts to congestion)
3. **Submits transactions** through private routing with MEV protection
4. **Retries on failure** with escalating priority — 3 attempts, exponential backoff
5. **Records proof chains** — SHA-256 audit trail for every decision
6. **Learns from failures** — Hebbian-inspired pattern strengthening across outcomes
7. **Fires webhooks** — async result delivery when bundle lands or fails
8. **Tracks revenue** — per-bundle pricing via x402 payment protocol

## KeeperHub Integration

This agent is built for KeeperHub's "Agents Onchain" hackathon. It uses:
- **MCP server** — HTTP endpoints for agent service protocol
- **x402/MPP** — Pay-per-execution, settled onchain
- **Smart gas estimation** — Market-aware fee calculation
- **Private routing** — MEV protection via non-public submission
- **Audit trail** — Every action logged with proof chain verification

## Current Status

| Component | Status |
|-----------|--------|
| MCP Endpoints | ✅ Live on Railway |
| Tip Oracle | ✅ Real API (Jito) |
| Auto-Retry | ✅ 3 attempts, escalating |
| Webhooks | ✅ POST with retry |
| Proof Chain | ✅ SHA-256 verified |
| Hebbian Learning | ✅ Pattern strengthening |
| DeepSeek AI | ✅ Failure reasoning |
| Revenue Tracking | ✅ Per-bundle pricing |

## Quick Start

```bash
# Install
git clone https://github.com/Cloud99p/keeper-agent.git
cd keeper-agent
npm install

# Configure
cp .env.example .env
# Edit .env with your keys

# Run
npx tsx src/a2mcp-server.ts

# Or via Railway
npx tsx src/index.ts
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/health` | Service health |
| GET | `/api/v1/brief` | Agent capabilities brief |
| GET | `/api/v1/status` | Detailed status |
| POST | `/api/v1/bundle` | Submit transaction bundle |
| GET | `/api/v1/stats` | Performance stats |
| GET | `/api/v1/webhooks` | Pending webhooks |
| POST | `/api/v1/analyze` | MEV opportunity analysis |
| GET | `/api/v1/proof` | Proof chain |
| GET | `/api/v1/insights` | Knowledge graph insights |
| GET | `/api/v1/health/network` | Network health score |

## Architecture

```
Request → MCP Endpoint → Tip Oracle → Jito gRPC / KeeperHub MCP → Result
              │               │              │
              ▼               ▼              ▼
        Proof Chain      Market Data    Hebbian Learning
              │                             │
              ▼                             ▼
        Audit Trail              Pattern Adjustment
```

## Hackathon

Built for **KeeperHub: Agents Onchain Hackathon** (July 27 – August 13, 2026).
Prize pool: $5,000 + $1,000 bounties.

### Submission Requirements
- [ ] GitHub link (here) ✅
- [ ] Demo video showing agent executing onchain through KeeperHub
- [ ] Link to a transaction executed via KeeperHub
- [ ] Uses KeeperHub for onchain execution

## License

MIT
