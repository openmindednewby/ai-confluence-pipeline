#!/usr/bin/env bash
# ============================================================================
# Create a Confluence page from one or more markdown files.
#
# You specify the exact files: a main page and optional sections.
#
# Usage:
#   # Single file
#   ./scripts/folder-to-confluence.sh --page docs/overview.md
#
#   # Main page + sections (combined into one Confluence page)
#   ./scripts/folder-to-confluence.sh \
#     --page docs/overview.md \
#     --section docs/setup.md \
#     --section docs/api-reference.md \
#     --section docs/troubleshooting.md
#
#   # With options
#   ./scripts/folder-to-confluence.sh \
#     --page docs/overview.md \
#     --section docs/setup.md \
#     --title "My Service Docs" \
#     --parent 12345 \
#     --labels "docs,api,team-platform"
#
#   # Preview without publishing
#   ./scripts/folder-to-confluence.sh --page docs/overview.md --dry-run
#
# Markdown supports: # headings, **bold**, *italic*, `code`,
# ```code blocks```, - lists, > blockquotes, | tables |, [links](url)
#
# Requires .env with CONFLUENCE_* variables.
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

PAGE_FILE=""
SECTION_FILES=()
TITLE_OVERRIDE=""
PARENT_PAGE_ID="${CONFLUENCE_PARENT_PAGE_ID:-}"
LABELS="n8n-pipeline-generated"
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --page)
      PAGE_FILE="$2"
      shift 2
      ;;
    --section)
      SECTION_FILES+=("$2")
      shift 2
      ;;
    --title)
      TITLE_OVERRIDE="$2"
      shift 2
      ;;
    --parent)
      PARENT_PAGE_ID="$2"
      shift 2
      ;;
    --labels)
      LABELS="$2,n8n-pipeline-generated"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help|-h)
      head -32 "$0" | tail -30
      exit 0
      ;;
    -*)
      echo "Unknown option: $1"
      exit 1
      ;;
    *)
      echo "Unknown argument: $1  (use --page and --section to specify files)"
      exit 1
      ;;
  esac
done

if [ -z "$PAGE_FILE" ]; then
  echo "Usage: $0 --page <main.md> [--section <extra.md> ...] [--title <title>] [--parent <id>] [--labels <csv>] [--dry-run]"
  echo ""
  echo "Example:"
  echo "  $0 --page docs/overview.md --section docs/setup.md --section docs/api.md"
  echo "  $0 --page README.md --title 'Service Docs' --labels 'docs,platform'"
  exit 1
fi

if [ ! -f "$PAGE_FILE" ]; then
  echo "Error: Page file not found: $PAGE_FILE"
  exit 1
fi

if ! command -v jq &> /dev/null; then
  echo "Error: jq is required."
  exit 1
fi

# ---------------------------------------------------------------------------
# Convert markdown to Confluence Storage Format (HTML)
# ---------------------------------------------------------------------------
md_to_confluence_html() {
  local md="$1"

  node -e "
const md = process.argv[1];
let html = '';
const lines = md.split('\n');
let inCodeBlock = false;
let codeContent = '';
let codeLang = '';
let inList = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  if (line.startsWith('\`\`\`') && !inCodeBlock) {
    if (inList) { html += '</ul>'; inList = false; }
    inCodeBlock = true;
    codeLang = line.slice(3).trim() || 'text';
    codeContent = '';
    continue;
  }
  if (line.startsWith('\`\`\`') && inCodeBlock) {
    inCodeBlock = false;
    html += '<ac:structured-macro ac:name=\"code\"><ac:parameter ac:name=\"language\">' + codeLang + '</ac:parameter><ac:plain-text-body><![CDATA[' + codeContent.trim() + ']]></ac:plain-text-body></ac:structured-macro>';
    continue;
  }
  if (inCodeBlock) { codeContent += line + '\n'; continue; }

  if (line.match(/^\|.+\|$/) && i + 1 < lines.length && lines[i+1].match(/^\|[-| :]+\|$/)) {
    if (inList) { html += '</ul>'; inList = false; }
    const headers = line.split('|').filter(c => c.trim()).map(c => '<th>' + c.trim() + '</th>').join('');
    html += '<table><thead><tr>' + headers + '</tr></thead><tbody>';
    i++;
    while (i + 1 < lines.length && lines[i+1].match(/^\|.+\|$/)) {
      i++;
      const cells = lines[i].split('|').filter(c => c.trim()).map(c => '<td>' + c.trim() + '</td>').join('');
      html += '<tr>' + cells + '</tr>';
    }
    html += '</tbody></table>';
    continue;
  }

  if (line.startsWith('#### ')) { if (inList) { html += '</ul>'; inList = false; } html += '<h4>' + line.slice(5) + '</h4>'; continue; }
  if (line.startsWith('### '))  { if (inList) { html += '</ul>'; inList = false; } html += '<h3>' + line.slice(4) + '</h3>'; continue; }
  if (line.startsWith('## '))   { if (inList) { html += '</ul>'; inList = false; } html += '<h2>' + line.slice(3) + '</h2>'; continue; }
  if (line.startsWith('# '))    { if (inList) { html += '</ul>'; inList = false; } html += '<h1>' + line.slice(2) + '</h1>'; continue; }

  if (line.match(/^---+$/)) { if (inList) { html += '</ul>'; inList = false; } html += '<hr/>'; continue; }
  if (line.startsWith('> ')) { if (inList) { html += '</ul>'; inList = false; } html += '<blockquote><p>' + line.slice(2) + '</p></blockquote>'; continue; }

  if (line.match(/^[-*] /)) {
    if (!inList) { html += '<ul>'; inList = true; }
    let item = line.replace(/^[-*] /, '');
    item = item.replace(/\*\*(.+?)\*\*/g, '<strong>\$1</strong>');
    item = item.replace(/\*(.+?)\*/g, '<em>\$1</em>');
    item = item.replace(/\`([^\`]+)\`/g, '<code>\$1</code>');
    html += '<li>' + item + '</li>';
    continue;
  }

  if (line.trim() === '') { if (inList) { html += '</ul>'; inList = false; } continue; }

  if (inList) { html += '</ul>'; inList = false; }
  let p = line;
  p = p.replace(/\*\*(.+?)\*\*/g, '<strong>\$1</strong>');
  p = p.replace(/\*(.+?)\*/g, '<em>\$1</em>');
  p = p.replace(/\`([^\`]+)\`/g, '<code>\$1</code>');
  p = p.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href=\"\$2\">\$1</a>');
  html += '<p>' + p + '</p>';
}

if (inList) html += '</ul>';
process.stdout.write(html);
" "$md"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
echo "============================================"
echo "  Markdown → Confluence Page"
echo "============================================"
echo ""

# Combine files
COMBINED_MD=$(cat "$PAGE_FILE")
FILE_COUNT=1
echo "  Page:    $PAGE_FILE"

for sf in "${SECTION_FILES[@]}"; do
  if [ ! -f "$sf" ]; then
    echo "  SKIPPED: $sf (file not found)"
    continue
  fi
  COMBINED_MD="$COMBINED_MD

---

$(cat "$sf")"
  FILE_COUNT=$((FILE_COUNT + 1))
  echo "  Section: $sf"
done

# Determine title
if [ -n "$TITLE_OVERRIDE" ]; then
  PAGE_TITLE="$TITLE_OVERRIDE"
else
  PAGE_TITLE=$(echo "$COMBINED_MD" | grep -m1 '^# ' | sed 's/^# //')
  [ -z "$PAGE_TITLE" ] && PAGE_TITLE="Documentation"
fi

echo ""
echo "  Title: $PAGE_TITLE"
echo "  Files: $FILE_COUNT"
echo ""

# Convert to HTML
CONFLUENCE_HTML=$(md_to_confluence_html "$COMBINED_MD")

DATE=$(date +%Y-%m-%d)
CONFLUENCE_HTML="$CONFLUENCE_HTML<hr/><p><em>Published from local markdown by <a href=\"https://github.com/openmindednewby/ai-confluence-pipeline\">ai-confluence-pipeline</a> on $DATE</em></p>"

# --- Dry run ---
if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN — page will not be created]"
  echo ""
  echo "  Title:       $PAGE_TITLE"
  echo "  Files:       $FILE_COUNT"
  echo "  HTML length: ${#CONFLUENCE_HTML} chars"
  echo "  Parent:      ${PARENT_PAGE_ID:-none}"
  echo "  Labels:      $LABELS"
  echo ""
  echo "First 500 chars of HTML:"
  echo "${CONFLUENCE_HTML:0:500}..."
  echo ""
  echo "Run without --dry-run to publish."
  exit 0
fi

# --- Check env ---
if [ -z "${CONFLUENCE_BASE_URL:-}" ] || [ -z "${CONFLUENCE_EMAIL:-}" ] || [ -z "${CONFLUENCE_API_TOKEN:-}" ] || [ -z "${CONFLUENCE_SPACE_KEY:-}" ]; then
  echo "Error: CONFLUENCE_BASE_URL, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN, and CONFLUENCE_SPACE_KEY must be set in .env"
  exit 1
fi

# --- Create page ---
CONFLUENCE_AUTH=$(echo -n "${CONFLUENCE_EMAIL}:${CONFLUENCE_API_TOKEN}" | base64)

LABELS_JSON=$(echo "$LABELS" | tr ',' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | jq -R -s 'split("\n") | map(select(length > 0)) | map({prefix: "global", name: .})')

CONF_BODY=$(jq -n \
  --arg title "$PAGE_TITLE" \
  --arg spaceKey "$CONFLUENCE_SPACE_KEY" \
  --arg html "$CONFLUENCE_HTML" \
  --argjson labels "$LABELS_JSON" \
  '{
    type: "page",
    title: $title,
    space: { key: $spaceKey },
    body: { storage: { value: $html, representation: "storage" } },
    metadata: { labels: $labels }
  }')

if [ -n "$PARENT_PAGE_ID" ]; then
  CONF_BODY=$(echo "$CONF_BODY" | jq --arg pid "$PARENT_PAGE_ID" '. + {ancestors: [{id: $pid}]}')
fi

echo "Publishing to Confluence..."

CONF_RESPONSE=$(curl -s -X POST \
  "${CONFLUENCE_BASE_URL}/wiki/rest/api/content" \
  -H "Authorization: Basic $CONFLUENCE_AUTH" \
  -H "Content-Type: application/json" \
  -d "$CONF_BODY")

CONF_URL=$(echo "$CONF_RESPONSE" | jq -r '._links.base + ._links.webui // empty')

if [ -z "$CONF_URL" ]; then
  echo "Failed to create Confluence page:"
  echo "$CONF_RESPONSE" | jq '.' 2>/dev/null || echo "$CONF_RESPONSE"
  exit 1
fi

echo ""
echo "============================================"
echo "  Done!"
echo "============================================"
echo ""
echo "  Page:  $PAGE_TITLE"
echo "  URL:   $CONF_URL"
echo "  Files: $FILE_COUNT markdown file(s) published"
