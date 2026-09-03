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
    "GHCR_PAT",
    "INTERNAL_SERVICE_TOKEN"
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

function Assert-DatabaseConfiguration {
  try {
    $databaseUri = [Uri]$env:DATABASE_URL
  }
  catch {
    throw "DATABASE_URL is not a valid PostgreSQL connection URL."
  }

  $userInfo = $databaseUri.UserInfo.Split(":", 2)
  if ($userInfo.Count -ne 2) {
    throw "DATABASE_URL must include a username and password."
  }

  $databaseUser = [Uri]::UnescapeDataString($userInfo[0])
  $databasePassword = [Uri]::UnescapeDataString($userInfo[1])
  $databaseName = $databaseUri.AbsolutePath.TrimStart("/")
  if ($databaseUri.Scheme -notin @("postgresql", "postgres")) {
    throw "DATABASE_URL must use the postgresql:// or postgres:// scheme."
  }
  if ($databaseUri.Host -ne "postgres" -or $databaseUri.Port -ne 5432) {
    throw "DATABASE_URL must target the in-cluster PostgreSQL service at postgres:5432."
  }
  if ($databaseUser -ne "platform" -or $databaseName -ne "teaching_platform") {
    throw "DATABASE_URL must use the platform role and teaching_platform database."
  }
  if (-not [string]::Equals(
    $databasePassword,
    $env:POSTGRES_PASSWORD,
    [StringComparison]::Ordinal
  )) {
    throw "The password in DATABASE_URL must exactly match POSTGRES_PASSWORD."
  }
}

function Get-ServiceDatabaseUrl {
  param([Parameter(Mandatory)][string]$DatabaseName)
  $builder = [UriBuilder]$env:DATABASE_URL
  $builder.Path = "/$DatabaseName"
  return $builder.Uri.AbsoluteUri
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

function Sync-PostgresRolePassword {
  $escapedPassword = $env:POSTGRES_PASSWORD.Replace("'", "''")
  $sql = "ALTER ROLE platform WITH LOGIN PASSWORD '$escapedPassword';"
  $output = $sql | & kubectl --namespace $Namespace exec -i statefulset/postgres -- `
    psql --set=ON_ERROR_STOP=1 --username platform --dbname postgres 2>&1
  $exitCode = $LASTEXITCODE
  $output | Tee-Object -FilePath (Join-Path $evidencePath "sync-postgres-password.log")
  if ($exitCode -ne 0) {
    throw "Failed to synchronize the PostgreSQL platform role password with platform-secrets."
  }
}

function Get-JobCounter {
  param(
    [AllowNull()]
    [object]$Status,
    [Parameter(Mandatory)]
    [string]$Name
  )

  if ($null -eq $Status) {
    return 0
  }
  $property = $Status.PSObject.Properties[$Name]
  if ($null -eq $property -or $null -eq $property.Value) {
    return 0
  }
  return [int]$property.Value
}

function Write-MigrationLogs {
  $logs = & kubectl --namespace $Namespace logs `
    -l job-name=db-migrate `
    --all-containers=true `
    --prefix=true 2>&1
  $exitCode = $LASTEXITCODE
  $logs | Tee-Object -FilePath (Join-Path $evidencePath "migration.log")
  if ($exitCode -ne 0) {
    Write-Warning "Migration Pod logs could not be collected."
  }
}

function Get-OptionalPropertyValue {
  param(
    [AllowNull()]
    [object]$InputObject,
    [Parameter(Mandatory)]
    [string]$Name,
    [AllowNull()]
    [object]$DefaultValue = $null
  )

  if ($null -eq $InputObject) {
    return $DefaultValue
  }
  $property = $InputObject.PSObject.Properties[$Name]
  if ($null -eq $property -or $null -eq $property.Value) {
    return $DefaultValue
  }
  return $property.Value
}

function Wait-MigrationJob {
  param([string]$JobName = "db-migrate")
  $deadline = [DateTimeOffset]::UtcNow.AddSeconds(330)
  $observations = [Collections.Generic.List[string]]::new()

  while ([DateTimeOffset]::UtcNow -lt $deadline) {
    $jobJson = & kubectl --namespace $Namespace get job $JobName -o json 2>&1
    if ($LASTEXITCODE -ne 0) {
      $jobJson | Tee-Object -FilePath (Join-Path $evidencePath "$JobName-status-error.log")
      throw "Unable to read Kubernetes Job $JobName status."
    }

    $job = ($jobJson -join "`n") | ConvertFrom-Json
    $status = Get-OptionalPropertyValue -InputObject $job -Name "status"
    $succeeded = Get-JobCounter -Status $status -Name "succeeded"
    $failed = Get-JobCounter -Status $status -Name "failed"
    $active = Get-JobCounter -Status $status -Name "active"
    $observations.Add("$(Get-Date -Format o) active=$active succeeded=$succeeded failed=$failed")

    if ($succeeded -ge 1) {
      $observations | Set-Content -LiteralPath (Join-Path $evidencePath "$JobName-wait.log") -Encoding utf8
      & kubectl --namespace $Namespace logs "job/$JobName" 2>&1 | Tee-Object -FilePath (Join-Path $evidencePath "$JobName.log")
      return
    }

    $conditions = @(Get-OptionalPropertyValue -InputObject $status -Name "conditions" -DefaultValue @())
    $failedCondition = @($conditions | Where-Object {
      (Get-OptionalPropertyValue -InputObject $_ -Name "type") -eq "Failed" -and
      (Get-OptionalPropertyValue -InputObject $_ -Name "status") -eq "True"
    })
    if ($failedCondition.Count -gt 0) {
      $observations | Set-Content -LiteralPath (Join-Path $evidencePath "$JobName-wait.log") -Encoding utf8
      & kubectl --namespace $Namespace logs "job/$JobName" 2>&1 | Tee-Object -FilePath (Join-Path $evidencePath "$JobName.log")
      $reason = Get-OptionalPropertyValue -InputObject $failedCondition[0] -Name "reason" -DefaultValue "Unknown"
      $message = Get-OptionalPropertyValue -InputObject $failedCondition[0] -Name "message" -DefaultValue "No failure message was reported."
      throw "Kubernetes Job $JobName failed ($reason): $message"
    }

    Start-Sleep -Seconds 5
  }

  $observations | Set-Content -LiteralPath (Join-Path $evidencePath "$JobName-wait.log") -Encoding utf8
  & kubectl --namespace $Namespace logs "job/$JobName" 2>&1 | Tee-Object -FilePath (Join-Path $evidencePath "$JobName.log")
  throw "Kubernetes Job $JobName timed out."
}

Assert-RequiredEnvironment
Assert-DatabaseConfiguration

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
  "--from-literal=COURSE_DATABASE_URL=$(Get-ServiceDatabaseUrl -DatabaseName 'course_service')" `
  "--from-literal=HOMEWORK_DATABASE_URL=$(Get-ServiceDatabaseUrl -DatabaseName 'homework_grade_service')" `
  "--from-literal=LAB_DATABASE_URL=$(Get-ServiceDatabaseUrl -DatabaseName 'lab_practice_service')" `
  "--from-literal=JWT_SECRET=$env:JWT_SECRET" `
  "--from-literal=CORS_ORIGIN=$env:CORS_ORIGIN" `
  "--from-literal=INTERNAL_SERVICE_TOKEN=$env:INTERNAL_SERVICE_TOKEN" `
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
Sync-PostgresRolePassword
Invoke-KubectlChecked `
  -Arguments @("--namespace", $Namespace, "rollout", "status", "deployment/redis", "--timeout=180s") `
  -LogName "rollout-redis.log" `
  -FailureMessage "Redis did not become ready."

Invoke-KubectlChecked `
  -Arguments @("--namespace", $Namespace, "delete", "job", "database-bootstrap", "--ignore-not-found") `
  -LogName "delete-database-bootstrap.log" `
  -FailureMessage "Failed to remove the previous database bootstrap Job."
Invoke-KubectlChecked `
  -Arguments @("apply", "-f", (Join-Path $repoRoot "k8s/monolith/database-bootstrap-job.yaml")) `
  -LogName "apply-database-bootstrap.log" `
  -FailureMessage "Failed to create the database bootstrap Job."
Wait-MigrationJob -JobName "database-bootstrap"

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

Wait-MigrationJob -JobName "db-migrate"

$serviceMigrations = @(
  @{ Name = "course-migrate"; File = "course-migrate-job.yaml"; Placeholder = "teaching-platform-course-migrate:dev"; Image = "$normalizedPrefix-course-migrate:$imageTag" },
  @{ Name = "homework-migrate"; File = "homework-migrate-job.yaml"; Placeholder = "teaching-platform-homework-migrate:dev"; Image = "$normalizedPrefix-homework-migrate:$imageTag" },
  @{ Name = "lab-migrate"; File = "lab-migrate-job.yaml"; Placeholder = "teaching-platform-lab-migrate:dev"; Image = "$normalizedPrefix-lab-migrate:$imageTag" }
)
foreach ($migration in $serviceMigrations) {
  $template = Get-Content -Raw (Join-Path $repoRoot "k8s/monolith/$($migration.File)")
  $manifest = $template.Replace($migration.Placeholder, $migration.Image)
  if ($manifest.Contains($migration.Placeholder)) { throw "Migration image placeholder was not replaced for $($migration.Name)." }
  $path = Join-Path $evidencePath "$($migration.Name).rendered.yaml"
  [IO.File]::WriteAllText($path, $manifest, [Text.UTF8Encoding]::new($false))
  Invoke-KubectlChecked -Arguments @("--namespace", $Namespace, "delete", "job", $migration.Name, "--ignore-not-found") -LogName "delete-$($migration.Name).log" -FailureMessage "Failed to remove previous $($migration.Name) Job."
  Invoke-KubectlChecked -Arguments @("apply", "-f", $path) -LogName "apply-$($migration.Name).log" -FailureMessage "Failed to create $($migration.Name) Job."
  Wait-MigrationJob -JobName $migration.Name
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
$platformManifest = $platformManifest.Replace("teaching-platform-lab-practice-service:dev", "$normalizedPrefix-lab-practice-service:$imageTag")
$platformManifest = $platformManifest.Replace("teaching-platform-api-gateway:dev", "$normalizedPrefix-api-gateway:$imageTag")
$platformManifest = $platformManifest.Replace("teaching-platform-course-service:dev", "$normalizedPrefix-course-service:$imageTag")
$platformManifest = $platformManifest.Replace("teaching-platform-homework-grade-service:dev", "$normalizedPrefix-homework-grade-service:$imageTag")
if ($platformManifest -match "teaching-platform-(api|web|judge-worker|lab-practice-service|api-gateway|course-service|homework-grade-service):dev") {
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
