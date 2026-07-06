#!/bin/sh
# Heartbeat cron for OKX ASP #4195 (X Layer, chain-index 196)
# Runs every 2 minutes while the container is alive

ONCHAINOS="$(which onchainos || echo '/usr/local/bin/onchainos')"
CHAIN_INDEX="196"
LOG="/tmp/heartbeat.log"

# Wait for wallet to be logged in (handled by entrypoint.sh)
# This script is only started AFTER login is confirmed

while true; do
  # Check if still logged in
  if [ ! -f "$HOME/.onchainos/wallets.json" ]; then
    echo "[$(date -Iseconds)] SKIP: wallet not logged in" >> "$LOG"
    sleep 120
    continue
  fi

  # Send heartbeat
  echo "[$(date -Iseconds)] Heartbeat: sending..." >> "$LOG"
  $ONCHAINOS agent heartbeat --chain-index "$CHAIN_INDEX" >> "$LOG" 2>&1

  # Log result
  EXIT_CODE=$?
  if [ $EXIT_CODE -eq 0 ]; then
    echo "[$(date -Iseconds)] Heartbeat: OK" >> "$LOG"
  else
    echo "[$(date -Iseconds)] Heartbeat: FAILED (exit $EXIT_CODE)" >> "$LOG"
  fi

  # Wait 2 minutes
  sleep 120
done
