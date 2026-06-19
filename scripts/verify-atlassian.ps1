# Verify LIVE Atlassian access end-to-end, read-only (see verify-atlassian.sh for details).
#   .\scripts\verify-atlassian.ps1 -Epic PROJ-12 [-Page 123456]
# Needs JIRA_* (and CONFLUENCE_* if -Page is given) in .env.
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string]$Epic,
  [string]$Page = ''
)
$ErrorActionPreference = 'Stop'
$ProjectDir = Split-Path -Parent $PSScriptRoot
$Cli = Join-Path $ProjectDir 'dist/cli/index.js'
$Tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("acp-verify-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $Tmp | Out-Null
try {
  Write-Host "==> [1/3] pull-jira $Epic  (read-only GET)"
  node $Cli pull-jira $Epic (Join-Path $Tmp 'jira')
  Write-Host "==> [3/3] push-folder --dry-run  (resolves writes, no calls)"
  node $Cli push-folder (Join-Path $Tmp 'jira') --dry-run | Out-Null
  Write-Host "    jira write-path OK"

  if ($Page) {
    Write-Host "==> [2/3] pull-confluence $Page  (read-only GET)"
    node $Cli pull-confluence $Page (Join-Path $Tmp 'conf')
    node $Cli push-folder (Join-Path $Tmp 'conf') --dry-run | Out-Null
    Write-Host "    confluence write-path OK"
  }
  Write-Host ''
  Write-Host '✅ Live Atlassian access verified (read-only). No content was created or modified.'
}
finally {
  Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
}
