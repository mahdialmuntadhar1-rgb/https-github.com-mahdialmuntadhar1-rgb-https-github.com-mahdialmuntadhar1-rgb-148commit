#!/usr/bin/env bash
set -euo pipefail

echo "Running lint..."
npm run lint

echo "Running build..."
npm run build

echo "Preflight checks passed for Supabase deployment."
