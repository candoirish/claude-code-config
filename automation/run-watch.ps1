# Hourly runner for the Atoll issue watcher, invoked by the "AtollIssueWatcher"
# Windows Scheduled Task. Loads local-only secrets from automation/.env.local
# (gitignored — never commit), runs automation/atoll-watch.mjs, logs output, and
# opens a new Claude Code window for each successful pickup claim.
#
# Manual test:  powershell -File automation/run-watch.ps1
# Task setup:   automation/README.md -> "Local scheduled task (Windows)"

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $PSScriptRoot ".env.local"
$logDir = Join-Path $PSScriptRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir ("watch-{0}.log" -f (Get-Date -Format "yyyy-MM-dd"))

function Log($msg) {
    "[$( Get-Date -Format o )] $msg" | Out-File -FilePath $logFile -Append -Encoding utf8
}

if (-not (Test-Path $envFile)) {
    Log "ERROR: $envFile not found. Copy automation/.env.local.example and fill in real values."
    exit 1
}

Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $parts = $_.Split('=', 2)
    [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), "Process")
}

Set-Location $root
Log "running atoll-watch.mjs"

# Do NOT redirect node's stderr in PowerShell 5.1 — it wraps each line as a
# NativeCommandError and flips $? to false even on a harmless warning (e.g.
# Node's DEP0190). Capture stdout as an array (so we can both log it and scan
# it for LAUNCH_JSON lines) and let stderr pass through to the task's own output.
$output = node automation/atoll-watch.mjs
$exitCode = $LASTEXITCODE
$output | Out-File -FilePath $logFile -Append -Encoding utf8
Log "exit code: $exitCode"

# atoll-watch.mjs itself never spawns anything — Node child_process spawning does
# not reliably get desktop/window access from this script's execution context.
# The launch happens HERE, in two steps:
#   1. Silently check out + pull the project's base branch in its main checkout
#      (hidden, synchronous) so whatever new worktree /workflow creates next
#      branches off the correct base — invisible prep, not a visible terminal.
#   2. Open a NEW Claude Code DESKTOP conversation rooted at that folder via the
#      claude://code/new?folder=<path> deep link (confirmed live — this is what
#      opens when you double-click a .claude-code-project or use the app's own
#      "New Claude Code Session" action). The deep link has no prompt/message
#      parameter (verified against the app's own source), so the intended first
#      message is put on the clipboard instead — paste (Ctrl+V) and press Enter
#      to start. This opens a Desktop conversation, not a terminal window.
foreach ($line in $output) {
    if ($line -notmatch '^LAUNCH_JSON (.+)$') { continue }
    try {
        $info = $Matches[1] | ConvertFrom-Json
    } catch {
        Log "WARN: could not parse LAUNCH_JSON line: $line"
        continue
    }

    Log "prepping repo for $($info.id): checkout $($info.base) + pull in $($info.path)"
    try {
        $prepArgs = "-NoProfile -Command `"Set-Location '$($info.path)'; git checkout $($info.base); git pull origin $($info.base)`""
        Start-Process powershell.exe -ArgumentList $prepArgs -WindowStyle Hidden -Wait
    } catch {
        Log "WARN: repo prep failed for $($info.id): $($_.Exception.Message)"
    }

    try {
        Set-Clipboard -Value $info.prompt
        Log "clipboard set to: $($info.prompt)"
    } catch {
        Log "WARN: could not set clipboard for $($info.id): $($_.Exception.Message)"
    }

    $folderEncoded = [uri]::EscapeDataString($info.path)
    $deepLink = "claude://code/new?folder=$folderEncoded"
    Log "opening Claude Code Desktop for $($info.id): $deepLink"
    try {
        Start-Process $deepLink
        Log "launch succeeded for $($info.id)"
    } catch {
        Log "ERROR: launch failed for $($info.id): $($_.Exception.Message)"
    }
}

# Keep only the last 14 days of logs.
Get-ChildItem $logDir -Filter "watch-*.log" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-14) } |
    Remove-Item -Force -ErrorAction SilentlyContinue

exit $exitCode
