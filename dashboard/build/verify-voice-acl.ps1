[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$VoiceDirectory)

# Read-only, installer-owned prerequisite check. Do not change ACLs or the
# machine execution policy. A pre-existing admin-owned RX grant is sufficient.
$ErrorActionPreference = 'Stop'
$privateSid = 'S-1-15-2-3401530238-3731070781-1353621829-3068759506-4022790450-2217579969-1039810395'
$required = [long][Security.AccessControl.FileSystemRights]::ReadAndExecute
$allowed = $required -bor [long][Security.AccessControl.FileSystemRights]::Synchronize
$helpers = @('runtime.mjs', 'piper-runtime.mjs', 'supervisor.mjs', 'session.mjs', 'dsp.mjs', 'worker.py', 'guard.py', 'model-lock.json')
function Reject-Access([string]$reason) { Write-Verbose $reason; exit 10 }

try {
    if ($VoiceDirectory -notmatch '^[A-Za-z]:[\\/]') { Reject-Access 'non-local-path' }
    $root = Get-Item -LiteralPath $VoiceDirectory -Force
    if (-not $root.PSIsContainer) { Reject-Access 'not-a-directory' }
    $queue = New-Object 'System.Collections.Generic.Queue[System.IO.FileSystemInfo]'
    $queue.Enqueue($root)
    $checked = 0
    while ($queue.Count -gt 0) {
        $item = $queue.Dequeue()
        $checked += 1
        if ($checked -gt 128 -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { Reject-Access 'tree-limit-or-reparse' }
        # Read the Windows descriptor directly. NSIS may launch PowerShell with
        # a module search path where Get-Acl is unavailable; never repair that
        # by importing user-controlled modules or relaxing execution policy.
        $acl = if ($item -is [IO.DirectoryInfo]) {
            [IO.Directory]::GetAccessControl($item.FullName)
        } else {
            [IO.File]::GetAccessControl($item.FullName)
        }
        $rights = [long]0
        foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
            if ($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) { continue }
            $mask = [long]$rule.FileSystemRights
            # Conservative: a read/execute deny cannot be treated as a pass.
            if ($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Deny -and ($mask -band $required)) { Reject-Access 'read-execute-denied' }
            if ($rule.IdentityReference.Value -eq $privateSid -and $rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow) {
                if ($mask -band (-bnot $allowed)) { Reject-Access 'private-grant-too-broad' }
                $rights = $rights -bor $mask
            }
        }
        if (($rights -band $required) -ne $required) { Reject-Access 'missing-private-rx' }
        if ($item.PSIsContainer) {
            foreach ($child in @(Get-ChildItem -LiteralPath $item.FullName -Force)) {
                if (($checked + $queue.Count) -ge 128) { Reject-Access 'tree-limit' }
                $queue.Enqueue($child)
            }
        }
    }
    foreach ($name in $helpers) {
        if (-not (Test-Path -LiteralPath (Join-Path $root.FullName $name) -PathType Leaf)) { Reject-Access 'missing-helper' }
    }
    exit 0
} catch {
    # No raw local paths, identities or other environment details in installer logs.
    if ($_.Exception -is [Management.Automation.CommandNotFoundException]) {
        Reject-Access ('command-unavailable:' + $_.Exception.CommandName)
    }
    Reject-Access ($_.Exception.GetType().Name)
}
