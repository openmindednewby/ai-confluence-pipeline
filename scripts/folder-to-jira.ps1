# ============================================================================
# Create a Jira Epic + linked Stories from markdown files.
#
# Usage:
#   .\scripts\folder-to-jira.ps1 -Epic path\to\epic.md -Tasks path\to\task1.md,path\to\task2.md
#   .\scripts\folder-to-jira.ps1 -Epic epic.md -Tasks (Get-ChildItem task-*.md) -DryRun
#
# Markdown format:
#   # Title
#   Description text.
#   ## Acceptance Criteria
#   - Given X, when Y, then Z
#   ## Priority
#   High
#   ## Estimate
#   M
#   ## Component
#   backend
#   ## Labels
#   auth, security
# ============================================================================

param(
    [Parameter(Mandatory = $true)]
    [string]$Epic,

    [string[]]$Tasks = @(),

    [switch]$DryRun
)

$ScriptDir = $PSScriptRoot
$ProjectDir = Split-Path $ScriptDir -Parent

# Load .env
$envFile = Join-Path $ProjectDir ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            [System.Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim(), "Process")
        }
    }
}

if (-not (Test-Path $Epic)) {
    Write-Host "Error: Epic file not found: $Epic" -ForegroundColor Red
    exit 1
}

# --- Parse markdown ---
function Parse-Markdown {
    param([string]$FilePath)
    $lines = Get-Content $FilePath

    $title = ($lines | Where-Object { $_ -match '^# ' } | Select-Object -First 1) -replace '^# ', ''

    $desc = @()
    $inDesc = $false
    foreach ($line in $lines) {
        if ($line -match '^# ' -and -not $inDesc) { $inDesc = $true; continue }
        if ($line -match '^## ' -and $inDesc) { break }
        if ($inDesc -and $line.Trim()) { $desc += $line.Trim() }
    }
    $description = $desc -join " "

    $criteria = @()
    $inCriteria = $false
    foreach ($line in $lines) {
        if ($line -match '^## Acceptance Criteria') { $inCriteria = $true; continue }
        if ($line -match '^## ' -and $inCriteria) { break }
        if ($inCriteria -and $line -match '^- (.+)') { $criteria += $Matches[1] }
    }

    function Get-Field($fieldName) {
        $inField = $false
        foreach ($line in $lines) {
            if ($line -match "^## $fieldName") { $inField = $true; continue }
            if ($line -match '^## ' -and $inField) { break }
            if ($inField -and $line.Trim()) { return $line.Trim() }
        }
        return ""
    }

    $priority = Get-Field "Priority"
    if (-not $priority) { $priority = if ($env:JIRA_DEFAULT_PRIORITY) { $env:JIRA_DEFAULT_PRIORITY } else { "Medium" } }

    $labels = @("n8n-pipeline-generated")
    $labelsStr = Get-Field "Labels"
    if ($labelsStr) { $labels += ($labelsStr -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
    $component = Get-Field "Component"
    if ($component) { $labels += $component }

    return @{
        title = $title
        description = $description
        criteria = $criteria
        priority = $priority
        estimate = (Get-Field "Estimate")
        component = $component
        labels = $labels
    }
}

# --- Build Jira body ---
function Build-JiraBody {
    param($Parsed, [string]$IssueType, [string]$ParentKey = "")

    $adfContent = @()
    if ($Parsed.description) {
        $adfContent += @{ type = "paragraph"; content = @(@{ type = "text"; text = $Parsed.description }) }
    }
    if ($Parsed.criteria.Count -gt 0) {
        $adfContent += @{ type = "heading"; attrs = @{ level = 3 }; content = @(@{ type = "text"; text = "Acceptance Criteria" }) }
        $listItems = $Parsed.criteria | ForEach-Object {
            @{ type = "listItem"; content = @(@{ type = "paragraph"; content = @(@{ type = "text"; text = $_ }) }) }
        }
        $adfContent += @{ type = "bulletList"; content = @($listItems) }
    }

    $fields = @{
        project   = @{ key = $env:JIRA_PROJECT_KEY }
        summary   = $Parsed.title
        description = @{ type = "doc"; version = 1; content = $adfContent }
        issuetype = @{ name = $IssueType }
        priority  = @{ name = $Parsed.priority }
        labels    = $Parsed.labels
    }

    if ($ParentKey) { $fields.parent = @{ key = $ParentKey } }

    return @{ fields = $fields } | ConvertTo-Json -Depth 20
}

# --- Main ---
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Markdown -> Jira (Epic + Tasks)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$epicParsed = Parse-Markdown $Epic
Write-Host "  Epic:  $Epic"
Write-Host "         -> $($epicParsed.title)"
Write-Host ""
Write-Host "  Tasks: $($Tasks.Count) file(s)"
foreach ($t in $Tasks) {
    if (Test-Path $t) {
        $tt = (Get-Content $t | Where-Object { $_ -match '^# ' } | Select-Object -First 1) -replace '^# ', ''
        Write-Host "         $t -> $tt"
    } else {
        Write-Host "         $t -> [NOT FOUND]" -ForegroundColor Red
    }
}
Write-Host ""

if ($DryRun) {
    Write-Host "[DRY RUN]" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Epic: $($epicParsed.title)"
    Write-Host "  Priority: $($epicParsed.priority)"
    Write-Host "  Criteria: $($epicParsed.criteria.Count) items"
    Write-Host ""
    foreach ($t in $Tasks) {
        if (-not (Test-Path $t)) { continue }
        $tp = Parse-Markdown $t
        Write-Host "Task: $($tp.title)"
        Write-Host "  File:      $t"
        Write-Host "  Priority:  $($tp.priority)"
        Write-Host "  Estimate:  $($tp.estimate)"
        Write-Host "  Component: $($tp.component)"
        Write-Host "  Criteria:  $($tp.criteria.Count) items"
        Write-Host ""
    }
    Write-Host "Run without -DryRun to create in Jira."
    exit 0
}

# Check env
if (-not $env:JIRA_BASE_URL -or -not $env:JIRA_EMAIL -or -not $env:JIRA_API_TOKEN -or -not $env:JIRA_PROJECT_KEY) {
    Write-Host "Error: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY must be set in .env" -ForegroundColor Red
    exit 1
}

$jiraAuth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${env:JIRA_EMAIL}:${env:JIRA_API_TOKEN}"))
$headers = @{ Authorization = "Basic $jiraAuth"; "Content-Type" = "application/json" }

# Create epic
$epicType = if ($env:JIRA_EPIC_ISSUE_TYPE) { $env:JIRA_EPIC_ISSUE_TYPE } else { "Epic" }
$epicBody = Build-JiraBody $epicParsed $epicType

Write-Host "Creating epic..."
try {
    $epicResp = Invoke-RestMethod -Uri "${env:JIRA_BASE_URL}/rest/api/3/issue" -Method POST -Headers $headers -Body $epicBody
    $epicKey = $epicResp.key
    Write-Host "  [$epicKey] $($epicParsed.title)" -ForegroundColor Green
    Write-Host "  URL: ${env:JIRA_BASE_URL}/browse/$epicKey"
} catch {
    Write-Host "Failed to create epic: $_" -ForegroundColor Red
    exit 1
}

# Create tasks
$storyType = if ($env:JIRA_STORY_ISSUE_TYPE) { $env:JIRA_STORY_ISSUE_TYPE } else { "Story" }
$created = 0

if ($Tasks.Count -gt 0) {
    Write-Host ""
    Write-Host "Creating tasks (linked to $epicKey)..."
    foreach ($t in $Tasks) {
        if (-not (Test-Path $t)) { Write-Host "  SKIPPED: $t (not found)" -ForegroundColor Yellow; continue }
        $tp = Parse-Markdown $t
        $taskBody = Build-JiraBody $tp $storyType $epicKey
        try {
            $taskResp = Invoke-RestMethod -Uri "${env:JIRA_BASE_URL}/rest/api/3/issue" -Method POST -Headers $headers -Body $taskBody
            Write-Host "  [$($taskResp.key)] $($tp.title) -> parent: $epicKey" -ForegroundColor Green
            $created++
        } catch {
            Write-Host "  FAILED: $($tp.title) - $_" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Done!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Epic:  $epicKey - $($epicParsed.title)"
Write-Host "  Tasks: $created created, linked to $epicKey"
Write-Host "  URL:   ${env:JIRA_BASE_URL}/browse/$epicKey"
