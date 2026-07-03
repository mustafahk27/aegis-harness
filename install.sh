#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PI_DIR="${HOME}/.pi/agent"

mkdir -p "${PI_DIR}/extensions" "${PI_DIR}/skills"

ln -sfn "${REPO_DIR}/extension" "${PI_DIR}/extensions/aegis-harness"
ln -sfn "${REPO_DIR}/skills"    "${PI_DIR}/skills/aegis-harness"

echo "aegis-harness installed:"
echo "  ${PI_DIR}/extensions/aegis-harness -> ${REPO_DIR}/extension"
echo "  ${PI_DIR}/skills/aegis-harness     -> ${REPO_DIR}/skills"
echo "Optional but recommended: brew install gitleaks semgrep"
echo "Start pi (or /reload in a running session) to activate."
