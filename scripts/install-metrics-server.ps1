[CmdletBinding()]
param([string]$ManifestPath = "k8s/addons/metrics-server.yaml")

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
kubectl apply -f $ManifestPath
if ($LASTEXITCODE -ne 0) { throw "Unable to install Metrics Server from $ManifestPath." }

kubectl --namespace kube-system rollout status deployment/metrics-server --timeout=180s
if ($LASTEXITCODE -ne 0) { throw "Metrics Server rollout failed." }

for ($attempt = 1; $attempt -le 30; $attempt++) {
  $previousErrorPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  kubectl get --raw /apis/metrics.k8s.io/v1beta1/nodes 2>$null | Out-Null
  $ErrorActionPreference = $previousErrorPreference
  if ($LASTEXITCODE -eq 0) {
    kubectl top nodes
    Write-Host "Metrics Server is ready."
    exit 0
  }
  Start-Sleep -Seconds 5
}

kubectl --namespace kube-system logs deployment/metrics-server --tail=100
throw "Metrics API did not become ready within 150 seconds."
