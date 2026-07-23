@echo off
REM Keeper Agent — Wallet Generator (Windows)
REM Generates Sepolia + Base wallets for devnet testing.
REM
REM Usage:
REM   scripts\generate-wallets.bat
REM
REM Output: prints wallet addresses and private keys ready to paste into .env

echo.
echo ========================================
echo   Keeper Agent — Wallet Generator
echo ========================================
echo.

node -e "
const { ethers } = require('ethers');
const sepolia = ethers.Wallet.createRandom();
const base = ethers.Wallet.createRandom();
console.log('');
console.log('===============================================================');
console.log('  COPY THESE INTO YOUR .env FILE');
console.log('===============================================================');
console.log('');
console.log('# === Ethereum / EVM (Sepolia Devnet — execution) ===');
console.log('ETH_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com');
console.log('ETH_PRIVATE_KEY=' + sepolia.privateKey);
console.log('ETH_WALLET_ADDRESS=' + sepolia.address);
console.log('');
console.log('# === x402 Payment Wallet (Base — for KeeperHub fees) ===');
console.log('X402_WALLET=' + base.address);
console.log('');
console.log('===============================================================');
console.log('  NEXT STEPS');
console.log('===============================================================');
console.log('');
console.log('  1. Fund your Sepolia wallet:');
console.log('     https://sepoliafaucet.com');
console.log('     Address: ' + sepolia.address);
console.log('');
console.log('  2. Fund your Base wallet:');
console.log('     https://faucet.quicknode.com/base-sepolia');
console.log('     Address: ' + base.address);
console.log('');
console.log('  3. Start the server:');
console.log('     scripts\\start-dev.bat');
console.log('');
console.log('  4. Test:');
console.log('     scripts\\test-tx.bat');
console.log('');
"
