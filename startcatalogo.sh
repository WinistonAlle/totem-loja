#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

cleanup() {
  if [[ -n "${PREVIEW_PID:-}" ]]; then
    kill "$PREVIEW_PID" 2>/dev/null || true
  fi
  if [[ -n "${WEBHOOK_PID:-}" ]]; then
    kill "$WEBHOOK_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

npm run preview &
PREVIEW_PID=$!

npm run automation:webhook &
WEBHOOK_PID=$!

wait "$PREVIEW_PID" "$WEBHOOK_PID"
