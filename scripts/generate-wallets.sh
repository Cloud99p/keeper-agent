#!/usr/bin/env bash
# =============================================================================
# Keeper Agent — Wallet Generator
# Generates Sepolia + Base wallets for devnet/testnet testing.
#
# Usage:
#   ./scripts/generate-wallets.sh
#
# Output: prints wallet addresses and private keys ready to paste into .env
# =============================================================================

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║     Keeper Agent — Wallet Generator                        ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

node -e "
const { ethers } = require('ethers');

// === Sepolia wallet (for execution gas) ===
const sepolia = ethers.Wallet.createRandom();

// === Base wallet (for x402 USDC payments to KeeperHub) ===
const base = ethers.Wallet.createRandom();

console.log('');
console.log('================================================================');
console.log('  COPY THESE INTO YOUR .env FILE');
console.log('================================================================');
console.log('');
console.log('# === Ethereum / EVM (Sepolia Devnet — execution) ===');
console.log('ETH_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com');
console.log('ETH_PRIVATE_KEY=' + sepolia.privateKey);
console.log('ETH_WALLET_ADDRESS=' + sepolia.address);
console.log('');
console.log('# === x402 Payment Wallet (Base — for KeeperHub fees) ===');
console.log('X402_WALLET=' + base.address);
console.log('');
console.log('================================================================');
console.log('  NEXT STEPS');
console.log('================================================================');
console.log('');
console.log('  1. Fund the Sepolia wallet:');
console.log('     Go to https://sepoliafaucet.com');
console.log('     Paste: ' + sepolia.address);
console.log('     Get 0.5 Sepolia ETH (free)');
console.log('');
console.log('  2. Fund the Base wallet:');
console.log('     Go to https://faucet.quicknode.com/base-sepolia');
console.log('     Paste: ' + base.address);
console.log('     Get Base Sepolia ETH (free)');
console.log('');
console.log('  3. Bridge Base ETH to Base USDC (for x402):');
console.log('     Use https://testnet.odos.xyz');
console.log('');
console.log('  4. Start the server:');
console.log('     ./scripts/start-dev.sh');
console.log('');
console.log('  5. Test:');
console.log('     ./scripts/test-tx.sh');
console.log('');
"
