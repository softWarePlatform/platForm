param(
  [string]$Namespace = "teaching-platform",
  [string]$BaseUrl = "http://127.0.0.1:18080/api",
  [switch]$InjectDownstreamFailure
)

$ErrorActionPreference = "Stop"
$oldReplicas = (kubectl --namespace $Namespace get deployment homework-grade-service -o jsonpath='{.spec.replicas}').Trim()
if (-not $oldReplicas) { throw "Cannot determine homework-grade-service replica count." }
$scaled = $false

try {
  $env:E2E_BASE_URL = $BaseUrl
  $env:QA_RESILIENCE_PHASE = "baseline"
  $env:QA_RESILIENCE_REPORT = "test-results/cross-service-baseline.json"
  & node scripts/qa/cross-service-resilience.mjs
  if ($LASTEXITCODE -ne 0) { throw "Baseline resilience verification failed." }

  if (-not $InjectDownstreamFailure) { return }

  & kubectl --namespace $Namespace scale deployment/homework-grade-service --replicas=0
  if ($LASTEXITCODE -ne 0) { throw "Unable to stop homework-grade-service." }
  $scaled = $true
  $downstreamStopped = $false
  for ($attempt = 1; $attempt -le 90; $attempt++) {
    $addresses = kubectl --namespace $Namespace get endpoints homework-grade-service -o jsonpath='{.subsets[*].addresses[*].ip}'
    if ($null -eq $addresses) { $addresses = "" } else { $addresses = ([string]$addresses).Trim() }
    $pods = kubectl --namespace $Namespace get pods -l app.kubernetes.io/name=homework-grade-service -o jsonpath='{.items[*].metadata.name}'
    if ($null -eq $pods) { $pods = "" } else { $pods = ([string]$pods).Trim() }
    if (-not $addresses -and -not $pods) {
      $downstreamStopped = $true
      break
    }
    Start-Sleep -Seconds 1
  }
  if (-not $downstreamStopped) { throw "homework-grade-service did not fully stop after scale-down." }

  # The in-process HTTP clients may retain a keep-alive connection to the
  # terminating Pod. Restart only the two callers after all downstream Pods exit
  # so this run verifies a new connection cannot reach Homework.
  foreach ($caller in @("course-service", "api-gateway")) {
    & kubectl --namespace $Namespace rollout restart "deployment/$caller"
    if ($LASTEXITCODE -ne 0) { throw "Unable to restart $caller for the isolated downstream test." }
    & kubectl --namespace $Namespace rollout status "deployment/$caller" --timeout=180s
    if ($LASTEXITCODE -ne 0) { throw "$caller did not become ready during the isolated downstream test." }
  }

  $env:QA_RESILIENCE_PHASE = "downstream-unavailable"
  $env:QA_RESILIENCE_REPORT = "test-results/cross-service-homework-stopped.json"
  & node scripts/qa/cross-service-resilience.mjs
  if ($LASTEXITCODE -ne 0) { throw "Unavailable-downstream verification failed." }
}
finally {
  if ($scaled) {
    & kubectl --namespace $Namespace scale deployment/homework-grade-service --replicas=$oldReplicas
    if ($LASTEXITCODE -eq 0) {
      & kubectl --namespace $Namespace rollout status deployment/homework-grade-service --timeout=180s
      if ($LASTEXITCODE -ne 0) { throw "homework-grade-service did not recover." }
    }
  }
}

$env:QA_RESILIENCE_PHASE = "recovered"
$env:QA_RESILIENCE_REPORT = "test-results/cross-service-recovered.json"
if (-not $InjectDownstreamFailure) { return }
& node scripts/qa/cross-service-resilience.mjs
if ($LASTEXITCODE -ne 0) { throw "Recovered-downstream verification failed." }
