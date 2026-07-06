#!/bin/sh
# Entrypoint for Railway — runs A2MCP server + optional OKX heartbeat
# On first deploy, user must `railway shell` and run:
#   onchainos wallet login
#   onchainos wallet verify <OTP>
# Session persists via Railway volume mount at /root

set -e

LOG="/tmp/startup.log"

echo "[$(date -Iseconds)] Entrypoint: starting..." | tee -a "$LOG"

# ---- Check onchainos auth ----
ONCHAINOS="$(which onchainos || echo '/usr/local/bin/onchainos')"
WALLET_FILE="$HOME/.onchainos/wallets.json"
SESSION_FILE="$HOME/.onchainos/session.json"

if [ -f "$WALLET_FILE" ] && [ -f "$SESSION_FILE" ]; then
  echo "[$(date -Iseconds)] onchainos wallet found — logging in" | tee -a "$LOG"
  $ONCHAINOS wallet status >> "$LOG" 2>&1
  STATUS=$?
  if [ $STATUS -eq 0 ]; then
    echo "[$(date -Iseconds)] onchainos wallet: AUTHENTICATED" | tee -a "$LOG"
    AUTHENTICATED=true
  else
    echo "[$(date -Iseconds)] onchainos wallet: session expired or invalid" | tee -a "$LOG"
    AUTHENTICATED=false
  fi
else
  echo "[$(date -Iseconds)] onchainos wallet NOT SET UP" | tee -a "$LOG"
  echo "[$(date -Iseconds)] To set up: railway shell → onchainos wallet login" | tee -a "$LOG"
  AUTHENTICATED=false
fi

# ---- Start heartbeat if authenticated ----
if [ "$AUTHENTICATED" = "true" ]; then
  echo "[$(date -Iseconds)] Starting heartbeat cron..." | tee -a "$LOG"
  sh /app/heartbeat.sh &
  echo "[$(date -Iseconds)] Heartbeat cron started (PID $!)" | tee -a "$LOG"
else
  echo "[$(date -Iseconds)] Heartbeat: SKIPPED (no auth)" | tee -a "$LOG"
fi

# ---- Start A2MCP server ----
echo "[$(date -Iseconds)] Starting A2MCP server..." | tee -a "$LOG"
exec npx tsx src/a2mcp-server.ts
