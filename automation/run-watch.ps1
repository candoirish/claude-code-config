# Hourly runner for the Atoll issue watcher, invoked by the "AtollIssueWatcher"
# Windows Scheduled Task. Loads local-only secrets from automation/.env.local
# (gitignored — never commit) and runs automation/atoll-watch.mjs, logging output.
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
# Node's DEP0190). Capture stdout only; let stderr pass through to the task's
# own output. Explicit -Encoding utf8 avoids the UTF-16 default from Out-File.
node automation/atoll-watch.mjs | Out-File -FilePath $logFile -Append -Encoding utf8
$exitCode = $LASTEXITCODE
Log "exit code: $exitCode"

# Keep only the last 14 days of logs.
Get-ChildItem $logDir -Filter "watch-*.log" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-14) } |
    Remove-Item -Force -ErrorAction SilentlyContinue

exit $exitCode
