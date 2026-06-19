#!/usr/bin/env bash
# ============================================================================
# Verify LIVE Atlassian access end-to-end, read-only. Exercises the real REST + conversion
# paths (which are otherwise only mock-tested) WITHOUT creating or modifying any content:
#   1. acp pull-jira <epic>        — GET the epic tree → markdown
#   2. acp pull-confluence <page>  — GET the page tree → markdown   (optional)
#   3. acp push-folder --dry-run   — resolve the write path, make NO calls
#
# Usage:  ./scripts/verify-atlassian.sh <EPIC_KEY|URL> [PAGE_ID|URL]
# Needs JIRA_* (and CONFLUENCE_* if a page is given) in .env.
# ============================================================================
set -euo pipefail

EPIC="${1:-}"
PAGE="${2:-}"
if [ -z "$EPIC" ]; then
  echo "Usage: $0 <EPIC_KEY|URL> [PAGE_ID|URL]"; exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ACP="node $PROJECT_DIR/dist/cli/index.js"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "==> [1/3] pull-jira $EPIC  (read-only GET)"
$ACP pull-jira "$EPIC" "$TMP/jira"
echo "==> [3/3] push-folder --dry-run  (resolves writes, no calls)"
$ACP push-folder "$TMP/jira" --dry-run >/dev/null && echo "    jira write-path OK"

if [ -n "$PAGE" ]; then
  echo "==> [2/3] pull-confluence $PAGE  (read-only GET)"
  $ACP pull-confluence "$PAGE" "$TMP/conf"
  $ACP push-folder "$TMP/conf" --dry-run >/dev/null && echo "    confluence write-path OK"
fi

echo ""
echo "✅ Live Atlassian access verified (read-only). No content was created or modified."
