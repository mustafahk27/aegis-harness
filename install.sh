#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PI_DIR="${HOME}/.pi/agent"

mkdir -p "${PI_DIR}/extensions" "${PI_DIR}/skills"

ln -sfn "${REPO_DIR}/extension" "${PI_DIR}/extensions/senpai"
ln -sfn "${REPO_DIR}/skills"    "${PI_DIR}/skills/senpai"

echo "senpai installed:"
echo "  ${PI_DIR}/extensions/senpai -> ${REPO_DIR}/extension"
echo "  ${PI_DIR}/skills/senpai     -> ${REPO_DIR}/skills"
echo "Optional but recommended: brew install gitleaks semgrep"
echo "Start pi (or /reload in a running session) to activate."
