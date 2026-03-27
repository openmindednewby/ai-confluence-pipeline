# ============================================================================
# Create a Confluence page from one or more markdown files.
#
# Usage:
#   .\scripts\folder-to-confluence.ps1 -Page docs\overview.md
#   .\scripts\folder-to-confluence.ps1 -Page docs\overview.md -Sections docs\setup.md,docs\api.md
#   .\scripts\folder-to-confluence.ps1 -Page docs\overview.md -Title "My Docs" -Labels "docs,api"
#   .\scripts\folder-to-confluence.ps1 -Page docs\overview.md -ParentPageId 12345
#   .\scripts\folder-to-confluence.ps1 -Page docs\overview.md -DryRun
# ============================================================================

param(
    [Parameter(Mandatory = $true)]
    [string]$Page,

    [string[]]$Sections = @(),
    [string]$Title = "",
    [string]$ParentPageId = "",
    [string]$Labels = "n8n-pipeline-generated",
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

if (-not (Test-Path $Page)) {
    Write-Host "Error: Page file not found: $Page" -ForegroundColor Red
    exit 1
}

# --- Markdown to Confluence HTML ---
function Convert-MdToConfluenceHtml {
    param([string]$Md)
    $lines = $Md -split "`n"
    $html = ""
    $inCode = $false; $codeContent = ""; $codeLang = "text"; $inList = $false

    foreach ($line in $lines) {
        if ($line -match '^```(.*)$' -and -not $inCode) {
            if ($inList) { $html += "</ul>"; $inList = $false }
            $inCode = $true; $codeLang = if ($Matches[1].Trim()) { $Matches[1].Trim() } else { "text" }; $codeContent = ""; continue
        }
        if ($line -match '^```' -and $inCode) {
            $inCode = $false
            $html += "<ac:structured-macro ac:name=`"code`"><ac:parameter ac:name=`"language`">$codeLang</ac:parameter><ac:plain-text-body><![CDATA[$($codeContent.TrimEnd())]]></ac:plain-text-body></ac:structured-macro>"
            continue
        }
        if ($inCode) { $codeContent += "$line`n"; continue }

        if ($line -match '^#### (.+)$') { if ($inList) { $html += "</ul>"; $inList = $false }; $html += "<h4>$($Matches[1])</h4>"; continue }
        if ($line -match '^### (.+)$')  { if ($inList) { $html += "</ul>"; $inList = $false }; $html += "<h3>$($Matches[1])</h3>"; continue }
        if ($line -match '^## (.+)$')   { if ($inList) { $html += "</ul>"; $inList = $false }; $html += "<h2>$($Matches[1])</h2>"; continue }
        if ($line -match '^# (.+)$')    { if ($inList) { $html += "</ul>"; $inList = $false }; $html += "<h1>$($Matches[1])</h1>"; continue }
        if ($line -match '^---+$')      { if ($inList) { $html += "</ul>"; $inList = $false }; $html += "<hr/>"; continue }
        if ($line -match '^> (.+)$')    { if ($inList) { $html += "</ul>"; $inList = $false }; $html += "<blockquote><p>$($Matches[1])</p></blockquote>"; continue }

        if ($line -match '^[-*] (.+)$') {
            if (-not $inList) { $html += "<ul>"; $inList = $true }
            $item = $Matches[1] -replace '\*\*(.+?)\*\*', '<strong>$1</strong>' -replace '\*(.+?)\*', '<em>$1</em>' -replace '`([^`]+)`', '<code>$1</code>'
            $html += "<li>$item</li>"; continue
        }

        if (-not $line.Trim()) { if ($inList) { $html += "</ul>"; $inList = $false }; continue }

        if ($inList) { $html += "</ul>"; $inList = $false }
        $p = $line -replace '\*\*(.+?)\*\*', '<strong>$1</strong>' -replace '\*(.+?)\*', '<em>$1</em>' -replace '`([^`]+)`', '<code>$1</code>' -replace '\[([^\]]+)\]\(([^)]+)\)', '<a href="$2">$1</a>'
        $html += "<p>$p</p>"
    }
    if ($inList) { $html += "</ul>" }
    return $html
}

# --- Main ---
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Markdown -> Confluence Page" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$combinedMd = Get-Content $Page -Raw
$fileCount = 1
Write-Host "  Page:    $Page"

foreach ($s in $Sections) {
    if (-not (Test-Path $s)) { Write-Host "  SKIPPED: $s (not found)" -ForegroundColor Yellow; continue }
    $combinedMd += "`n`n---`n`n" + (Get-Content $s -Raw)
    $fileCount++
    Write-Host "  Section: $s"
}

if (-not $Title) {
    $Title = ($combinedMd -split "`n" | Where-Object { $_ -match '^# ' } | Select-Object -First 1) -replace '^# ', ''
    if (-not $Title) { $Title = "Documentation" }
}

Write-Host ""
Write-Host "  Title: $Title"
Write-Host "  Files: $fileCount"
Write-Host ""

$confHtml = Convert-MdToConfluenceHtml $combinedMd
$date = Get-Date -Format "yyyy-MM-dd"
$confHtml += "<hr/><p><em>Published from local markdown by <a href=`"https://github.com/openmindednewby/ai-confluence-pipeline`">ai-confluence-pipeline</a> on $date</em></p>"

if ($DryRun) {
    Write-Host "[DRY RUN]" -ForegroundColor Yellow
    Write-Host "  Title:       $Title"
    Write-Host "  Files:       $fileCount"
    Write-Host "  HTML length: $($confHtml.Length) chars"
    Write-Host ""
    Write-Host "Run without -DryRun to publish."
    exit 0
}

if (-not $env:CONFLUENCE_BASE_URL -or -not $env:CONFLUENCE_EMAIL -or -not $env:CONFLUENCE_API_TOKEN -or -not $env:CONFLUENCE_SPACE_KEY) {
    Write-Host "Error: CONFLUENCE_BASE_URL, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN, CONFLUENCE_SPACE_KEY must be set in .env" -ForegroundColor Red
    exit 1
}

if (-not $ParentPageId) { $ParentPageId = $env:CONFLUENCE_PARENT_PAGE_ID }

$confAuth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${env:CONFLUENCE_EMAIL}:${env:CONFLUENCE_API_TOKEN}"))
$headers = @{ Authorization = "Basic $confAuth"; "Content-Type" = "application/json" }

$labelsArray = ($Labels -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ } | ForEach-Object { @{ prefix = "global"; name = $_ } })

$body = @{
    type = "page"; title = $Title
    space = @{ key = $env:CONFLUENCE_SPACE_KEY }
    body = @{ storage = @{ value = $confHtml; representation = "storage" } }
    metadata = @{ labels = @($labelsArray) }
}
if ($ParentPageId) { $body.ancestors = @(@{ id = $ParentPageId }) }

$bodyJson = $body | ConvertTo-Json -Depth 20

Write-Host "Publishing to Confluence..."
try {
    $resp = Invoke-RestMethod -Uri "${env:CONFLUENCE_BASE_URL}/wiki/rest/api/content" -Method POST -Headers $headers -Body $bodyJson
    $url = $resp._links.base + $resp._links.webui
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "  Done!" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Page:  $Title"
    Write-Host "  URL:   $url"
    Write-Host "  Files: $fileCount markdown file(s)"
} catch {
    Write-Host "Failed: $_" -ForegroundColor Red
    exit 1
}
