# Live in-progress-work dashboard: refreshes every 60s, showing:
#   - specs/_queue.json entries not in a terminal state (done/cancelled), across
#     every repo listed in $repos below
#   - Atoll issues currently assigned to you (the pickup queue)
#
# Usage:  powershell -File automation/status.ps1
# Ctrl+C to stop. Safe to leave running in its own window indefinitely.

$repos = @(
    "C:\Users\CSWPC26\Documents\GitHub\tool-portal",
    "C:\Users\CSWPC26\Documents\GitHub\coal"
)

function Show-Queue($repoPath) {
    $queueFile = Join-Path $repoPath "specs\_queue.json"
    if (-not (Test-Path $queueFile)) { return }
    $repoName = Split-Path $repoPath -Leaf
    try {
        $entries = Get-Content $queueFile -Raw | ConvertFrom-Json
    } catch {
        Write-Host "  [$repoName] could not parse _queue.json" -ForegroundColor Yellow
        return
    }
    $active = $entries | Where-Object { $_.status -notin @("done", "cancelled") }
    if (-not $active) { return }
    Write-Host ""
    Write-Host "=== $repoName ===" -ForegroundColor Cyan
    foreach ($e in $active) {
        $atoll = if ($e.atoll_number) { "#$($e.atoll_number)" } else { "" }
        Write-Host ("  [{0,-16}] {1} {2}" -f $e.status, $e.spec, $atoll)
        if ($e.notes) {
            $note = $e.notes.Substring(0, [Math]::Min(100, $e.notes.Length))
            Write-Host "      $note" -ForegroundColor DarkGray
        }
    }
}

while ($true) {
    Clear-Host
    Write-Host "In-progress work -- refreshes every 60s -- $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor White
    Write-Host "======================================================"
    foreach ($r in $repos) { Show-Queue $r }
    Write-Host ""
    Write-Host "(Ctrl+C to stop)" -ForegroundColor DarkGray
    Start-Sleep -Seconds 60
}
