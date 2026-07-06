#!/bin/sh
# Heartbeat cron for OKX ASP #4195 (X Layer, chain-index 196)
# Runs every 2 minutes while the container is alive

ONCHAINOS="/usr/local/bin/onchainos"
CHAIN_INDEX="196"
LOG="/tmp/heartbeat.log"
D=$(date -u +%Y-%m-%dT%H:%M:%SZ)

while true; do
  D=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  echo "[$D] Heartbeat: sending..." >> "$LOG"

  $ONCHAINOS agent heartbeat --chain-index "$CHAIN_INDEX" >> "$LOG" 2>&1
  EXIT_CODE=$?

  D=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  if [ $EXIT_CODE -eq 0 ]; then
    echo "[$D] Heartbeat: OK" >> "$LOG"
  else
    echo "[$D] Heartbeat: FAILED (exit $EXIT_CODE)" >> "$LOG"
  fi

  sleep 120
done
