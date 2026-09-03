[CmdletBinding()]
param(
  [string]$Namespace = "teaching-platform",
  [int]$DurationSeconds = 180,
  [int]$Parallelism = 20,
  [string]$EvidenceDirectory = "test-results/hpa"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$evidencePath = [IO.Path]::GetFullPath($EvidenceDirectory)
New-Item -ItemType Directory -Path $evidencePath -Force | Out-Null

if ($DurationSeconds -lt 15) { throw "DurationSeconds must be at least 15." }
if ($Parallelism -lt 1 -or $Parallelism -gt 200) { throw "Parallelism must be between 1 and 200." }

kubectl --namespace $Namespace get deployment api-gateway | Tee-Object -FilePath (Join-Path $evidencePath "deployment-before.log")
if ($LASTEXITCODE -ne 0) { throw "api-gateway deployment is not available." }
kubectl --namespace $Namespace get hpa api-gateway -o wide | Tee-Object -FilePath (Join-Path $evidencePath "hpa-before.log")
if ($LASTEXITCODE -ne 0) { throw "api-gateway HPA is not available; verify Metrics Server first." }

kubectl --namespace $Namespace delete pod hpa-load --ignore-not-found | Out-Null
$command = 'set -u; url=http://api-gateway:3081/health/live; wget -qO- "$url" >/dev/null 2>&1 || exit 10; start=$(date +%s); end=$((start+{0})); while [ "$(date +%s)" -lt "$end" ]; do seq 1 {1} | xargs -P{1} -I{{}} wget -qO- "$url" >/dev/null 2>&1 || true; done; echo "load-complete duration={0} parallelism={1}"' -f $DurationSeconds, $Parallelism
$podManifest = [ordered]@{
  apiVersion = "v1"
  kind = "Pod"
  metadata = [ordered]@{
    name = "hpa-load"
    namespace = $Namespace
    labels = @{ "app.kubernetes.io/name" = "hpa-load" }
  }
  spec = [ordered]@{
    restartPolicy = "Never"
    containers = @(
      [ordered]@{
        name = "hpa-load"
        image = "busybox:1.37"
        imagePullPolicy = "IfNotPresent"
        command = @("sh", "-c")
        args = @($command)
        resources = [ordered]@{
          requests = @{ cpu = "10m"; memory = "8Mi" }
          limits = @{ cpu = "500m"; memory = "64Mi" }
        }
      }
    )
  }
}
$podManifest | ConvertTo-Json -Depth 10 | kubectl apply -f -
if ($LASTEXITCODE -ne 0) { throw "Unable to start the HPA load generator." }

$startDeadline = [DateTimeOffset]::UtcNow.AddSeconds(60)
do {
  $phase = (& kubectl --namespace $Namespace get pod hpa-load -o "jsonpath={.status.phase}" 2>&1) -join ""
  if ($LASTEXITCODE -ne 0) { throw "Unable to read the HPA load generator status." }
  if ($phase -in @("Running", "Succeeded", "Failed")) { break }
  Start-Sleep -Seconds 1
} while ([DateTimeOffset]::UtcNow -lt $startDeadline)
if ($phase -notin @("Running", "Succeeded")) {
  kubectl --namespace $Namespace describe pod hpa-load | Set-Content -LiteralPath (Join-Path $evidencePath "load-generator-describe.log") -Encoding utf8
  $startupLogs = (& kubectl --namespace $Namespace logs hpa-load 2>&1) -join "`n"
  $startupLogs | Set-Content -LiteralPath (Join-Path $evidencePath "load-generator.log") -Encoding utf8
  $startupLogs | Write-Host
  throw "The HPA load generator did not start successfully (phase=$phase)."
}

$samples = [Collections.Generic.List[string]]::new()
for ($elapsed = 0; $elapsed -lt $DurationSeconds; $elapsed += 15) {
  $timestamp = Get-Date -Format o
  $hpa = (& kubectl --namespace $Namespace get hpa api-gateway -o wide 2>&1) -join "`n"
  $pods = (& kubectl --namespace $Namespace get pods -l app.kubernetes.io/name=api-gateway -o wide 2>&1) -join "`n"
  $previousErrorPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $loadMetricsOutput = & kubectl --namespace $Namespace top pod hpa-load 2>&1
  $loadMetricsExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorPreference
  $loadMetrics = if ($loadMetricsExitCode -eq 0) {
    $loadMetricsOutput -join "`n"
  } else {
    "Metrics not available yet (Metrics Server exit code $loadMetricsExitCode)."
  }
  $samples.Add("[$timestamp] elapsed=${elapsed}s`n$hpa`n$pods`nload-generator metrics:`n$loadMetrics`n")
  Write-Host "[$elapsed/$DurationSeconds seconds] $hpa"
  Start-Sleep -Seconds ([Math]::Min(15, $DurationSeconds - $elapsed))
}

$completionDeadline = [DateTimeOffset]::UtcNow.AddSeconds(60)
do {
  $phase = (& kubectl --namespace $Namespace get pod hpa-load -o "jsonpath={.status.phase}" 2>&1) -join ""
  if ($LASTEXITCODE -ne 0) { throw "Unable to read the HPA load generator status." }
  if ($phase -in @("Succeeded", "Failed")) { break }
  Start-Sleep -Seconds 2
} while ([DateTimeOffset]::UtcNow -lt $completionDeadline)

if ($phase -notin @("Succeeded", "Failed")) { throw "The HPA load generator did not finish within the expected time." }

$podJson = ((& kubectl --namespace $Namespace get pod hpa-load -o json 2>&1) -join "`n") | ConvertFrom-Json
$terminated = $podJson.status.containerStatuses[0].state.terminated
$loadLogs = (& kubectl --namespace $Namespace logs hpa-load 2>&1) -join "`n"
$loadLogs | Set-Content -LiteralPath (Join-Path $evidencePath "load-generator.log") -Encoding utf8
$exitCode = if ($null -eq $terminated) { -1 } else { [int]$terminated.exitCode }
if ($exitCode -ne 0 -or $phase -ne "Succeeded" -or $loadLogs -notmatch "load-complete") {
  $loadLogs | Write-Host
  throw "The HPA load generator failed (phase=$phase, exitCode=$exitCode)."
}

$startedAt = [DateTimeOffset]$podJson.status.containerStatuses[0].state.terminated.startedAt
$finishedAt = [DateTimeOffset]$podJson.status.containerStatuses[0].state.terminated.finishedAt
$actualDuration = ($finishedAt - $startedAt).TotalSeconds
if ($actualDuration -lt ($DurationSeconds - 2)) {
  throw "The HPA load generator exited too early (actual=$([Math]::Round($actualDuration, 1))s, expected=${DurationSeconds}s)."
}

$timestamp = Get-Date -Format o
$hpa = (& kubectl --namespace $Namespace get hpa api-gateway -o wide 2>&1) -join "`n"
$pods = (& kubectl --namespace $Namespace get pods -l app.kubernetes.io/name=api-gateway -o wide 2>&1) -join "`n"
$samples.Add("[$timestamp] completed`n$hpa`n$pods`n")
$samples | Set-Content -LiteralPath (Join-Path $evidencePath "hpa-during-load.log") -Encoding utf8

kubectl --namespace $Namespace get hpa api-gateway -o yaml | Set-Content -LiteralPath (Join-Path $evidencePath "hpa-after.yaml") -Encoding utf8
kubectl --namespace $Namespace get pods -l app.kubernetes.io/name=api-gateway -o wide | Set-Content -LiteralPath (Join-Path $evidencePath "pods-after.log") -Encoding utf8
Write-Host "HPA load phase completed successfully. The load pod exit code is 0."
Write-Host "Wait about five minutes, then inspect scale-down with: kubectl -n $Namespace get hpa api-gateway"
