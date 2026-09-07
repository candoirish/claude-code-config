' Silent launcher for run-watch.ps1, invoked by the "AtollIssueWatcher" Scheduled
' Task instead of powershell.exe directly. PowerShell's own -WindowStyle Hidden
' does not reliably suppress the console flash under Task Scheduler (it still
' briefly allocates a visible console before the style applies). WScript.Shell.Run
' with windowStyle=0 never allocates a console at all, so this is the actually
' reliable fix (confirmed against a well-known Windows Task Scheduler quirk).
Set shell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & scriptDir & "\run-watch.ps1"""
shell.Run cmd, 0, True
