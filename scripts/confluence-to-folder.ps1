# Reverse pipeline: pull a Confluence page (+ descendant pages) into a markdown folder.
# The opposite of folder-to-confluence.ps1. Delegates to the `acp pull-confluence` CLI
# (TS core holds the storage-XHTML -> markdown conversion + REST). Requires .env with CONFLUENCE_* creds.
#
# Usage:
#   ./scripts/confluence-to-folder.ps1 123456 ./out
#   ./scripts/confluence-to-folder.ps1 https://you.atlassian.net/wiki/spaces/T/pages/123456/Title ./out --force
$ErrorActionPreference = 'Stop'
$ProjectDir = Split-Path -Parent $PSScriptRoot

if ($args.Count -lt 2) {
  Write-Host 'Usage: confluence-to-folder.ps1 <page-id-or-url> <target-dir> [--no-recursive] [--force]'
  exit 1
}

if (-not (Test-Path (Join-Path $ProjectDir 'dist/cli/index.js'))) {
  Write-Host 'Building ai-confluence-pipeline...'
  Push-Location $ProjectDir; npm run build | Out-Null; Pop-Location
}

node (Join-Path $ProjectDir 'dist/cli/index.js') pull-confluence @args
