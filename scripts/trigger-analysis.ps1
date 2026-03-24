# ============================================================================
# Trigger a technical analysis via the n8n webhook (PowerShell)
#
# Usage:
#   .\scripts\trigger-analysis.ps1 -Description "Add user notification preferences"
#   .\scripts\trigger-analysis.ps1 -Description "Add user notification preferences" -NoJira
#   .\scripts\trigger-analysis.ps1 -Description "Add user notification preferences" -Context "We use Firebase"
# ============================================================================

param(
    [Parameter(Mandatory = $true)]
    [string]$Description,

    [switch]$NoJira,

    [string]$Context = ""
)

$WebhookUrl = if ($env:WEBHOOK_URL) { $env:WEBHOOK_URL } else { "http://localhost:10353/webhook/analyze" }

$body = @{
    featureDescription = $Description
    createJiraTasks    = -not $NoJira
    additionalContext  = $Context
} | ConvertTo-Json -Depth 10

Write-Host "Triggering analysis for: $Description" -ForegroundColor Cyan
Write-Host "Create Jira tasks: $(-not $NoJira)" -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri $WebhookUrl -Method POST -Body $body -ContentType "application/json"
    Write-Host "Confluence Page:" -ForegroundColor Green
    Write-Host "  $($response.confluencePage.url)"

    if ($response.jiraIssues.Count -gt 0) {
        Write-Host ""
        Write-Host "Jira Issues Created:" -ForegroundColor Green
        foreach ($issue in $response.jiraIssues) {
            Write-Host "  [$($issue.key)] $($issue.summary)"
        }
    }

    Write-Host ""
    Write-Host "Total tasks: $($response.taskCount) | Complexity: $($response.complexity)" -ForegroundColor Yellow
}
catch {
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}
