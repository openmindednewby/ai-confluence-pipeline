#!/usr/bin/env bash
# ============================================================================
# Create a Jira Epic + linked Stories from markdown files.
#
# You specify the exact files: one epic and one or more tasks.
#
# Usage:
#   ./scripts/folder-to-jira.sh \
#     --epic path/to/epic.md \
#     --task path/to/task-api.md \
#     --task path/to/task-db.md \
#     --task path/to/task-ui.md
#
#   ./scripts/folder-to-jira.sh --epic epic.md --task task-*.md --dry-run
#
# Markdown format (for both epic and task files):
#   # Title goes here
#
#   Description text goes here. Can be multiple paragraphs.
#
#   ## Acceptance Criteria
#   - Given X, when Y, then Z
#   - Given A, when B, then C
#
#   ## Priority
#   High
#
#   ## Estimate
#   M
#
#   ## Component
#   backend
#
#   ## Labels
#   auth, security
#
# Only the # title is required. All ## sections are optional.
# The epic becomes a Jira Epic. Each task becomes a Story linked
# to that epic via the `parent` field.
#
# Requires .env with JIRA_* variables.
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load .env
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  source "$PROJECT_DIR/.env"
  set +a
fi

EPIC_FILE=""
TASK_FILES=()
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --epic)
      EPIC_FILE="$2"
      shift 2
      ;;
    --task)
      TASK_FILES+=("$2")
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help|-h)
      head -36 "$0" | tail -34
      exit 0
      ;;
    -*)
      echo "Unknown option: $1"
      exit 1
      ;;
    *)
      echo "Unknown argument: $1  (use --epic and --task to specify files)"
      exit 1
      ;;
  esac
done

if [ -z "$EPIC_FILE" ]; then
  echo "Usage: $0 --epic <epic.md> --task <task1.md> [--task <task2.md> ...] [--dry-run]"
  echo ""
  echo "Example:"
  echo "  $0 --epic my-project/epic.md --task my-project/task-01.md --task my-project/task-02.md"
  echo "  $0 --epic epic.md --task tasks/*.md --dry-run"
  exit 1
fi

if [ ! -f "$EPIC_FILE" ]; then
  echo "Error: Epic file not found: $EPIC_FILE"
  exit 1
fi

if [ ${#TASK_FILES[@]} -eq 0 ]; then
  echo "Warning: No task files specified. Only the epic will be created."
fi

if ! command -v jq &> /dev/null; then
  echo "Error: jq is required. Install it first."
  exit 1
fi

# ---------------------------------------------------------------------------
# Parse a markdown file into structured fields
# ---------------------------------------------------------------------------
parse_markdown() {
  local file="$1"
  local content
  content=$(cat "$file")

  # Title: first # heading
  local title
  title=$(echo "$content" | grep -m1 '^# ' | sed 's/^# //')

  # Description: everything between title and first ## heading
  local description
  description=$(echo "$content" | sed -n '/^# /,/^## /{/^# /d;/^## /d;p}' | sed '/^$/N;/^\n$/d' | head -20)
  description=$(echo "$description" | sed 's/^[[:space:]]*//' | tr '\n' ' ' | sed 's/  */ /g' | sed 's/^ //;s/ $//')

  # Acceptance criteria: lines starting with - under ## Acceptance Criteria
  local criteria
  criteria=$(echo "$content" | sed -n '/^## Acceptance Criteria/,/^## /{/^## /d;/^$/d;p}' | grep '^- ' | sed 's/^- //')

  # Simple fields
  get_field() {
    echo "$content" | sed -n "/^## $1/,/^## /{/^## /d;/^$/d;p}" | head -1 | sed 's/^[[:space:]]*//'
  }

  local priority
  priority=$(get_field "Priority")
  [ -z "$priority" ] && priority="${JIRA_DEFAULT_PRIORITY:-Medium}"

  local estimate
  estimate=$(get_field "Estimate")

  local component
  component=$(get_field "Component")

  local labels_str
  labels_str=$(get_field "Labels")

  # Build JSON arrays
  local criteria_json="[]"
  if [ -n "$criteria" ]; then
    criteria_json=$(echo "$criteria" | jq -R -s 'split("\n") | map(select(length > 0))')
  fi

  local labels_json='["n8n-pipeline-generated"]'
  if [ -n "$labels_str" ]; then
    labels_json=$(echo "$labels_str" | tr ',' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | jq -R -s 'split("\n") | map(select(length > 0)) + ["n8n-pipeline-generated"]')
  fi
  if [ -n "$component" ]; then
    labels_json=$(echo "$labels_json" | jq --arg c "$component" '. + [$c]')
  fi

  jq -n \
    --arg title "$title" \
    --arg description "$description" \
    --argjson criteria "$criteria_json" \
    --arg priority "$priority" \
    --arg estimate "$estimate" \
    --arg component "$component" \
    --argjson labels "$labels_json" \
    '{title: $title, description: $description, criteria: $criteria, priority: $priority, estimate: $estimate, component: $component, labels: $labels}'
}

# ---------------------------------------------------------------------------
# Build Jira issue body (ADF format)
# ---------------------------------------------------------------------------
build_jira_body() {
  local parsed="$1"
  local issue_type="$2"
  local parent_key="${3:-}"

  local title description priority labels criteria
  title=$(echo "$parsed" | jq -r '.title')
  description=$(echo "$parsed" | jq -r '.description')
  priority=$(echo "$parsed" | jq -r '.priority')
  labels=$(echo "$parsed" | jq -c '.labels')
  criteria=$(echo "$parsed" | jq -c '.criteria')

  # Build ADF content
  local adf_content='[]'

  if [ -n "$description" ] && [ "$description" != "null" ]; then
    adf_content=$(echo "$adf_content" | jq --arg d "$description" '. + [{"type":"paragraph","content":[{"type":"text","text":$d}]}]')
  fi

  local criteria_count
  criteria_count=$(echo "$criteria" | jq 'length')
  if [ "$criteria_count" -gt 0 ]; then
    local list_items
    list_items=$(echo "$criteria" | jq '[.[] | {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":.}]}]}]')
    adf_content=$(echo "$adf_content" | jq --argjson items "$list_items" '. + [{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"Acceptance Criteria"}]},{"type":"bulletList","content":$items}]')
  fi

  local fields
  fields=$(jq -n \
    --arg project "$JIRA_PROJECT_KEY" \
    --arg summary "$title" \
    --argjson desc "{\"type\":\"doc\",\"version\":1,\"content\":$adf_content}" \
    --arg issuetype "$issue_type" \
    --arg priority "$priority" \
    --argjson labels "$labels" \
    '{
      project: { key: $project },
      summary: $summary,
      description: $desc,
      issuetype: { name: $issuetype },
      priority: { name: $priority },
      labels: $labels
    }')

  if [ -n "$parent_key" ]; then
    fields=$(echo "$fields" | jq --arg key "$parent_key" '. + {parent: {key: $key}}')
  fi

  echo "{\"fields\": $fields}"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
echo "============================================"
echo "  Markdown → Jira (Epic + Tasks)"
echo "============================================"
echo ""

EPIC_PARSED=$(parse_markdown "$EPIC_FILE")
EPIC_TITLE=$(echo "$EPIC_PARSED" | jq -r '.title')

echo "  Epic:  $EPIC_FILE"
echo "         → $EPIC_TITLE"
echo ""
echo "  Tasks: ${#TASK_FILES[@]} file(s)"
for tf in "${TASK_FILES[@]}"; do
  if [ -f "$tf" ]; then
    local_title=$(grep -m1 '^# ' "$tf" | sed 's/^# //')
    echo "         $tf → $local_title"
  else
    echo "         $tf → [FILE NOT FOUND]"
  fi
done
echo ""

# --- Dry run ---
if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN — nothing will be created in Jira]"
  echo ""
  echo "Epic: $EPIC_TITLE"
  echo "  File:        $EPIC_FILE"
  echo "  Priority:    $(echo "$EPIC_PARSED" | jq -r '.priority')"
  echo "  Labels:      $(echo "$EPIC_PARSED" | jq -r '.labels | join(", ")')"
  echo "  Criteria:    $(echo "$EPIC_PARSED" | jq '.criteria | length') items"
  echo "  Description: $(echo "$EPIC_PARSED" | jq -r '.description' | head -c 120)..."
  echo ""

  for tf in "${TASK_FILES[@]}"; do
    [ ! -f "$tf" ] && continue
    TASK_PARSED=$(parse_markdown "$tf")
    echo "Task: $(echo "$TASK_PARSED" | jq -r '.title')"
    echo "  File:      $tf"
    echo "  Priority:  $(echo "$TASK_PARSED" | jq -r '.priority')"
    echo "  Estimate:  $(echo "$TASK_PARSED" | jq -r '.estimate')"
    echo "  Component: $(echo "$TASK_PARSED" | jq -r '.component')"
    echo "  Labels:    $(echo "$TASK_PARSED" | jq -r '.labels | join(", ")')"
    echo "  Criteria:  $(echo "$TASK_PARSED" | jq '.criteria | length') items"
    echo ""
  done

  echo "Run without --dry-run to create these in Jira."
  exit 0
fi

# --- Check env ---
if [ -z "${JIRA_BASE_URL:-}" ] || [ -z "${JIRA_EMAIL:-}" ] || [ -z "${JIRA_API_TOKEN:-}" ] || [ -z "${JIRA_PROJECT_KEY:-}" ]; then
  echo "Error: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, and JIRA_PROJECT_KEY must be set in .env"
  exit 1
fi

JIRA_AUTH=$(echo -n "${JIRA_EMAIL}:${JIRA_API_TOKEN}" | base64)

# --- Create epic ---
EPIC_ISSUE_TYPE="${JIRA_EPIC_ISSUE_TYPE:-Epic}"
EPIC_BODY=$(build_jira_body "$EPIC_PARSED" "$EPIC_ISSUE_TYPE")

echo "Creating epic..."
EPIC_RESPONSE=$(curl -s -X POST \
  "${JIRA_BASE_URL}/rest/api/3/issue" \
  -H "Authorization: Basic $JIRA_AUTH" \
  -H "Content-Type: application/json" \
  -d "$EPIC_BODY")

EPIC_KEY=$(echo "$EPIC_RESPONSE" | jq -r '.key // empty')
if [ -z "$EPIC_KEY" ]; then
  echo "Failed to create epic:"
  echo "$EPIC_RESPONSE" | jq '.' 2>/dev/null || echo "$EPIC_RESPONSE"
  exit 1
fi

echo "  [$EPIC_KEY] $EPIC_TITLE"
echo "  URL: ${JIRA_BASE_URL}/browse/$EPIC_KEY"
echo ""

# --- Create tasks linked to epic ---
STORY_ISSUE_TYPE="${JIRA_STORY_ISSUE_TYPE:-Story}"
CREATED=0

if [ ${#TASK_FILES[@]} -gt 0 ]; then
  echo "Creating tasks (linked to $EPIC_KEY)..."
  for tf in "${TASK_FILES[@]}"; do
    if [ ! -f "$tf" ]; then
      echo "  SKIPPED: $tf (file not found)"
      continue
    fi

    TASK_PARSED=$(parse_markdown "$tf")
    TASK_TITLE=$(echo "$TASK_PARSED" | jq -r '.title')
    TASK_BODY=$(build_jira_body "$TASK_PARSED" "$STORY_ISSUE_TYPE" "$EPIC_KEY")

    TASK_RESPONSE=$(curl -s -X POST \
      "${JIRA_BASE_URL}/rest/api/3/issue" \
      -H "Authorization: Basic $JIRA_AUTH" \
      -H "Content-Type: application/json" \
      -d "$TASK_BODY")

    TASK_KEY=$(echo "$TASK_RESPONSE" | jq -r '.key // empty')
    if [ -n "$TASK_KEY" ]; then
      echo "  [$TASK_KEY] $TASK_TITLE → parent: $EPIC_KEY"
      CREATED=$((CREATED + 1))
    else
      echo "  FAILED: $TASK_TITLE ($tf)"
      echo "    $(echo "$TASK_RESPONSE" | jq -r '.errors // .errorMessages // .' 2>/dev/null)"
    fi
  done
fi

echo ""
echo "============================================"
echo "  Done!"
echo "============================================"
echo ""
echo "  Epic:    $EPIC_KEY — $EPIC_TITLE"
echo "  Tasks:   $CREATED created, linked to $EPIC_KEY"
echo "  URL:     ${JIRA_BASE_URL}/browse/$EPIC_KEY"
