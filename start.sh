#!/usr/bin/env bash
set -e

echo ""
echo " Pipeline Coding Agent - Dev Server"
echo " ==================================="
echo ""

# Move to the script's own directory regardless of where it is called from
cd "$(dirname "$0")"

# Check Node.js
if ! command -v node &>/dev/null; then
  echo " ERROR: Node.js is not installed."
  echo " Install via: https://nodejs.org  or  brew install node"
  exit 1
fi

NODE_VERSION=$(node -e "process.stdout.write(process.version)")
echo " Node: $NODE_VERSION"

# Install dependencies if missing
if [ ! -d "node_modules" ]; then
  echo " Installing dependencies..."
  npm install
fi

echo " Starting server on http://localhost:3001"
echo " Press Ctrl+C to stop."
echo ""
npm run dev
