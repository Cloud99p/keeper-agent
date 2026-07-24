#!/usr/bin/env bash
# =============================================================================
# Keeper Agent — Test Transaction
#
# Sends a test bundle request to the running Keeper Agent.
# Replace the recipient address before running.
#
# Usage:
#   ./scripts/test-tx.sh                    # test devnet (Sepolia)
#   CHAIN=mainnet ./scripts/test-tx.sh       # test mainnet (Ethereum)
#   PORT=8080  ./scripts/test-tx.sh          # custom port
# =============================================================================

set -euo pipefail

PORT="${PORT:-9090}"
CHAIN="${CHAIN:-sepolia}"
BASE_URL="http://localhost:$PORT"

echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║     Keeper Agent — Test Transaction              ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""
echo "  Server:   $BASE_URL"
echo "  Chain:    $CHAIN"
echo ""

# 1. Health check
echo "→ Health check..."
HEALTH=$(curl -sf --max-time 3 "$BASE_URL/api/v1/health" 2>&1 || echo "FAILED")
if [ "$HEALTH" = "FAILED" ] || [ -z "$HEALTH" ]; then
  echo "  ✖ Server not reachable at $BASE_URL"
  echo "  Start the server first:"
  echo "    ./scripts/start-dev.sh"
  exit 1
fi
echo "  ✅ Server online"
echo ""

# 2. Server status (use /status — fast, no external calls)
echo "→ Server status..."
curl -s --max-time 5 "$BASE_URL/api/v1/status" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    const j=JSON.parse(d);
    console.log('  Status: ' + (j.status || 'N/A'));
    console.log('  Version: ' + (j.version || 'N/A'));
    console.log('  Uptime: ' + (j.uptimeHuman || j.uptime || 'N/A'));
    console.log('  Bundles: ' + (j.stats?.totalBundles || 0) + ' (' + (j.stats?.bundleSuccessRate || 'N/A') + ' success)');
    console.log('  DeepSeek: ' + (j.ai?.deepseekEnabled ? '✅' : '❌'));
    console.log('  Jito: ' + (j.stack?.jito || 'N/A'));
  });
"
echo ""

# 2b. Quick market snapshot (from brief with longer timeout)
echo "→ Market snapshot..."
curl -s --max-time 10 "$BASE_URL/api/v1/brief" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    try {
      const j=JSON.parse(d);
      console.log('  F&G: ' + (j.fearAndGreed?.value || 'N/A') + ' — ' + (j.fearAndGreed?.label || ''));
      console.log('  BTC: \$' + (j.crypto?.BTC?.toLocaleString() || 'N/A'));
      console.log('  ETH: \$' + (j.crypto?.ETH?.toLocaleString() || 'N/A'));
      console.log('  SOL: \$' + (j.crypto?.SOL?.toLocaleString() || 'N/A'));
    } catch(e) {
      console.log('  (brief unavailable — first call may time out)');
    }
  });
"
echo ""

# 3. Send test tx
echo "→ Sending test transaction (chain: $CHAIN)..."
read -p "  Recipient address (0x...): " TO_ADDR
if [ -z "$TO_ADDR" ]; then
  echo "  Using default (null address)"
  TO_ADDR="0x0000000000000000000000000000000000000001"
fi

curl -sf --max-time 15 -X POST "$BASE_URL/api/v1/bundle" \
  -H "Content-Type: application/json" \
  -d "{
    \"chain\": \"$CHAIN\",
    \"to\": \"$TO_ADDR\",
    \"value\": \"0\"
  }" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    try {
      const j=JSON.parse(d);
      if (j.success) {
        console.log('  ✅ Transaction submitted!');
        console.log('  Bundle ID: ' + (j.bundleId || 'N/A'));
        console.log('  Details:');
        console.log('    ' + JSON.stringify(j.details, null, 4).replace(/\\n/g, '\\n    '));
      } else if (j.error === 'Payment Required') {
        console.log('  ⚠ x402 payment required.');
        console.log('  Payment wallet: ' + (j.payment?.wallet || 'not configured'));
        console.log('  Amount: ' + (j.payment?.amount || 'N/A') + ' ' + (j.payment?.unit || ''));
        console.log('');
        console.log('  Fund your payment wallet with USDC on the ' + (j.payment?.chain || 'Base') + ' chain.');
        console.log('  Or set X402_ENABLED=false for testing without payments.');
      } else {
        console.log('  ✖ Error: ' + (j.error || JSON.stringify(j)));
      }
    } catch(e) {
      console.log('  ✖ Could not parse response:', d.substring(0, 200));
    }
  });
"
echo ""
echo "→ Done."
