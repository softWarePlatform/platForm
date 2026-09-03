[CmdletBinding()]
param(
  [string]$OutputDirectory = "test-results/qa"
)

# npm/Prisma may write warnings to stderr even when their exit code is zero.
# Keep those warnings in the raw log; use each native command's exit code as
# the quality-gate result rather than turning a warning into a PowerShell stop.
$ErrorActionPreference = "Continue"
$runId = Get-Date -Format "yyyyMMdd-HHmmss"
$resolvedOutput = Join-Path $PWD $OutputDirectory
New-Item -ItemType Directory -Force -Path $resolvedOutput | Out-Null

$steps = @(
  @{ Name = "course-prisma-generate"; Arguments = @("run", "db:generate", "--prefix", "course-service") },
  @{ Name = "course-test"; Arguments = @("test", "--prefix", "course-service") },
  @{ Name = "homework-prisma-generate"; Arguments = @("run", "db:generate", "--prefix", "homework-grade-service") },
  @{ Name = "homework-test"; Arguments = @("test", "--prefix", "homework-grade-service") },
  @{ Name = "lab-prisma-generate"; Arguments = @("run", "postinstall", "--prefix", "lab-practice-service") },
  @{ Name = "lab-test"; Arguments = @("test", "--prefix", "lab-practice-service") },
  @{ Name = "gateway-test"; Arguments = @("test", "--prefix", "api-gateway") }
)

$results = @()
foreach ($step in $steps) {
  $logPath = Join-Path $resolvedOutput "$runId-$($step.Name).log"
  Write-Host "==> $($step.Name)"
  # A hashtable member wrapped directly in @() is passed to native commands as
  # one object on PowerShell 7.  Materialise a real string array first so npm
  # receives each argument separately on both Windows PowerShell and pwsh.
  [string[]]$npmArguments = $step.Arguments
  & npm @npmArguments *>&1 | Tee-Object -FilePath $logPath
  $results += [ordered]@{
    name = $step.Name
    command = "npm $($step.Arguments -join ' ')"
    exitCode = $LASTEXITCODE
    log = $logPath
  }
}

$summary = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  passed = @($results | Where-Object { $_.exitCode -eq 0 }).Count
  failed = @($results | Where-Object { $_.exitCode -ne 0 }).Count
  results = $results
}
$summaryPath = Join-Path $resolvedOutput "$runId-summary.json"
$summary | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 -Path $summaryPath
$summary | ConvertTo-Json -Depth 4

if ($summary.failed -gt 0) { exit 1 }
