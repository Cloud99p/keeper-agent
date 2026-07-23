#!/usr/bin/env bash
# =============================================================================
# Keeper Agent — Quickstart
#
# One-stop setup: generates wallets, prints faucet links, and gives exact
# instructions to get your first transaction onchain.
#
# Works for both devnet (Sepolia) and mainnet.
#
# Usage:
#   ./scripts/quickstart.sh
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

clear
echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║           Keeper Agent — KeeperHub Hackathon               ║"
echo "║                 🚀 Quickstart                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${CYAN}Step 1: Install dependencies${NC}"
echo "------------------------------------------------------------"
echo "  npm install"
echo ""
echo -e "  ${GREEN}✓${NC} Already done if you're reading this"
echo ""
read -p "  Press Enter to continue..."

echo ""
echo -e "${CYAN}Step 2: Generate Wallets${NC}"
echo "------------------------------------------------------------"
echo "  This creates two wallets:"
echo ""
echo -e "  ${YELLOW}Sepolia Wallet${NC} — for executing test transactions (gas fees)"
echo "  Fund with: https://sepoliafaucet.com"
echo ""
echo -e "  ${YELLOW}Base Wallet${NC} — for x402 USDC payments (KeeperHub fees)"
echo "  Fund with: https://faucet.quicknode.com/base-sepolia"
echo ""
echo -e "  ${YELLOW}KEEPERHUB_API_KEY${NC} — from https://app.keeperhub.com"
echo ""

read -p "  Generate wallets now? (Y/n): " gen
if [ "$gen" != "n" ] && [ "$gen" != "N" ]; then
  node -e "
const { ethers } = require('ethers');
const s = ethers.Wallet.createRandom();
const b = ethers.Wallet.createRandom();
console.log('');
console.log('  === COPY THIS INTO .env ===');
console.log('  ETH_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com');
console.log('  ETH_PRIVATE_KEY=' + s.privateKey);
console.log('  ETH_WALLET_ADDRESS=' + s.address);
console.log('  X402_WALLET=' + b.address);
console.log('');
console.log('  Sepolia: ' + s.address);
console.log('  Base:    ' + b.address);
console.log('');
console.log('  Faucet (Sepolia ETH):  https://sepoliafaucet.com');
console.log('  Faucet (Base ETH):     https://faucet.quicknode.com/base-sepolia');
"
fi

echo ""
echo -e "${CYAN}Step 3: Create .env${NC}"
echo "------------------------------------------------------------"
echo "  Create a .env file in the project root:"
echo ""
echo "  KEEPERHUB_API_KEY=kh_your_key_here"
echo "  ETH_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com"
echo "  ETH_PRIVATE_KEY=0x...from_step_2"
echo "  ETH_WALLET_ADDRESS=0x...from_step_2"
echo "  X402_WALLET=0x...from_step_2 (Base wallet)"
echo "  PORT=9090"
echo ""

read -p "  Press Enter to continue..."

echo ""
echo -e "${CYAN}Step 4: Start the Server${NC}"
echo "------------------------------------------------------------"
echo "  Terminal 1:"
echo ""
echo -e "  ${GREEN}./scripts/start-dev.sh${NC}"
echo ""
echo "  This compiles TypeScript and starts the A2MCP server."
echo "  Watch for: [KEEPERHUB] Ready - workflows: ✅"
echo ""

read -p "  Press Enter to continue..."

echo ""
echo -e "${CYAN}Step 5: Send a Transaction${NC}"
echo "------------------------------------------------------------"
echo "  Terminal 2 (or after server is running):"
echo ""
echo -e "  ${GREEN}./scripts/test-tx.sh${NC}"
echo ""
echo "  This will:"
echo "    • Health-check the server"
echo "    • Prompt for a recipient address"
echo "    • Send the transaction via KeeperHub MCP"
echo "    • Show the result (txHash or payment challenge)"
echo ""

read -p "  Press Enter to continue..."

echo ""
echo -e "${CYAN}Step 6: Submission Evidence${NC}"
echo "------------------------------------------------------------"
echo "  After your transaction succeeds:"
echo ""
echo "  1. Export the proof chain:"
echo -e "     ${GREEN}curl http://localhost:9090/api/v1/proof > proof-log.json${NC}"
echo ""
echo "  2. Check the KeeperHub dashboard for execution history"
echo ""
echo "  3. The txHash is your onchain proof of execution"
echo "     (visible on Etherscan / BaseScan)"
echo ""

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║           ✅ All set! Happy hacking                         ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
