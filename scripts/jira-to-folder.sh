#!/usr/bin/env bash
# ============================================================================
# Reverse pipeline: pull a Jira Epic (+ Stories + Sub-tasks) into a markdown folder.
#
# The opposite of folder-to-jira.sh. Given an epic key/URL and a target directory,
# it fetches the issue tree, converts ADF -> markdown, and writes a round-trippable
# folder (epic.md + task-*.md + nested sub-task folders + acp-pull.json manifest)
# that folder-to-jira.sh / `acp jira` can push back.
#
# Usage:
#   ./scripts/jira-to-folder.sh PROJ-12 ./out
#   ./scripts/jira-to-folder.sh https://you.atlassian.net/browse/PROJ-12 ./out --no-recursive --force
#
# Conversion + REST live in the TS core (single source of truth), so this script
# builds the package if needed and delegates to the `acp pull-jira` CLI command.
# Requires .env with JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN.
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ $# -lt 2 ]; then
  echo "Usage: $0 <epic-key-or-url> <target-dir> [--no-recursive] [--force]"
  exit 1
fi

if [ ! -f "$PROJECT_DIR/dist/cli/index.js" ]; then
  echo "Building ai-confluence-pipeline..."
  (cd "$PROJECT_DIR" && npm run build >/dev/null)
fi

exec node "$PROJECT_DIR/dist/cli/index.js" pull-jira "$@"
