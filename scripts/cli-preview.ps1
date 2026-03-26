# ============================================================================
# Generate a technical analysis using the Claude CLI (Claude Code).
# No API keys or n8n needed — just the `claude` CLI authenticated.
#
# Prerequisites:
#   - claude CLI installed and authenticated (Claude Code / GitHub Copilot CLI)
#
# Usage:
#   .\scripts\cli-preview.ps1 -Description "Add user notification preferences"
#   .\scripts\cli-preview.ps1 -Description "Add user notifications" -Context "We use Firebase"
#   .\scripts\cli-preview.ps1 -Description "Migrate auth service" -Template tech-migration
#   .\scripts\cli-preview.ps1 -Description "Document payments service" -Template service-documentation
#   .\scripts\cli-preview.ps1 -Description "..." -Template service-documentation -Model claude-opus-4-6
#
# Available templates:
#   generic (default), new-feature, tech-migration, large-refactoring,
#   api-breaking-change, security-audit, performance-optimization,
#   scheduled-task-migration, adr, post-mortem, runbook,
#   service-documentation, bug-fix, dependency-update, tech-debt,
#   quick-enhancement
#
# Output:
#   preview\<timestamp>-<slug>.md    — readable markdown
#   preview\<timestamp>-<slug>.json  — raw analysis JSON
# ============================================================================

param(
    [Parameter(Mandatory = $true)]
    [string]$Description,

    [string]$Context = "",
    [string]$Template = "generic",
    [string]$Model = ""
)

# --- Check dependencies ---
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Host "Error: 'claude' CLI not found. Install Claude Code first." -ForegroundColor Red
    Write-Host "  npm install -g @anthropic-ai/claude-code"
    exit 1
}

$PreviewDir = Join-Path $PSScriptRoot "..\preview"
if (-not (Test-Path $PreviewDir)) { New-Item -ItemType Directory -Path $PreviewDir | Out-Null }

# --- Template roles ---
$Roles = @{
    "generic"                  = "You are a senior software architect performing technical analysis."
    "new-feature"              = "You are a senior software architect designing a new feature."
    "tech-migration"           = "You are a senior architect planning a technology migration. Must be incremental and reversible."
    "large-refactoring"        = "You are a senior architect planning a major refactoring. Must preserve existing behavior."
    "api-breaking-change"      = "You are a senior API architect planning a breaking change. Minimize consumer disruption."
    "security-audit"           = "You are a senior security engineer documenting audit findings with severity scores and fixes."
    "performance-optimization" = "You are a senior performance engineer with measurable improvement targets."
    "scheduled-task-migration" = "You are a senior architect migrating a legacy scheduled task to a modern job framework. Produce a Discovery Document and Migration Plan."
    "adr"                      = "You are a senior architect documenting an Architecture Decision Record."
    "post-mortem"              = "You are a senior SRE writing a blameless post-mortem."
    "runbook"                  = "You are a senior SRE writing a runbook. Every command must be copy-pasteable."
    "service-documentation"    = "You are a senior software engineer writing internal documentation for a service, application, or library. Your audience is developers new to this codebase who need to get up to speed quickly. Be specific and practical."
    "bug-fix"                  = "You are a senior developer triaging a bug with root cause analysis."
    "dependency-update"        = "You are a senior developer planning a dependency upgrade."
    "tech-debt"                = "You are a senior developer documenting tech debt with business justification."
    "quick-enhancement"        = "You are a senior developer scoping a small enhancement (< 1 day)."
}

# --- Template schemas ---
$Schemas = @{
    "generic"                  = 'Produce JSON with: title, summary, architecture (overview, components with name/type/description/changes, dataFlow), apiContracts (method, path, description, requestBody, responseBody, statusCodes), databaseChanges (type, entity, description, fields with name/type/nullable), edgeCases (scenario, impact, mitigation), securityConsiderations, testingStrategy (unitTests, integrationTests, e2eTests), tasks (type: epic|story|subtask, summary, description, component, estimate: XS|S|M|L|XL, priority, acceptanceCriteria in Given/When/Then), estimatedComplexity, suggestedApproach.'
    "new-feature"              = 'Produce JSON with: title, summary, architecture (overview, components with name/type/description/changes, dataFlow), apiContracts (method, path, description, requestBody, responseBody, statusCodes), databaseChanges (type, entity, description, fields with name/type/nullable), edgeCases (scenario, impact, mitigation), securityConsiderations, testingStrategy (unitTests, integrationTests, e2eTests), tasks (type: epic|story|subtask, summary, description, component, estimate: XS|S|M|L|XL, priority, acceptanceCriteria in Given/When/Then), estimatedComplexity, suggestedApproach.'
    "tech-migration"           = 'Produce JSON with: title, currentState (technology, version, usage, knownIssues), targetState (technology, version, benefits, tradeoffs), impactAnalysis (affectedServices with impactLevel, affectedTeams, breakingChanges, dataChanges), migrationStrategy (approach: strangler-fig|parallel-run|feature-flag, reasoning, parallelRunPeriod, featureFlags), phases (name, goal, prerequisite, canRollback, rollbackSteps, tasks, validationChecks), rollbackPlan (fullRollbackSteps, pointOfNoReturn, dataRollback), testing (parallelRunTests, regressionTests, newTests, performanceBenchmarks), risks with contingency, timeline.'
    "large-refactoring"        = 'Produce JSON with: title, summary, architecture (overview, components with name/type/description/changes, dataFlow), apiContracts (method, path, description, requestBody, responseBody, statusCodes), databaseChanges (type, entity, description, fields with name/type/nullable), edgeCases (scenario, impact, mitigation), securityConsiderations, testingStrategy (unitTests, integrationTests, e2eTests), tasks (type: epic|story|subtask, summary, description, component, estimate: XS|S|M|L|XL, priority, acceptanceCriteria in Given/When/Then), estimatedComplexity, suggestedApproach.'
    "api-breaking-change"      = 'Produce JSON with: title, summary, currentContract (endpoints, consumers with impactLevel), proposedContract (endpoints with changeType, versioningStrategy), diff (field, before, after, breakingReason, migrationAction), migrationPlan (strategy, phases, deprecationTimeline, migrationGuide with steps and codeExamples), communication (announcement, channels, faq), tasks, testing (contractTests, migrationTests, compatibilityTests), rollbackPlan, risks.'
    "security-audit"           = 'Produce JSON with: title, auditScope (areasReviewed, areasOutOfScope, methodology), overallRisk, findingsCount by severity, findings (id like SEC-001, title, severity, category, owaspCategory, description, affectedComponent, reproductionSteps, impact, exploitability, evidence, remediation with recommendation/codeExample/effort/priority), positiveFindings, recommendations (immediate, shortTerm, longTerm), tasks, complianceNotes, retestDate.'
    "performance-optimization" = 'Produce JSON with: title, currentState (metrics with name/currentValue/target/gap, userImpact, businessImpact), analysis (bottlenecks with location/type/description/evidence/contribution%, hotPaths, redHerrings), optimizations (id like OPT-001, title, description, type, targetBottleneck, expectedImprovement, confidence, effort, risk, tradeoff), quickWins, benchmarkPlan (tooling, baselineTests, regressionTests, loadProfile), tasks, monitoringPlan (dashboards, alerts, continuousBaseline), antiPatterns.'
    "scheduled-task-migration" = 'Produce JSON with: title, summary, discoveryDocument (purpose with what/why/when, codeLocation with workerClass/baseClass/entryPoint/projectFile/supportingFiles each with path, howItWorks with entryFlow and coreAlgorithm steps each with codeSample and sourceFile and lineRange, dataAccess with databases and externalServices, errorHandling with strategy and codeSample, inputsAndOutputs with inputs/outputs/sideEffects, configuration, knownIssues, runInstructions with prerequisites/buildSteps/runSteps/debugSteps/testSteps), migrationPlan (targetDesign with projectName/className/jobId/interface/targetPath/namespace, dependencyMapping with mappings each having legacy/legacyFile/target/action, phases each with name/goal/prerequisite/canRollback/rollbackSteps/attentionPoints/tasks/validationChecks, improvements with codeQuality/linting/testing/performance/observability, cleanupPhase with filesToRemove and configToRemove, risks, openQuestions), estimatedComplexity, suggestedApproach. Every code reference MUST include file path.'
    "adr"                      = 'Produce JSON with: title, status (Proposed), date, context (background, constraints, drivers, assumptions), options (each with name, description, pros, cons, effort, risk, operationalImpact, teamFamiliarity), decision (chosen, reasoning, dissent), consequences (positive, negative, neutral), followUp (actions, reviewDate, reversibility).'
    "post-mortem"              = 'Produce JSON with: title, severity (SEV1-4), duration, status, summary, impact (usersAffected, revenueImpact, dataLoss, slaBreached), timeline (timestamp, event, actor), rootCause (primary, contributing, fiveWhys), detection (howDetected, timeToDetect, alertsFired, alertsExpectedButMissing), response (timeToMitigate, mitigationSteps, whatWorkedWell, whatCouldBeImproved), actionItems (description, type: prevent|detect|mitigate, priority, owner, deadline), lessonsLearned.'
    "runbook"                  = 'Produce JSON with: title, service, overview (purpose, criticality, dependencies, dependents), healthChecks (name, command, healthyOutput, unhealthyOutput), commonIssues (symptom, cause, diagnosis steps, resolution steps, escalation), procedures (name, when, steps with instruction/expectedResult/ifFailed, rollback), contacts, links.'
    "service-documentation"    = 'Produce JSON with: title, summary, overview (purpose, type: service|application|library|cli-tool|worker|scheduled-job, techStack, repository, owners), keyFiles (path, purpose, notes), architecture (overview, entryPoint, keyModules with name/path/responsibility/publicInterface, dataFlow), howToRun (prerequisites, setup steps, run with development/production/docker commands, environment with variable/description/required/default, verification), directoryStructure (description, tree with path/description), potentialIssues (issue, severity: low|medium|high, context, workaround), improvements (title, description, effort: XS|S|M|L|XL, impact: low|medium|high, category: code-quality|performance|reliability|developer-experience|security|testing), dependencies (runtime, external, consumers), testing (howToTest, testStructure, coverage).'
    "bug-fix"                  = 'Produce JSON with: title, severity, description, reproductionSteps, expectedBehavior, actualBehavior, rootCause (hypothesis, confidence, investigation), fixApproach (description, affectedFiles, riskLevel), tasks as subtasks with acceptanceCriteria, testPlan (unitTests, manualVerification), workaround.'
    "dependency-update"        = 'Produce JSON with: title, packages (name, currentVersion, targetVersion, changelog, breakingChanges with description/affectedCode/migration, newFeatures, deprecations), riskAssessment (overall, peerDependencies, knownIssues), tasks as subtasks, verificationPlan, rollbackPlan.'
    "tech-debt"                = 'Produce JSON with: title, currentState (description, pain, frequency), desiredState (description, benefit), justification (developerProductivity, reliability, riskReduction, onboarding), approach (description, canBeIncremental, estimatedEffort, bestTimeToFix), acceptanceCriteria, risks.'
    "quick-enhancement"        = 'Produce JSON with: title, description, scope (includes, excludes, isActuallyBigger, biggerNote), implementation (approach, affectedFiles, estimate max M), acceptanceCriteria (max 5), testPlan.'
}

# --- Build prompt ---
$Role = if ($Roles.ContainsKey($Template)) { $Roles[$Template] } else { $Roles["generic"] }
$Schema = if ($Schemas.ContainsKey($Template)) { $Schemas[$Template] } else { $Schemas["generic"] }

$Prompt = @"
${Role}

Analyze the following and produce a detailed JSON response.

## Description
${Description}

## Additional Context
${Context}

## Output

Respond ONLY with valid JSON. No markdown code fences, no explanation — just the JSON object.

${Schema}

Also include: title, summary, estimatedComplexity (low|medium|high), suggestedApproach.
Rules: Tasks 1-3 day items. Gherkin acceptance criteria. Be specific. XS(<2h) S(2-4h) M(4-8h) L(1-2d) XL(2-3d).
"@

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  AI Technical Analysis (Claude CLI)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Template:    $Template"
Write-Host "  Description: $($Description.Substring(0, [Math]::Min(80, $Description.Length)))..."
if ($Context) { Write-Host "  Context:     $($Context.Substring(0, [Math]::Min(80, $Context.Length)))..." }
Write-Host ""
Write-Host "  Calling claude CLI... (this takes 15-60 seconds)" -ForegroundColor Yellow
Write-Host ""

# --- Write prompt to temp file and call claude ---
$TmpFile = [System.IO.Path]::GetTempFileName()
$Prompt | Out-File -FilePath $TmpFile -Encoding utf8

$claudeArgs = @("-p", "--output-format", "text")
if ($Model) { $claudeArgs += @("--model", $Model) }

try {
    $RawResponse = Get-Content $TmpFile -Raw | claude @claudeArgs 2>$null
    if ($LASTEXITCODE -ne 0) { throw "claude CLI returned exit code $LASTEXITCODE" }
}
catch {
    Write-Host "Error: claude CLI failed. Make sure it's authenticated." -ForegroundColor Red
    Write-Host "  Run 'claude' interactively first to log in."
    Remove-Item $TmpFile -ErrorAction SilentlyContinue
    exit 1
}
Remove-Item $TmpFile -ErrorAction SilentlyContinue

# --- Extract JSON from response (strip code fences if present) ---
$JsonResponse = $RawResponse
if ($JsonResponse -match '```json') {
    $JsonResponse = ($JsonResponse -split '```json')[1]
    $JsonResponse = ($JsonResponse -split '```')[0].Trim()
}
elseif ($JsonResponse -match '```') {
    $JsonResponse = ($JsonResponse -split '```')[1]
    $JsonResponse = ($JsonResponse -split '```')[0].Trim()
}

# Validate JSON
try {
    $Analysis = $JsonResponse | ConvertFrom-Json
}
catch {
    Write-Host "Warning: AI response was not valid JSON. Saving raw output." -ForegroundColor Yellow
    $RawResponse | Out-File -FilePath (Join-Path $PreviewDir "failed-response.txt") -Encoding utf8
    Write-Host "Raw response saved to: preview\failed-response.txt"
    exit 1
}

# --- Create filename ---
$Title = if ($Analysis.title) { $Analysis.title } else { "Analysis" }
$Slug = ($Title.ToLower() -replace '[^a-z0-9]', '-' -replace '-+', '-' -replace '^-|-$', '')
$Slug = $Slug.Substring(0, [Math]::Min(50, $Slug.Length))
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Filename = "${Timestamp}-${Slug}"

# --- Generate markdown ---
$Date = Get-Date -Format "yyyy-MM-dd"
$Complexity = if ($Analysis.estimatedComplexity) { $Analysis.estimatedComplexity } else { "unknown" }
$Approach = if ($Analysis.suggestedApproach) { $Analysis.suggestedApproach } else { "" }
$Summary = if ($Analysis.summary) { $Analysis.summary } else { "" }

$md = @()
$md += "# $Title"
$md += ""
$md += "> Generated on $Date by [ai-confluence-pipeline](https://github.com/openmindednewby/ai-confluence-pipeline) via Claude CLI"
$md += ""
$md += "**Complexity:** $Complexity | **Approach:** $Approach"
$md += ""
$md += "---"
$md += ""
if ($Summary) {
    $md += "## Summary"
    $md += ""
    $md += $Summary
    $md += ""
}

# Render remaining sections from JSON
function Render-Section {
    param($Obj, $Depth)
    $lines = @()
    $skip = @("title", "summary", "estimatedComplexity", "suggestedApproach")
    $hPrefix = "#" * [Math]::Min($Depth + 2, 4)

    if ($Obj -is [System.Collections.IList]) {
        foreach ($item in $Obj) {
            if ($item -is [string]) {
                $lines += "- $item"
            }
            elseif ($item -is [PSCustomObject]) {
                $parts = @()
                foreach ($prop in $item.PSObject.Properties) {
                    $val = $prop.Value
                    if ($val -is [System.Collections.IList]) { $val = ($val -join ", ") }
                    elseif ($val -is [PSCustomObject]) { $val = ($val | ConvertTo-Json -Compress) }
                    $parts += "**$($prop.Name):** $val"
                }
                $lines += "- " + ($parts -join " | ")
            }
            else {
                $lines += "- $item"
            }
        }
        $lines += ""
    }
    elseif ($Obj -is [PSCustomObject]) {
        foreach ($prop in $Obj.PSObject.Properties) {
            if ($Depth -eq 0 -and $skip -contains $prop.Name) { continue }
            $heading = ($prop.Name -creplace '([A-Z])', ' $1').Trim()
            $heading = $heading.Substring(0,1).ToUpper() + $heading.Substring(1)
            $val = $prop.Value

            if ($val -is [string] -or $val -is [int] -or $val -is [bool] -or $val -is [double]) {
                $lines += "**${heading}:** $val"
                $lines += ""
            }
            elseif ($val -is [System.Collections.IList] -and $val.Count -gt 0 -and $val[0] -is [string]) {
                $lines += "**${heading}:**"
                foreach ($item in $val) { $lines += "- $item" }
                $lines += ""
            }
            elseif ($val -is [PSCustomObject] -or ($val -is [System.Collections.IList])) {
                $lines += "$hPrefix $heading"
                $lines += ""
                $lines += (Render-Section -Obj $val -Depth ($Depth + 1))
            }
            else {
                $lines += "**${heading}:** $val"
                $lines += ""
            }
        }
    }
    return $lines
}

$md += (Render-Section -Obj $Analysis -Depth 0)

# Save markdown
($md -join "`n") | Out-File -FilePath (Join-Path $PreviewDir "${Filename}.md") -Encoding utf8

# Save JSON
$JsonResponse | Out-File -FilePath (Join-Path $PreviewDir "${Filename}.json") -Encoding utf8

Write-Host "============================================" -ForegroundColor Green
Write-Host "  Preview saved!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Markdown: preview\${Filename}.md"
Write-Host "  Data:     preview\${Filename}.json"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Review and edit: preview\${Filename}.md"
Write-Host "  2. Push to Confluence: .\scripts\push-to-confluence.ps1 -File preview\${Filename}.json"
Write-Host "  3. Push + Jira tickets: .\scripts\push-to-confluence.ps1 -File preview\${Filename}.json -CreateJira"
