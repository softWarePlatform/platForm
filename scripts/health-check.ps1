[CmdletBinding()]
param(
  [string]$Namespace = "teaching-platform",
  [string]$EvidenceDirectory = "test-results/deployment"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$evidencePath = [IO.Path]::GetFullPath($EvidenceDirectory)
New-Item -ItemType Directory -Path $evidencePath -Force | Out-Null

function Invoke-KubectlChecked {
  param(
    [Parameter(Mandatory)]
    [string[]]$Arguments,
    [Parameter(Mandatory)]
    [string]$LogName,
    [Parameter(Mandatory)]
    [string]$FailureMessage
  )

  $output = & kubectl @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  $output | Tee-Object -FilePath (Join-Path $evidencePath $LogName)
  if ($exitCode -ne 0) {
    throw $FailureMessage
  }
}

Invoke-KubectlChecked `
  -Arguments @("--namespace", $Namespace, "rollout", "status", "deployment/api", "--timeout=300s") `
  -LogName "rollout-api.log" `
  -FailureMessage "API rollout failed or timed out."

Invoke-KubectlChecked `
  -Arguments @("--namespace", $Namespace, "rollout", "status", "deployment/judge-worker", "--timeout=300s") `
  -LogName "rollout-judge-worker.log" `
  -FailureMessage "Judge Worker rollout failed or timed out."

Invoke-KubectlChecked `
  -Arguments @("--namespace", $Namespace, "rollout", "status", "deployment/web", "--timeout=180s") `
  -LogName "rollout-web.log" `
  -FailureMessage "Web rollout failed or timed out."

$apiPod = & kubectl --namespace $Namespace get pod `
  -l app.kubernetes.io/name=api `
  -o "jsonpath={.items[0].metadata.name}" 2>&1
$podExitCode = $LASTEXITCODE
if ($podExitCode -ne 0 -or [string]::IsNullOrWhiteSpace(($apiPod -join ""))) {
  throw "Unable to find the API pod."
}
$apiPodName = ($apiPod -join "").Trim()

$healthExpression = "Promise.all(['/health/live','/health/ready'].map(path=>fetch('http://127.0.0.1:3000'+path).then(response=>{if(!response.ok)throw new Error(path+' '+response.status);return response.text()}))).then(()=>console.log('live and ready checks passed'))"
Invoke-KubectlChecked `
  -Arguments @("--namespace", $Namespace, "exec", $apiPodName, "--", "node", "-e", $healthExpression) `
  -LogName "health-check.log" `
  -FailureMessage "API live/readiness verification failed."

Invoke-KubectlChecked `
  -Arguments @("--namespace", $Namespace, "get", "pods,services,pvc,jobs", "-o", "wide") `
  -LogName "cluster-resources.log" `
  -FailureMessage "Unable to collect deployed resource status."

[ordered]@{
  checkedAt = [DateTimeOffset]::UtcNow.ToString("o")
  namespace = $Namespace
  apiPod = $apiPodName
  live = "passed"
  ready = "passed"
  rollout = "passed"
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidencePath "health-summary.json") -Encoding utf8

Write-Host "Kubernetes rollout and health checks passed."
