@echo off
REM =============================================================================
REM Keeper Agent — Start Devnet (Sepolia) for Windows
REM
REM Starts the server for Sepolia testnet testing.
REM
REM Prerequisites:
REM   - .env file (run scripts\generate-wallets.bat first)
REM   - Sepolia ETH + Base Sepolia USDC in your wallets
REM
REM Usage:
REM   scripts\start-dev.bat
REM =============================================================================

@setlocal enabledelayedexpansion

echo.
echo ========================================
echo   Keeper Agent — Devnet Mode (Sepolia)
echo ========================================
echo.

REM Load .env if it exists
if exist .env (
  echo Loading .env...
  for /f "tokens=*" %%a in (.env) do set %%a
)

if "%PORT%"=="" set PORT=9090
if "%ETH_RPC_URL%"=="" set ETH_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
set DEBUG=true

echo Starting server on port %PORT%...
echo Chain:   Sepolia (testnet)
echo RPC:     %ETH_RPC_URL%
echo Wallet:  %ETH_WALLET_ADDRESS%
echo.

npx tsc && node dist/a2mcp-server.js
