#!/usr/bin/env bash
# =============================================================================
# Keeper Agent — Start Mainnet
#
# Starts the A2MCP server configured for mainnet Ethereum.
# x402 payments route through Base mainnet.
#
# Prerequisites:
#   - Real ETH_PRIVATE_KEY with mainnet funds
#   - Base wallet with USDC for x402
#   - KEEPERHUB_API_KEY configured
#
# Usage:
#   ./scripts/start-mainnet.sh
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║     Keeper Agent — Mainnet Mode                 ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""

# Load .env
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Safety checks
if [ -z "$ETH_PRIVATE_KEY" ]; then
  echo -e "${RED}✖ ETH_PRIVATE_KEY not set. This is mainnet — be careful!${NC}"
  exit 1
fi

if [ -z "$KEEPERHUB_API_KEY" ]; then
  echo -e "${RED}✖ KEEPERHUB_API_KEY not set. Required for mainnet execution.${NC}"
  exit 1
fi

export PORT="${PORT:-8080}"
export DEBUG="${DEBUG:-false}"

echo -e "${GREEN}Starting server on port $PORT...${NC}"
echo -e "  Chain:    Ethereum Mainnet"
echo -e "  RPC:      ${ETH_RPC_URL:-https://ethereum-rpc.publicnode.com}"
echo -e "  Wallet:   $ETH_WALLET_ADDRESS"
echo -e "  Payments: x402 via Base mainnet (REAL USDC)"
echo ""
echo -e "${YELLOW}⚠ REAL MONEY. Double-check env vars before proceeding.${NC}"
echo ""

read -p "Continue? (y/N): " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Aborted."
  exit 0
fi

npx tsc && node dist/a2mcp-server.js
