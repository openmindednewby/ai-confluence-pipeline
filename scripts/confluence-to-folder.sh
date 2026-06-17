#!/usr/bin/env bash
# ============================================================================
# Reverse pipeline: pull a Confluence page (+ descendant pages) into a markdown folder.
#
# The opposite of folder-to-confluence.sh. Given a page id/URL and a target directory,
# it fetches the page tree, converts storage-format XHTML -> markdown, and writes a
# round-trippable folder (page.md + nested subfolders + acp-pull.json manifest).
#
# Usage:
#   ./scripts/confluence-to-folder.sh 123456 ./out
#   ./scripts/confluence-to-folder.sh https://you.atlassian.net/wiki/spaces/T/pages/123456/Title ./out --force
#
# Conversion + REST live in the TS core (single source of truth), so this script
# builds the package if needed and delegates to the `acp pull-confluence` CLI command.
# Requires .env with CONFLUENCE_BASE_URL, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN.
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ $# -lt 2 ]; then
  echo "Usage: $0 <page-id-or-url> <target-dir> [--no-recursive] [--force]"
  exit 1
fi

if [ ! -f "$PROJECT_DIR/dist/cli/index.js" ]; then
  echo "Building ai-confluence-pipeline..."
  (cd "$PROJECT_DIR" && npm run build >/dev/null)
fi

exec node "$PROJECT_DIR/dist/cli/index.js" pull-confluence "$@"
