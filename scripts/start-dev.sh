#!/usr/bin/env bash
# =============================================================================
# Keeper Agent — Start Devnet (Sepolia)
#
# Starts the A2MCP server configured for Sepolia testnet.
# x402 payments route through Base testnet (per KeeperHub docs).
#
# Prerequisites:
#   - .env file with your wallets (run ./scripts/generate-wallets.sh first)
#   - Sepolia ETH in your execution wallet (faucet: https://sepoliafaucet.com)
#   - Base Sepolia USDC in your payment wallet for x402
#
# Usage:
#   ./scripts/start-dev.sh
# =============================================================================

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Keeper Agent — Devnet Mode (Sepolia)      ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

# Load .env if it exists
if [ -f .env ]; then
  echo -e "${YELLOW}Loading .env...${NC}"
  set -a
  source .env
  set +a
fi

# Set devnet defaults
export PORT="${PORT:-9090}"
export ETH_RPC_URL="${ETH_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
export KEEPERHUB_API_KEY="${KEEPERHUB_API_KEY:-}"
export DEBUG="${DEBUG:-true}"

# Validate
if [ -z "$KEEPERHUB_API_KEY" ]; then
  echo -e "${YELLOW}⚠ KEEPERHUB_API_KEY not set. KeeperHub MCP calls will fail.${NC}"
  echo "  Set it in .env or export it before running."
  echo ""
fi

if [ -z "$ETH_PRIVATE_KEY" ]; then
  echo -e "${YELLOW}⚠ ETH_PRIVATE_KEY not set. Run ./scripts/generate-wallets.sh first.${NC}"
  echo ""
fi

echo -e "${GREEN}Starting server on port $PORT...${NC}"
echo -e "  Chain:    Sepolia (testnet)"
echo -e "  RPC:      $ETH_RPC_URL"
echo -e "  Wallet:   ${ETH_WALLET_ADDRESS:-not set}"
echo -e "  Payments: x402 via Base testnet"
echo ""

# Build + start
npx tsc && node dist/a2mcp-server.js
