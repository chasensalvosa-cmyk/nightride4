#!/bin/bash
# NIGHTRIDE app-server supervisor.
# Keeps a production server on :3000 alive: if the process exits for any
# reason (crash, unhandled rejection), it is restarted after 2 s. Started
# detached via `setsid nohup scripts/serve-prod.sh &`.
cd /home/z/my-project || exit 1
mkdir -p .next
if [ ! -f .next/standalone/server.js ]; then
  echo "[supervisor] no production build - falling back to dev server" >> server.log
  exec ./node_modules/.bin/next dev -p 3000
fi
while true; do
  NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 node .next/standalone/server.js >> server.log 2>&1
  code=$?
  echo "[supervisor] server exited (code $code) - restarting in 2s" >> server.log
  sleep 2
done
