[CmdletBinding(SupportsShouldProcess, ConfirmImpact = "High")]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern("^[0-9a-fA-F]{40}$")]
  [string]$GitSha,

  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$ImagePrefix,

  [string]$Namespace = "teaching-platform",
  [string]$EvidenceDirectory = "test-results/rollback",
  [switch]$SkipHealthCheck
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$evidencePath = [IO.Path]::GetFullPath((Join-Path $repoRoot $EvidenceDirectory))
$imageTag = "sha-$($GitSha.ToLowerInvariant())"
$normalizedPrefix = $ImagePrefix.TrimEnd("/")

$targets = [ordered]@{
  "api-gateway" = "api-gateway"
  "course-service" = "course-service"
  "homework-grade-service" = "homework-grade-service"
  "lab-practice-service" = "lab-practice-service"
  "judge-worker" = "judge-worker"
  "api" = "api"
  "web" = "web"
}

New-Item -ItemType Directory -Path $evidencePath -Force | Out-Null

function Invoke-KubectlChecked {
  param(
    [string[]]$Arguments,
    [string]$LogName,
    [string]$FailureMessage
  )

  $previousErrorPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $output = & kubectl @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorPreference
  $output | Set-Content -LiteralPath (Join-Path $evidencePath $LogName) -Encoding utf8
  if ($exitCode -ne 0) { throw $FailureMessage }
  return $output
}

Invoke-KubectlChecked `
  -Arguments @("config", "current-context") `
  -LogName "kube-context.log" `
  -FailureMessage "Unable to read the current kubeconfig context." | Out-Null
Invoke-KubectlChecked `
  -Arguments @("get", "namespace", $Namespace) `
  -LogName "namespace.log" `
  -FailureMessage "Namespace $Namespace does not exist or is not accessible." | Out-Null

$plan = @()
foreach ($deployment in $targets.Keys) {
  $deploymentJson = Invoke-KubectlChecked `
    -Arguments @("--namespace", $Namespace, "get", "deployment", $deployment, "-o", "json") `
    -LogName "before-$deployment.json" `
    -FailureMessage "Deployment $deployment does not exist or is not accessible."
  $deploymentObject = ($deploymentJson -join "`n") | ConvertFrom-Json
  $container = $targets[$deployment]
  $currentContainer = @($deploymentObject.spec.template.spec.containers | Where-Object { $_.name -eq $container })
  if ($currentContainer.Count -ne 1) {
    throw "Expected exactly one container named $container in deployment/$deployment."
  }
  $plan += [ordered]@{
    deployment = $deployment
    container = $container
    fromImage = $currentContainer[0].image
    toImage = "$normalizedPrefix-$deployment`:$imageTag"
  }
}

[ordered]@{
  createdAt = [DateTimeOffset]::UtcNow.ToString("o")
  namespace = $Namespace
  targetGitSha = $GitSha.ToLowerInvariant()
  targetImageTag = $imageTag
  databaseRollback = "not-performed"
  targets = $plan
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $evidencePath "rollback-plan.json") -Encoding utf8

Write-Warning "This script rolls back application images only. It never reverses database migrations."

try {
  foreach ($item in $plan) {
    $resource = "deployment/$($item.deployment)"
    $imageAssignment = "$($item.container)=$($item.toImage)"
    if ($PSCmdlet.ShouldProcess("$Namespace/$resource", "Set image to $($item.toImage)")) {
      Invoke-KubectlChecked `
        -Arguments @("--namespace", $Namespace, "set", "image", $resource, $imageAssignment) `
        -LogName "set-image-$($item.deployment).log" `
        -FailureMessage "Failed to set the rollback image for $resource." | Out-Null
    }
  }

  if (-not $WhatIfPreference) {
    foreach ($item in $plan) {
      Invoke-KubectlChecked `
        -Arguments @("--namespace", $Namespace, "rollout", "status", "deployment/$($item.deployment)", "--timeout=300s") `
        -LogName "rollout-$($item.deployment).log" `
        -FailureMessage "Rollback rollout failed or timed out for deployment/$($item.deployment)." | Out-Null
    }

    if (-not $SkipHealthCheck) {
      & (Join-Path $PSScriptRoot "health-check.ps1") `
        -Namespace $Namespace `
        -EvidenceDirectory $evidencePath
      if ($LASTEXITCODE -ne 0) { throw "Post-rollback health checks failed." }
    }
  }

  [ordered]@{
    completedAt = [DateTimeOffset]::UtcNow.ToString("o")
    namespace = $Namespace
    targetGitSha = $GitSha.ToLowerInvariant()
    targetImageTag = $imageTag
    status = $(if ($WhatIfPreference) { "planned" } else { "success" })
    healthCheck = $(if ($WhatIfPreference) { "not-run-whatif" } elseif ($SkipHealthCheck) { "skipped" } else { "passed" })
    databaseRollback = "not-performed"
  } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidencePath "rollback-summary.json") -Encoding utf8
} catch {
  [ordered]@{
    failedAt = [DateTimeOffset]::UtcNow.ToString("o")
    namespace = $Namespace
    targetGitSha = $GitSha.ToLowerInvariant()
    status = "failed"
    error = $_.Exception.Message
    databaseRollback = "not-performed"
  } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidencePath "rollback-summary.json") -Encoding utf8
  throw
}

Write-Host "Application rollback completed with image tag $imageTag. Evidence: $evidencePath"
