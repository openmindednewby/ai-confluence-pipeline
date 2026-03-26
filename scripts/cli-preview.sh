#!/usr/bin/env bash
# ============================================================================
# Generate a technical analysis using the Claude CLI (Claude Code).
# No API keys or n8n needed — just the `claude` CLI authenticated.
#
# Prerequisites:
#   - claude CLI installed and authenticated (Claude Code / GitHub Copilot CLI)
#   - jq installed (for JSON parsing)
#
# Usage:
#   ./scripts/cli-preview.sh "Add user notification preferences"
#   ./scripts/cli-preview.sh "Add user notification preferences" --context "We use Firebase"
#   ./scripts/cli-preview.sh "Migrate auth service" --template tech-migration
#   ./scripts/cli-preview.sh "Document the payments service" --template service-documentation
#
# Available templates:
#   generic (default), new-feature, tech-migration, large-refactoring,
#   api-breaking-change, security-audit, performance-optimization,
#   scheduled-task-migration, adr, post-mortem, runbook,
#   service-documentation, bug-fix, dependency-update, tech-debt,
#   quick-enhancement
#
# Output:
#   preview/<timestamp>-<slug>.md    — readable markdown
#   preview/<timestamp>-<slug>.json  — raw analysis JSON
# ============================================================================

set -euo pipefail

# --- Parse arguments ---
FEATURE_DESCRIPTION=""
ADDITIONAL_CONTEXT=""
TEMPLATE="generic"
MODEL=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --context)
      ADDITIONAL_CONTEXT="$2"
      shift 2
      ;;
    --template)
      TEMPLATE="$2"
      shift 2
      ;;
    --model)
      MODEL="$2"
      shift 2
      ;;
    --help|-h)
      head -24 "$0" | tail -22
      exit 0
      ;;
    -*)
      echo "Unknown option: $1"
      exit 1
      ;;
    *)
      FEATURE_DESCRIPTION="$1"
      shift
      ;;
  esac
done

if [ -z "$FEATURE_DESCRIPTION" ]; then
  echo "Usage: $0 <description> [--template <template>] [--context <context>] [--model <model>]"
  echo "Run with --help for full usage info."
  exit 1
fi

# Check dependencies
if ! command -v claude &> /dev/null; then
  echo "Error: 'claude' CLI not found. Install Claude Code first."
  echo "  npm install -g @anthropic-ai/claude-code"
  exit 1
fi

if ! command -v jq &> /dev/null; then
  echo "Error: 'jq' not found. Install it first."
  echo "  brew install jq  (macOS)"
  echo "  apt install jq   (Linux)"
  echo "  choco install jq (Windows)"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PREVIEW_DIR="$PROJECT_DIR/preview"
mkdir -p "$PREVIEW_DIR"

# --- Template roles ---
get_role() {
  case "$1" in
    new-feature)              echo "You are a senior software architect designing a new feature." ;;
    tech-migration)           echo "You are a senior architect planning a technology migration. Must be incremental and reversible." ;;
    large-refactoring)        echo "You are a senior architect planning a major refactoring. Must preserve existing behavior." ;;
    api-breaking-change)      echo "You are a senior API architect planning a breaking change. Minimize consumer disruption." ;;
    security-audit)           echo "You are a senior security engineer documenting audit findings with severity scores and fixes." ;;
    performance-optimization) echo "You are a senior performance engineer with measurable improvement targets." ;;
    scheduled-task-migration) echo "You are a senior architect migrating a legacy scheduled task to a modern job framework. Produce a Discovery Document and Migration Plan." ;;
    adr)                      echo "You are a senior architect documenting an Architecture Decision Record." ;;
    post-mortem)              echo "You are a senior SRE writing a blameless post-mortem." ;;
    runbook)                  echo "You are a senior SRE writing a runbook. Every command must be copy-pasteable." ;;
    service-documentation)    echo "You are a senior software engineer writing internal documentation for a service, application, or library. Your audience is developers new to this codebase who need to get up to speed quickly. Be specific and practical." ;;
    bug-fix)                  echo "You are a senior developer triaging a bug with root cause analysis." ;;
    dependency-update)        echo "You are a senior developer planning a dependency upgrade." ;;
    tech-debt)                echo "You are a senior developer documenting tech debt with business justification." ;;
    quick-enhancement)        echo "You are a senior developer scoping a small enhancement (< 1 day)." ;;
    *)                        echo "You are a senior software architect performing technical analysis." ;;
  esac
}

# --- Template schemas ---
get_schema() {
  case "$1" in
    new-feature|generic|legacy-technical)
      echo 'Produce JSON with: title, summary, architecture (overview, components with name/type/description/changes, dataFlow), apiContracts (method, path, description, requestBody, responseBody, statusCodes), databaseChanges (type, entity, description, fields with name/type/nullable), edgeCases (scenario, impact, mitigation), securityConsiderations, testingStrategy (unitTests, integrationTests, e2eTests), tasks (type: epic|story|subtask, summary, description, component, estimate: XS|S|M|L|XL, priority, acceptanceCriteria in Given/When/Then), estimatedComplexity, suggestedApproach.' ;;
    tech-migration)
      echo 'Produce JSON with: title, currentState (technology, version, usage, knownIssues), targetState (technology, version, benefits, tradeoffs), impactAnalysis (affectedServices with impactLevel, affectedTeams, breakingChanges, dataChanges), migrationStrategy (approach: strangler-fig|parallel-run|feature-flag, reasoning, parallelRunPeriod, featureFlags), phases (name, goal, prerequisite, canRollback, rollbackSteps, tasks, validationChecks), rollbackPlan (fullRollbackSteps, pointOfNoReturn, dataRollback), testing (parallelRunTests, regressionTests, newTests, performanceBenchmarks), risks with contingency, timeline.' ;;
    large-refactoring)
      echo 'Produce JSON with: title, summary, architecture (overview, components with name/type/description/changes, dataFlow), apiContracts (method, path, description, requestBody, responseBody, statusCodes), databaseChanges (type, entity, description, fields with name/type/nullable), edgeCases (scenario, impact, mitigation), securityConsiderations, testingStrategy (unitTests, integrationTests, e2eTests), tasks (type: epic|story|subtask, summary, description, component, estimate: XS|S|M|L|XL, priority, acceptanceCriteria in Given/When/Then), estimatedComplexity, suggestedApproach.' ;;
    api-breaking-change)
      echo 'Produce JSON with: title, summary, currentContract (endpoints, consumers with impactLevel), proposedContract (endpoints with changeType, versioningStrategy), diff (field, before, after, breakingReason, migrationAction), migrationPlan (strategy, phases, deprecationTimeline, migrationGuide with steps and codeExamples), communication (announcement, channels, faq), tasks, testing (contractTests, migrationTests, compatibilityTests), rollbackPlan, risks.' ;;
    security-audit)
      echo 'Produce JSON with: title, auditScope (areasReviewed, areasOutOfScope, methodology), overallRisk, findingsCount by severity, findings (id like SEC-001, title, severity, category, owaspCategory, description, affectedComponent, reproductionSteps, impact, exploitability, evidence, remediation with recommendation/codeExample/effort/priority), positiveFindings, recommendations (immediate, shortTerm, longTerm), tasks, complianceNotes, retestDate.' ;;
    performance-optimization)
      echo 'Produce JSON with: title, currentState (metrics with name/currentValue/target/gap, userImpact, businessImpact), analysis (bottlenecks with location/type/description/evidence/contribution%, hotPaths, redHerrings), optimizations (id like OPT-001, title, description, type, targetBottleneck, expectedImprovement, confidence, effort, risk, tradeoff), quickWins, benchmarkPlan (tooling, baselineTests, regressionTests, loadProfile), tasks, monitoringPlan (dashboards, alerts, continuousBaseline), antiPatterns.' ;;
    scheduled-task-migration)
      echo 'Produce JSON with: title, summary, discoveryDocument (purpose with what/why/when, codeLocation with workerClass/baseClass/entryPoint/projectFile/supportingFiles each with path, howItWorks with entryFlow and coreAlgorithm steps each with codeSample and sourceFile and lineRange, dataAccess with databases and externalServices, errorHandling with strategy and codeSample, inputsAndOutputs with inputs/outputs/sideEffects, configuration, knownIssues, runInstructions with prerequisites/buildSteps/runSteps/debugSteps/testSteps), migrationPlan (targetDesign with projectName/className/jobId/interface/targetPath/namespace, dependencyMapping with mappings each having legacy/legacyFile/target/action, phases each with name/goal/prerequisite/canRollback/rollbackSteps/attentionPoints/tasks/validationChecks, improvements with codeQuality/linting/testing/performance/observability, cleanupPhase with filesToRemove and configToRemove, risks, openQuestions), estimatedComplexity, suggestedApproach. Every code reference MUST include file path.' ;;
    adr)
      echo 'Produce JSON with: title, status (Proposed), date, context (background, constraints, drivers, assumptions), options (each with name, description, pros, cons, effort, risk, operationalImpact, teamFamiliarity), decision (chosen, reasoning, dissent), consequences (positive, negative, neutral), followUp (actions, reviewDate, reversibility).' ;;
    post-mortem)
      echo 'Produce JSON with: title, severity (SEV1-4), duration, status, summary, impact (usersAffected, revenueImpact, dataLoss, slaBreached), timeline (timestamp, event, actor), rootCause (primary, contributing, fiveWhys), detection (howDetected, timeToDetect, alertsFired, alertsExpectedButMissing), response (timeToMitigate, mitigationSteps, whatWorkedWell, whatCouldBeImproved), actionItems (description, type: prevent|detect|mitigate, priority, owner, deadline), lessonsLearned.' ;;
    runbook)
      echo 'Produce JSON with: title, service, overview (purpose, criticality, dependencies, dependents), healthChecks (name, command, healthyOutput, unhealthyOutput), commonIssues (symptom, cause, diagnosis steps, resolution steps, escalation), procedures (name, when, steps with instruction/expectedResult/ifFailed, rollback), contacts, links.' ;;
    service-documentation)
      echo 'Produce JSON with: title, summary, overview (purpose, type: service|application|library|cli-tool|worker|scheduled-job, techStack, repository, owners), keyFiles (path, purpose, notes), architecture (overview, entryPoint, keyModules with name/path/responsibility/publicInterface, dataFlow), howToRun (prerequisites, setup steps, run with development/production/docker commands, environment with variable/description/required/default, verification), directoryStructure (description, tree with path/description), potentialIssues (issue, severity: low|medium|high, context, workaround), improvements (title, description, effort: XS|S|M|L|XL, impact: low|medium|high, category: code-quality|performance|reliability|developer-experience|security|testing), dependencies (runtime, external, consumers), testing (howToTest, testStructure, coverage).' ;;
    bug-fix)
      echo 'Produce JSON with: title, severity, description, reproductionSteps, expectedBehavior, actualBehavior, rootCause (hypothesis, confidence, investigation), fixApproach (description, affectedFiles, riskLevel), tasks as subtasks with acceptanceCriteria, testPlan (unitTests, manualVerification), workaround.' ;;
    dependency-update)
      echo 'Produce JSON with: title, packages (name, currentVersion, targetVersion, changelog, breakingChanges with description/affectedCode/migration, newFeatures, deprecations), riskAssessment (overall, peerDependencies, knownIssues), tasks as subtasks, verificationPlan, rollbackPlan.' ;;
    tech-debt)
      echo 'Produce JSON with: title, currentState (description, pain, frequency), desiredState (description, benefit), justification (developerProductivity, reliability, riskReduction, onboarding), approach (description, canBeIncremental, estimatedEffort, bestTimeToFix), acceptanceCriteria, risks.' ;;
    quick-enhancement)
      echo 'Produce JSON with: title, description, scope (includes, excludes, isActuallyBigger, biggerNote), implementation (approach, affectedFiles, estimate max M), acceptanceCriteria (max 5), testPlan.' ;;
    *)
      echo 'Produce JSON with: title, summary, architecture (overview, components with name/type/description/changes, dataFlow), apiContracts (method, path, description, requestBody, responseBody, statusCodes), databaseChanges (type, entity, description, fields with name/type/nullable), edgeCases (scenario, impact, mitigation), securityConsiderations, testingStrategy (unitTests, integrationTests, e2eTests), tasks (type: epic|story|subtask, summary, description, component, estimate: XS|S|M|L|XL, priority, acceptanceCriteria in Given/When/Then), estimatedComplexity, suggestedApproach.' ;;
  esac
}

# --- Build the prompt ---
ROLE=$(get_role "$TEMPLATE")
SCHEMA=$(get_schema "$TEMPLATE")

PROMPT="${ROLE}

Analyze the following and produce a detailed JSON response.

## Description
${FEATURE_DESCRIPTION}

## Additional Context
${ADDITIONAL_CONTEXT}

## Output

Respond ONLY with valid JSON. No markdown code fences, no explanation — just the JSON object.

${SCHEMA}

Also include: title, summary, estimatedComplexity (low|medium|high), suggestedApproach.
Rules: Tasks 1-3 day items. Gherkin acceptance criteria. Be specific. XS(<2h) S(2-4h) M(4-8h) L(1-2d) XL(2-3d)."

echo "============================================"
echo "  AI Technical Analysis (Claude CLI)"
echo "============================================"
echo ""
echo "  Template:    $TEMPLATE"
echo "  Description: ${FEATURE_DESCRIPTION:0:80}..."
[ -n "$ADDITIONAL_CONTEXT" ] && echo "  Context:     ${ADDITIONAL_CONTEXT:0:80}..."
echo ""
echo "  Calling claude CLI... (this takes 15-60 seconds)"
echo ""

# --- Write prompt to temp file and call claude ---
TMPFILE=$(mktemp)
echo "$PROMPT" > "$TMPFILE"

CLAUDE_ARGS=(-p --output-format text)
[ -n "$MODEL" ] && CLAUDE_ARGS+=(--model "$MODEL")

RAW_RESPONSE=$(cat "$TMPFILE" | claude "${CLAUDE_ARGS[@]}" 2>/dev/null) || {
  echo "Error: claude CLI failed. Make sure it's authenticated."
  echo "  Run 'claude' interactively first to log in."
  rm -f "$TMPFILE"
  exit 1
}
rm -f "$TMPFILE"

# --- Extract JSON from response (strip code fences if present) ---
JSON_RESPONSE="$RAW_RESPONSE"
if echo "$JSON_RESPONSE" | grep -q '```json'; then
  JSON_RESPONSE=$(echo "$JSON_RESPONSE" | sed -n '/```json/,/```/p' | sed '1d;$d')
elif echo "$JSON_RESPONSE" | grep -q '```'; then
  JSON_RESPONSE=$(echo "$JSON_RESPONSE" | sed -n '/```/,/```/p' | sed '1d;$d')
fi

# Validate JSON
if ! echo "$JSON_RESPONSE" | jq empty 2>/dev/null; then
  echo "Warning: AI response was not valid JSON. Saving raw output."
  echo "$RAW_RESPONSE" > "${PREVIEW_DIR}/failed-response.txt"
  echo "Raw response saved to: preview/failed-response.txt"
  exit 1
fi

# --- Extract title and create filename ---
TITLE=$(echo "$JSON_RESPONSE" | jq -r '.title // "Analysis"')
SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//' | cut -c1-50)
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
FILENAME="${TIMESTAMP}-${SLUG}"

# --- Generate markdown from JSON ---
COMPLEXITY=$(echo "$JSON_RESPONSE" | jq -r '.estimatedComplexity // "unknown"')
APPROACH=$(echo "$JSON_RESPONSE" | jq -r '.suggestedApproach // ""')
SUMMARY=$(echo "$JSON_RESPONSE" | jq -r '.summary // ""')
DATE=$(date +%Y-%m-%d)

{
  echo "# ${TITLE}"
  echo ""
  echo "> Generated on ${DATE} by [ai-confluence-pipeline](https://github.com/openmindednewby/ai-confluence-pipeline) via Claude CLI"
  echo ""
  echo "**Complexity:** ${COMPLEXITY} | **Approach:** ${APPROACH}"
  echo ""
  echo "---"
  echo ""
  [ -n "$SUMMARY" ] && echo "## Summary" && echo "" && echo "$SUMMARY" && echo ""

  # Render remaining top-level keys as sections
  echo "$JSON_RESPONSE" | jq -r '
    to_entries[]
    | select(.key != "title" and .key != "summary" and .key != "estimatedComplexity" and .key != "suggestedApproach")
    | "## " + (.key | gsub("(?<a>[A-Z])"; " \(.a)") | ltrimstr(" ") | split("") | [first | ascii_upcase] + .[1:] | join("")) + "\n\n" +
      (if (.value | type) == "string" then .value
       elif (.value | type) == "array" then
         (.value | map(
           if type == "string" then "- " + .
           elif type == "object" then
             (to_entries | map("**" + .key + ":** " + (if (.value | type) == "array" then (.value | join(", ")) elif (.value | type) == "object" then (.value | tostring) else (.value | tostring) end)) | join("\n") | . + "\n")
           else tostring
           end
         ) | join("\n"))
       elif (.value | type) == "object" then
         (.value | to_entries | map(
           "### " + (.key | gsub("(?<a>[A-Z])"; " \(.a)") | ltrimstr(" ") | split("") | [first | ascii_upcase] + .[1:] | join("")) + "\n\n" +
           (if (.value | type) == "string" then .value
            elif (.value | type) == "array" then
              (.value | map(
                if type == "string" then "- " + .
                elif type == "object" then
                  (to_entries | map("**" + .key + ":** " + (if (.value | type) == "array" then (.value | join(", ")) elif (.value | type) == "object" then (.value | tostring) else (.value | tostring) end)) | join(" | ") | "- " + .)
                else "- " + tostring
                end
              ) | join("\n"))
            else (.value | tostring)
            end)
         ) | join("\n\n"))
       else (.value | tostring)
       end) + "\n"
  '
} > "${PREVIEW_DIR}/${FILENAME}.md"

# Save raw JSON
echo "$JSON_RESPONSE" | jq '.' > "${PREVIEW_DIR}/${FILENAME}.json"

echo "============================================"
echo "  Preview saved!"
echo "============================================"
echo ""
echo "  Markdown: preview/${FILENAME}.md"
echo "  Data:     preview/${FILENAME}.json"
echo ""
echo "Next steps:"
echo "  1. Review and edit: preview/${FILENAME}.md"
echo "  2. Push to Confluence: ./scripts/push-to-confluence.sh preview/${FILENAME}.json"
echo "  3. Push + Jira tickets: ./scripts/push-to-confluence.sh preview/${FILENAME}.json --jira"
