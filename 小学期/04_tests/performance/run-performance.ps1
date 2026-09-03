[CmdletBinding()]
param(
  [string]$BaseUrl = "http://127.0.0.1:8080/api",
  [ValidateRange(3, 20)][int]$Runs = 3,
  [ValidateRange(1, 500)][int]$Concurrency = 10,
  [ValidateRange(10, 100000)][int]$RequestsPerTarget = 30,
  [ValidateRange(100, 60000)][int]$RequestTimeoutMs = 10000,
  [ValidateSet("compose", "kubernetes", "none")][string]$ResourceMode = "compose",
  [string]$Namespace = "teaching-platform",
  [string]$OutputDirectory = "raw-results/rerun",
  [switch]$AllowRemoteFixture
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($RequestsPerTarget -lt $Concurrency) {
  throw "RequestsPerTarget must be no smaller than Concurrency."
}

$outputPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot $OutputDirectory))
$benchmarkScript = Join-Path $PSScriptRoot "performance-benchmark.mjs"
$fixtureScript = Join-Path $PSScriptRoot "create-performance-fixture.mjs"
$privateConfigPath = [IO.Path]::GetTempFileName()
$base = $BaseUrl.TrimEnd("/")
New-Item -ItemType Directory -Path $outputPath -Force | Out-Null

function Save-ResourceSnapshot {
  param([string]$Stage)

  $destination = Join-Path $outputPath "resources-$Stage.txt"
  if ($ResourceMode -eq "compose") {
    @(
      "capturedAt=$([DateTimeOffset]::Now.ToString('o'))"
      "command=docker compose ps -a"
      (& docker compose ps -a 2>&1)
      ""
      "command=docker stats --no-stream"
      (& docker stats --no-stream 2>&1)
    ) | Set-Content -LiteralPath $destination -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw "Unable to collect Docker resource snapshot." }
  } elseif ($ResourceMode -eq "kubernetes") {
    @(
      "capturedAt=$([DateTimeOffset]::Now.ToString('o'))"
      "command=kubectl top pods --namespace $Namespace"
      (& kubectl top pods --namespace $Namespace 2>&1)
      ""
      "command=kubectl get hpa --namespace $Namespace"
      (& kubectl get hpa --namespace $Namespace 2>&1)
    ) | Set-Content -LiteralPath $destination -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw "Unable to collect Kubernetes resource snapshot." }
  } else {
    "Resource snapshot disabled by -ResourceMode none." | Set-Content -LiteralPath $destination -Encoding utf8
  }
}

try {
  $resourceFiles = @("resources-before.txt", "resources-after.txt")
  $uri = [Uri]$base
  if (-not $AllowRemoteFixture -and $uri.Host -notin @("localhost", "127.0.0.1", "::1")) {
    throw "Refusing to create a performance fixture on a remote host. Use -AllowRemoteFixture only for an authorized test environment."
  }
  $label = "perf-$([DateTimeOffset]::Now.ToString('yyyyMMddHHmmss'))"
  & node $fixtureScript `
    --base-url $base `
    --label $label `
    --manifest (Join-Path $outputPath "fixture-manifest.json") `
    --config $privateConfigPath
  if ($LASTEXITCODE -ne 0) { throw "Performance fixture creation failed with exit code $LASTEXITCODE." }

  $config = Get-Content -LiteralPath $privateConfigPath -Raw | ConvertFrom-Json
  $config.environment = "final-$ResourceMode"
  $config.sameMachineEvidence = "$env:COMPUTERNAME / $([DateTimeOffset]::Now.ToString('yyyy-MM-dd'))"
  $config.runs = $Runs
  $config.concurrency = $Concurrency
  $config.requestsPerTarget = $RequestsPerTarget
  $config.requestTimeoutMs = $RequestTimeoutMs
  $config | Add-Member -NotePropertyName resourceSnapshotFiles -NotePropertyValue $resourceFiles -Force
  $config | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $privateConfigPath -Encoding utf8

  Save-ResourceSnapshot -Stage "before"
  & node $benchmarkScript `
    --config $privateConfigPath `
    --output (Join-Path $outputPath "performance-raw.json")
  if ($LASTEXITCODE -ne 0) { throw "Performance benchmark failed with exit code $LASTEXITCODE." }
  Save-ResourceSnapshot -Stage "after"

  [ordered]@{
    generatedAt = [DateTimeOffset]::Now.ToString("o")
    baseUrl = $base
    fixture = "fixture-manifest.json"
    passwordStored = $false
    runs = $Runs
    concurrency = $Concurrency
    requestsPerTarget = $RequestsPerTarget
    result = "performance-raw.json"
    resourceSnapshots = $resourceFiles
  } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $outputPath "run-metadata.json") -Encoding utf8
} finally {
  if (Test-Path -LiteralPath $privateConfigPath) {
    Remove-Item -LiteralPath $privateConfigPath -Force
  }
}

Write-Host "Performance evidence saved to $outputPath"
