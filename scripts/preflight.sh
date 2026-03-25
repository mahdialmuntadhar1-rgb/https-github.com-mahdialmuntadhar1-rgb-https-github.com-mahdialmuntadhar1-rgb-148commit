#!/usr/bin/env bash
set -euo pipefail

TARGET_ENV="${1:-dev}"

if ! command -v firebase >/dev/null 2>&1; then
  echo "Firebase CLI is not installed. Install with: npm i -g firebase-tools"
  exit 1
fi

echo "Running lint..."
npm run lint

echo "Running build..."
npm run build

ACTIVE_PROJECT="$(firebase use 2>/dev/null | sed -n 's/^.*active project: \([^)]*\)).*$/\1/p')"
EXPECTED_PROJECT="$(node -e "const fs=require('fs');const rc=JSON.parse(fs.readFileSync('.firebaserc','utf8'));const target='${TARGET_ENV}';const p=(rc.projects&&rc.projects[target])||'';process.stdout.write(p);")"

if [[ -z "${EXPECTED_PROJECT}" ]]; then
  echo "No project alias found for '${TARGET_ENV}' in .firebaserc"
  exit 1
fi

if [[ "${ACTIVE_PROJECT}" != "${EXPECTED_PROJECT}" ]]; then
  echo "Active Firebase project mismatch."
  echo "Expected (${TARGET_ENV}): ${EXPECTED_PROJECT}"
  echo "Active: ${ACTIVE_PROJECT:-<none>}"
  echo "Run: firebase use ${TARGET_ENV}"
  exit 1
fi

echo "Preflight checks passed for '${TARGET_ENV}' (${EXPECTED_PROJECT})."
