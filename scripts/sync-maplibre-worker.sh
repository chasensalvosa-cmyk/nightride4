#!/usr/bin/env bash
# NIGHTRIDE — sync the MapLibre GL worker into public/ (self-contained file).
# Re-run after upgrading maplibre-gl so the worker version stays in sync.
set -euo pipefail
cd "$(dirname "$0")/.."
cp node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs public/maplibre-gl-worker.mjs
echo "Synced maplibre-gl worker ($(node -e "console.log(require('maplibre-gl/package.json').version)")) → public/maplibre-gl-worker.mjs"
