[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [string]$ImagePrefix,

  [Parameter(Mandatory)]
  [ValidatePattern("^[0-9a-fA-F]{40}$")]
  [string]$GitSha,

  [string]$Namespace = "teaching-platform",
  [string]$EvidenceDirectory = "test-results/deployment"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$evidencePath = [IO.Path]::GetFullPath($EvidenceDirectory)
$imageTag = "sha-$($GitSha.ToLowerInvariant())"
$normalizedPrefix = $ImagePrefix.TrimEnd("/").ToLowerInvariant()
New-Item -ItemType Directory -Path $evidencePath -Force | Out-Null

function Assert-RequiredEnvironment {
  $required = @(
    "POSTGRES_PASSWORD",
    "DATABASE_URL",
    "JWT_SECRET",
    "CORS_ORIGIN",
    "GHCR_USERNAME",
    "GHCR_PAT"
  )
  $missing = @(
    foreach ($name in $required) {
      if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
        $name
      }
    }
  )
  if ($missing.Count -gt 0) {
    throw "Missing required deployment environment variables: $($missing -join ', ')"
  }
}

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

function Apply-SecretYaml {
  param(
    [Parameter(Mandatory)]
    [string]$Yaml,
    [Parameter(Mandatory)]
    [string]$Name
  )

  $applyOutput = $Yaml | & kubectl apply -f - 2>&1
  $exitCode = $LASTEXITCODE
  $applyOutput | Tee-Object -FilePath (Join-Path $evidencePath "apply-$Name.log")
  if ($exitCode -ne 0) {
    throw "Failed to apply Kubernetes secret $Name."
  }
}

Assert-RequiredEnvironment

Invoke-KubectlChecked `
  -Arguments @("config", "current-context") `
  -LogName "kube-context.log" `
  -FailureMessage "Unable to read the current kubeconfig context."
Invoke-KubectlChecked `
  -Arguments @("cluster-info") `
  -LogName "cluster-info.log" `
  -FailureMessage "Unable to reach the Kubernetes API."

$namespaceManifest = Join-Path $repoRoot "k8s/monolith/namespace.yaml"
Invoke-KubectlChecked `
  -Arguments @("apply", "-f", $namespaceManifest) `
  -LogName "apply-namespace.log" `
  -FailureMessage "Failed to apply the Kubernetes namespace."

$platformSecretOutput = & kubectl --namespace $Namespace create secret generic platform-secrets `
  --from-literal=POSTGRES_USER=platform `
  "--from-literal=POSTGRES_PASSWORD=$env:POSTGRES_PASSWORD" `
  --from-literal=POSTGRES_DB=teaching_platform `
  "--from-literal=DATABASE_URL=$env:DATABASE_URL" `
  "--from-literal=JWT_SECRET=$env:JWT_SECRET" `
  "--from-literal=CORS_ORIGIN=$env:CORS_ORIGIN" `
  --dry-run=client -o yaml 2>&1
if ($LASTEXITCODE -ne 0) {
  throw "Failed to render platform-secrets."
}
Apply-SecretYaml -Yaml ($platformSecretOutput -join "`n") -Name "platform-secrets"

$registrySecretOutput = & kubectl --namespace $Namespace create secret docker-registry ghcr-pull `
  --docker-server=ghcr.io `
  "--docker-username=$env:GHCR_USERNAME" `
  "--docker-password=$env:GHCR_PAT" `
  --dry-run=client -o yaml 2>&1
if ($LASTEXITCODE -ne 0) {
  throw "Failed to render ghcr-pull."
}
Apply-SecretYaml -Yaml ($registrySecretOutput -join "`n") -Name "ghcr-pull"

Invoke-KubectlChecked `
  -Arguments @("--namespace", $Namespace, "apply", "-f", (Join-Path $repoRoot "k8s/monolith/postgres.yaml")) `
  -LogName "apply-postgres.log" `
  -FailureMessage "Failed to apply PostgreSQL resources."
Invoke-KubectlChecked `
  -Arguments @("--namespace", $Namespace, "apply", "-f", (Join-Path $repoRoot "k8s/monolith/redis.yaml")) `
  -LogName "apply-redis.log" `
  -FailureMessage "Failed to apply Redis resources."
Invoke-KubectlChecked `
  -Arguments @("--namespace", $Namespace, "rollout", "status", "statefulset/postgres", "--timeout=180s") `
  -LogName "rollout-postgres.log" `
  -FailureMessage "PostgreSQL did not become ready."
Invoke-KubectlChecked `
  -Arguments @("--namespace", $Namespace, "rollout", "status", "deployment/redis", "--timeout=180s") `
  -LogName "rollout-redis.log" `
  -FailureMessage "Redis did not become ready."

$migrationTemplate = Get-Content -Raw (Join-Path $repoRoot "k8s/monolith/migrate-job.yaml")
$migrationManifest = $migrationTemplate.Replace(
  "teaching-platform-migrate:dev",
  "$normalizedPrefix-migrate:$imageTag"
)
if ($migrationManifest.Contains("teaching-platform-migrate:dev")) {
  throw "The migration image placeholder was not replaced."
}
$migrationPath = Join-Path $evidencePath "migrate-job.rendered.yaml"
[IO.File]::WriteAllText($migrationPath, $migrationManifest, [Text.UTF8Encoding]::new($false))

Invoke-KubectlChecked `
  -Arguments @("--namespace", $Namespace, "delete", "job", "db-migrate", "--ignore-not-found") `
  -LogName "delete-previous-migration.log" `
  -FailureMessage "Failed to remove the previous migration Job."
Invoke-KubectlChecked `
  -Arguments @("apply", "-f", $migrationPath) `
  -LogName "apply-migration.log" `
  -FailureMessage "Failed to create the migration Job."

$migrationWait = & kubectl --namespace $Namespace wait --for=condition=complete job/db-migrate --timeout=300s 2>&1
$migrationWaitExitCode = $LASTEXITCODE
$migrationWait | Tee-Object -FilePath (Join-Path $evidencePath "migration-wait.log")
$migrationLogs = & kubectl --namespace $Namespace logs job/db-migrate 2>&1
$migrationLogsExitCode = $LASTEXITCODE
$migrationLogs | Tee-Object -FilePath (Join-Path $evidencePath "migration.log")
if ($migrationWaitExitCode -ne 0) {
  throw "Database migration failed or timed out."
}
if ($migrationLogsExitCode -ne 0) {
  throw "Database migration completed, but its logs could not be collected."
}

$renderedManifest = & kubectl kustomize (Join-Path $repoRoot "k8s/monolith") 2>&1
if ($LASTEXITCODE -ne 0) {
  $renderedManifest | Set-Content -LiteralPath (Join-Path $evidencePath "kustomize-error.log") -Encoding utf8
  throw "Failed to render the Kubernetes application manifests."
}
$platformManifest = (($renderedManifest -join "`n") + "`n")
$platformManifest = $platformManifest.Replace("teaching-platform-api:dev", "$normalizedPrefix-api:$imageTag")
$platformManifest = $platformManifest.Replace("teaching-platform-web:dev", "$normalizedPrefix-web:$imageTag")
$platformManifest = $platformManifest.Replace("teaching-platform-judge-worker:dev", "$normalizedPrefix-judge-worker:$imageTag")
if ($platformManifest -match "teaching-platform-(api|web|judge-worker):dev") {
  throw "One or more application image placeholders were not replaced."
}
$platformPath = Join-Path $evidencePath "platform.rendered.yaml"
[IO.File]::WriteAllText($platformPath, $platformManifest, [Text.UTF8Encoding]::new($false))

Invoke-KubectlChecked `
  -Arguments @("apply", "-f", $platformPath) `
  -LogName "apply-platform.log" `
  -FailureMessage "Failed to deploy the current commit."

& (Join-Path $PSScriptRoot "health-check.ps1") `
  -Namespace $Namespace `
  -EvidenceDirectory $evidencePath

[ordered]@{
  deployedAt = [DateTimeOffset]::UtcNow.ToString("o")
  namespace = $Namespace
  gitSha = $GitSha.ToLowerInvariant()
  imageTag = $imageTag
  imagePrefix = $normalizedPrefix
  status = "success"
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidencePath "deployment-summary.json") -Encoding utf8

Write-Host "Deployment completed successfully with image tag $imageTag."
