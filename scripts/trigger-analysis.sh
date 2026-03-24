#!/usr/bin/env bash
# ============================================================================
# Trigger a technical analysis via the n8n webhook
#
# Usage:
#   ./scripts/trigger-analysis.sh "Add user notification preferences"
#   ./scripts/trigger-analysis.sh "Add user notification preferences" --no-jira
#   ./scripts/trigger-analysis.sh "Add user notification preferences" --context "We use Firebase for push notifications"
# ============================================================================

set -euo pipefail

WEBHOOK_URL="${WEBHOOK_URL:-http://localhost:10353/webhook/analyze}"
FEATURE_DESCRIPTION="$1"
CREATE_JIRA=true
ADDITIONAL_CONTEXT=""

shift
while [[ $# -gt 0 ]]; do
  case $1 in
    --no-jira)
      CREATE_JIRA=false
      shift
      ;;
    --context)
      ADDITIONAL_CONTEXT="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

if [ -z "$FEATURE_DESCRIPTION" ]; then
  echo "Usage: $0 <feature-description> [--no-jira] [--context <context>]"
  exit 1
fi

echo "Triggering analysis for: $FEATURE_DESCRIPTION"
echo "Create Jira tasks: $CREATE_JIRA"
echo ""

RESPONSE=$(curl -s -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg desc "$FEATURE_DESCRIPTION" \
    --argjson jira "$CREATE_JIRA" \
    --arg ctx "$ADDITIONAL_CONTEXT" \
    '{
      featureDescription: $desc,
      createJiraTasks: $jira,
      additionalContext: $ctx
    }')")

echo "Response:"
echo "$RESPONSE" | jq '.'
