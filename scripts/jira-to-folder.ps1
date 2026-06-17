# Reverse pipeline: pull a Jira Epic (+ Stories + Sub-tasks) into a markdown folder.
# The opposite of folder-to-jira.ps1. Delegates to the `acp pull-jira` CLI (TS core
# holds the ADF -> markdown conversion + REST). Requires .env with JIRA_* creds.
#
# Usage:
#   ./scripts/jira-to-folder.ps1 PROJ-12 ./out
#   ./scripts/jira-to-folder.ps1 https://you.atlassian.net/browse/PROJ-12 ./out --no-recursive --force
$ErrorActionPreference = 'Stop'
$ProjectDir = Split-Path -Parent $PSScriptRoot

if ($args.Count -lt 2) {
  Write-Host 'Usage: jira-to-folder.ps1 <epic-key-or-url> <target-dir> [--no-recursive] [--force]'
  exit 1
}

if (-not (Test-Path (Join-Path $ProjectDir 'dist/cli/index.js'))) {
  Write-Host 'Building ai-confluence-pipeline...'
  Push-Location $ProjectDir; npm run build | Out-Null; Pop-Location
}

node (Join-Path $ProjectDir 'dist/cli/index.js') pull-jira @args
