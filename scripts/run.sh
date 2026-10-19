#!/bin/zsh
set -eu
cd "$(dirname "$0")/.."
if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
else
  NODE_BIN="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [ ! -x "$NODE_BIN" ]; then
  echo 'Please install Node.js 24 LTS, then run npm install and npm run dev.'
  exit 1
fi
export PATH="$(dirname "$NODE_BIN"):$PATH"
export NEXT_TELEMETRY_DISABLED=1
if [ ! -d node_modules/next ]; then
  if command -v npm >/dev/null 2>&1; then
    npm install
  else
    "$NODE_BIN" "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pnpm/bin/pnpm.cjs" install --store-dir .pnpm-store
  fi
fi
"$NODE_BIN" node_modules/tsx/dist/cli.mjs scripts/migrate.ts
if [ ! -f .next/BUILD_ID ]; then
  "$NODE_BIN" node_modules/next/dist/bin/next build
fi
exec "$NODE_BIN" node_modules/next/dist/bin/next start --hostname 127.0.0.1
