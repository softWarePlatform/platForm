[CmdletBinding()]
param(
  [string]$Namespace = "teaching-platform",
  [string]$PostgresPassword = "platform",
  [string]$JwtSecret = "local-k8s-jwt-secret-change-before-production",
  [string]$InternalServiceToken = "local-k8s-internal-service-token",
  [string]$CorsOrigin = "http://localhost:30080",
  [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$evidencePath = Join-Path $repoRoot "test-results/deployment-local"
$localTag = "local-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
New-Item -ItemType Directory -Path $evidencePath -Force | Out-Null

function Invoke-Checked {
  param([string]$File, [string[]]$Arguments)
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$File $($Arguments -join ' ') failed." }
}

function Wait-Job {
  param([string]$Name, [string]$Manifest)
  & kubectl --namespace $Namespace delete job $Name --ignore-not-found | Out-Null
  Invoke-Checked kubectl @("apply", "-f", $Manifest)
  & kubectl --namespace $Namespace wait --for=condition=complete "job/$Name" --timeout=300s
  if ($LASTEXITCODE -ne 0) {
    & kubectl --namespace $Namespace describe "job/$Name"
    & kubectl --namespace $Namespace logs "job/$Name"
    throw "Job $Name did not complete."
  }
}

Push-Location $repoRoot
try {
  if (-not $SkipBuild) {
    Invoke-Checked docker @("compose", "build")
  }

  $imageTags = [ordered]@{
    "platform-api:latest" = "teaching-platform-api:$localTag"
    "platform-nginx:latest" = "teaching-platform-web:$localTag"
    "platform-api-gateway:latest" = "teaching-platform-api-gateway:$localTag"
    "platform-course-service:latest" = "teaching-platform-course-service:$localTag"
    "platform-homework-grade-service:latest" = "teaching-platform-homework-grade-service:$localTag"
    "platform-lab-practice-service:latest" = "teaching-platform-lab-practice-service:$localTag"
    "platform-judge-worker:latest" = "teaching-platform-judge-worker:$localTag"
    "platform-legacy-migrate:latest" = "teaching-platform-migrate:$localTag"
    "platform-course-migrate:latest" = "teaching-platform-course-migrate:$localTag"
    "platform-homework-migrate:latest" = "teaching-platform-homework-migrate:$localTag"
    "platform-lab-migrate:latest" = "teaching-platform-lab-migrate:$localTag"
  }
  foreach ($entry in $imageTags.GetEnumerator()) {
    & docker image inspect $entry.Key | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Local image $($entry.Key) does not exist." }
    Invoke-Checked docker @("tag", $entry.Key, $entry.Value)
  }

  Invoke-Checked kubectl @("apply", "-f", "k8s/monolith/namespace.yaml")
  $encodedPassword = [Uri]::EscapeDataString($PostgresPassword)
  $baseUrl = "postgresql://platform:$encodedPassword@postgres:5432"
  $secretYaml = & kubectl --namespace $Namespace create secret generic platform-secrets `
    --from-literal=POSTGRES_USER=platform `
    "--from-literal=POSTGRES_PASSWORD=$PostgresPassword" `
    --from-literal=POSTGRES_DB=teaching_platform `
    "--from-literal=DATABASE_URL=$baseUrl/teaching_platform?schema=public" `
    "--from-literal=COURSE_DATABASE_URL=$baseUrl/course_service?schema=public" `
    "--from-literal=HOMEWORK_DATABASE_URL=$baseUrl/homework_grade_service?schema=public" `
    "--from-literal=LAB_DATABASE_URL=$baseUrl/lab_practice_service?schema=public" `
    "--from-literal=JWT_SECRET=$JwtSecret" `
    "--from-literal=INTERNAL_SERVICE_TOKEN=$InternalServiceToken" `
    "--from-literal=CORS_ORIGIN=$CorsOrigin" `
    --dry-run=client -o yaml
  if ($LASTEXITCODE -ne 0) { throw "Unable to render platform-secrets." }
  $secretYaml | kubectl apply -f - | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Unable to apply platform-secrets." }

  $pullSecret = & kubectl --namespace $Namespace create secret docker-registry ghcr-pull `
    --docker-server=local.invalid --docker-username=local --docker-password=local `
    --dry-run=client -o yaml
  $pullSecret | kubectl apply -f - | Out-Null

  Invoke-Checked kubectl @("--namespace", $Namespace, "apply", "-f", "k8s/monolith/postgres.yaml")
  Invoke-Checked kubectl @("--namespace", $Namespace, "apply", "-f", "k8s/monolith/redis.yaml")
  Invoke-Checked kubectl @("--namespace", $Namespace, "rollout", "status", "statefulset/postgres", "--timeout=180s")
  $escapedSqlPassword = $PostgresPassword.Replace("'", "''")
  "ALTER ROLE platform WITH LOGIN PASSWORD '$escapedSqlPassword';" | kubectl --namespace $Namespace exec -i statefulset/postgres -- psql --set=ON_ERROR_STOP=1 --username platform --dbname postgres | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Unable to synchronize the local PostgreSQL password." }
  Invoke-Checked kubectl @("--namespace", $Namespace, "rollout", "status", "deployment/redis", "--timeout=180s")

  Wait-Job "database-bootstrap" "k8s/monolith/database-bootstrap-job.yaml"

  $migrationImages = @(
    @{ Name = "db-migrate"; File = "migrate-job.yaml"; Placeholder = "teaching-platform-migrate:dev"; Image = "teaching-platform-migrate:$localTag" },
    @{ Name = "course-migrate"; File = "course-migrate-job.yaml"; Placeholder = "teaching-platform-course-migrate:dev"; Image = "teaching-platform-course-migrate:$localTag" },
    @{ Name = "homework-migrate"; File = "homework-migrate-job.yaml"; Placeholder = "teaching-platform-homework-migrate:dev"; Image = "teaching-platform-homework-migrate:$localTag" },
    @{ Name = "lab-migrate"; File = "lab-migrate-job.yaml"; Placeholder = "teaching-platform-lab-migrate:dev"; Image = "teaching-platform-lab-migrate:$localTag" }
  )
  foreach ($migration in $migrationImages) {
    $template = Get-Content -LiteralPath "k8s/monolith/$($migration.File)" -Raw
    $manifest = $template.Replace($migration.Placeholder, $migration.Image)
    if ($manifest.Contains($migration.Placeholder)) { throw "Unable to replace the image for $($migration.Name)." }
    $renderedPath = Join-Path $evidencePath "$($migration.Name).local.yaml"
    [IO.File]::WriteAllText($renderedPath, $manifest, [Text.UTF8Encoding]::new($false))
    Wait-Job $migration.Name $renderedPath
  }

  $renderedPlatform = (& kubectl kustomize k8s/local 2>&1) -join "`n"
  if ($LASTEXITCODE -ne 0) { throw "Unable to render the local Kubernetes manifests." }
  $applicationImages = @{
    "teaching-platform-api:dev" = "teaching-platform-api:$localTag"
    "teaching-platform-web:dev" = "teaching-platform-web:$localTag"
    "teaching-platform-api-gateway:dev" = "teaching-platform-api-gateway:$localTag"
    "teaching-platform-course-service:dev" = "teaching-platform-course-service:$localTag"
    "teaching-platform-homework-grade-service:dev" = "teaching-platform-homework-grade-service:$localTag"
    "teaching-platform-lab-practice-service:dev" = "teaching-platform-lab-practice-service:$localTag"
    "teaching-platform-judge-worker:dev" = "teaching-platform-judge-worker:$localTag"
  }
  foreach ($entry in $applicationImages.GetEnumerator()) {
    $renderedPlatform = $renderedPlatform.Replace($entry.Key, $entry.Value)
  }
  if ($renderedPlatform -match "teaching-platform-(api|web|api-gateway|course-service|homework-grade-service|lab-practice-service|judge-worker):dev") {
    throw "One or more local application image placeholders were not replaced."
  }
  $platformPath = Join-Path $evidencePath "platform.local.yaml"
  [IO.File]::WriteAllText($platformPath, "$renderedPlatform`n", [Text.UTF8Encoding]::new($false))
  Invoke-Checked kubectl @("apply", "-f", $platformPath)
  & "$PSScriptRoot/health-check.ps1" -Namespace $Namespace -EvidenceDirectory $evidencePath
  if ($LASTEXITCODE -ne 0) { throw "Local Kubernetes health verification failed." }
}
finally {
  Pop-Location
}
