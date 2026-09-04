# Hourly runner for the Atoll issue watcher, invoked by the "AtollIssueWatcher"
# Windows Scheduled Task. Loads local-only secrets from automation/.env.local
# (gitignored — never commit), runs automation/atoll-watch.mjs, logs output, and
# opens a new Claude Code terminal window for each successful pickup claim.
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
# Opening the window happens HERE instead, via Start-Process, which is the
# mechanism verified live to produce a real visible console.
#
# This is a fully automated, hands-free launch (no paste, no click): the
# starting prompt is passed directly as a CLI argument to a brand-new `claude`
# process, so there is no ambiguity about which window/tab receives it — unlike
# opening a Claude Code DESKTOP conversation, which shares one window across
# tabs and has no way to target a specific tab or accept an initial message via
# its claude://code/new deep link (confirmed against the app's own source: that
# link only takes a `folder` parameter). A terminal window is the only launch
# target that can be driven with zero risk of hitting the wrong session.
#
# The launch sequence (cd, git checkout, git pull, claude) is written to a temp
# .bat file rather than passed as a single -ArgumentList string with embedded
# && and nested quotes — that combination silently truncates after the first
# token (confirmed live: only the `cd` ran, the rest of the chain never fired).
# A .bat file sidesteps the nested-quoting problem entirely.
foreach ($line in $output) {
    if ($line -notmatch '^LAUNCH_JSON (.+)$') { continue }
    try {
        $info = $Matches[1] | ConvertFrom-Json
    } catch {
        Log "WARN: could not parse LAUNCH_JSON line: $line"
        continue
    }
    $safePrompt = $info.prompt -replace '"', ''
    $batContent = @"
@echo off
cd /d "$($info.path)"
git checkout $($info.base)
git pull origin $($info.base)
claude "$safePrompt"
"@
    $batPath = Join-Path $env:TEMP ("atoll-launch-{0}-{1}.bat" -f $info.id, (Get-Date -Format "HHmmss"))
    Set-Content -Path $batPath -Value $batContent -Encoding ASCII
    Log "launching window for $($info.id) in $($info.path) (base: $($info.base)) via $batPath"
    try {
        Start-Process cmd.exe -ArgumentList '/k', "`"$batPath`""
        Log "launch succeeded for $($info.id)"
    } catch {
        Log "ERROR: launch failed for $($info.id): $($_.Exception.Message)"
    }
}

# Prune old launch batch files (>1 day).
Get-ChildItem $env:TEMP -Filter "atoll-launch-*.bat" -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-1) } |
    Remove-Item -Force -ErrorAction SilentlyContinue

# Keep only the last 14 days of logs.
Get-ChildItem $logDir -Filter "watch-*.log" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-14) } |
    Remove-Item -Force -ErrorAction SilentlyContinue

exit $exitCode
