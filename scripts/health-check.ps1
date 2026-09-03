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
  param([string[]]$Arguments, [string]$LogName, [string]$FailureMessage)
  $previousErrorPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $output = & kubectl @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorPreference
  $output | Tee-Object -FilePath (Join-Path $evidencePath $LogName)
  if ($exitCode -ne 0) { throw $FailureMessage }
}

$deployments = @(
  @{ Name = "api"; Timeout = 300 },
  @{ Name = "course-service"; Timeout = 300 },
  @{ Name = "homework-grade-service"; Timeout = 300 },
  @{ Name = "lab-practice-service"; Timeout = 300 },
  @{ Name = "api-gateway"; Timeout = 300 },
  @{ Name = "judge-worker"; Timeout = 300 },
  @{ Name = "web"; Timeout = 180 }
)
foreach ($deployment in $deployments) {
  $name = $deployment.Name
  Invoke-KubectlChecked `
    -Arguments @("--namespace", $Namespace, "rollout", "status", "deployment/$name", "--timeout=$($deployment.Timeout)s") `
    -LogName "rollout-$name.log" `
    -FailureMessage "Deployment $name rollout failed or timed out."
}

$gatewayPod = & kubectl --namespace $Namespace get pod -l app.kubernetes.io/name=api-gateway -o "jsonpath={.items[0].metadata.name}" 2>&1
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($gatewayPod -join ""))) { throw "Unable to find the API Gateway pod." }
$gatewayPodName = ($gatewayPod -join "").Trim()

$targets = @("gateway-live", "gateway-ready", "course", "homework", "lab", "legacy-api", "web")
$healthExpression = "Promise.all(['http://127.0.0.1:3081/health/live','http://127.0.0.1:3081/health/ready','http://course-service:3001/health/ready','http://homework-grade-service:3002/health/ready','http://lab-practice-service:3003/health/ready','http://api:3000/health/ready','http://web/'].map(url=>fetch(url).then(r=>{console.log(url+' '+r.status);if(!r.ok)throw new Error(url+' '+r.status)}))).then(()=>console.log('all health checks passed'))"
Invoke-KubectlChecked `
  -Arguments @("--namespace", $Namespace, "exec", $gatewayPodName, "--", "node", "-e", $healthExpression) `
  -LogName "service-health-checks.log" `
  -FailureMessage "One or more in-cluster service health checks failed."

Invoke-KubectlChecked `
  -Arguments @("--namespace", $Namespace, "get", "pods,services,pvc,jobs,hpa", "-o", "wide") `
  -LogName "cluster-resources.log" `
  -FailureMessage "Unable to collect deployed resource status."

Invoke-KubectlChecked `
  -Arguments @("top", "pods", "--namespace", $Namespace) `
  -LogName "pod-metrics.log" `
  -FailureMessage "Metrics API is unavailable; HPA cannot operate. Install or repair Metrics Server."

[ordered]@{
  checkedAt = [DateTimeOffset]::UtcNow.ToString("o")
  namespace = $Namespace
  gatewayPod = $gatewayPodName
  services = $targets
  health = "passed"
  rollout = "passed"
  hpaConfigured = $true
  metricsApi = "passed"
} | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $evidencePath "health-summary.json") -Encoding utf8

Write-Host "Kubernetes rollouts, service health checks, and HPA discovery passed."
