$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$context = 'docker-desktop'
$secretManifest = Join-Path $PSScriptRoot '.backend-secrets.generated.json'

Push-Location $root
try {
  $contexts = & kubectl config get-contexts -o name
  if ($LASTEXITCODE -ne 0 -or $contexts -notcontains $context) {
    throw 'Docker Desktop Kubernetes context was not found. Enable Kubernetes in Docker Desktop and verify kubectl context docker-desktop.'
  }
  & kubectl --context $context cluster-info | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop Kubernetes is not reachable.' }
  & docker info | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop engine is not reachable.' }

  & node (Join-Path $PSScriptRoot 'create-backend-secret.mjs') (Join-Path $root 'backend/.env') $secretManifest
  if ($LASTEXITCODE -ne 0) { throw 'Backend Secret preparation failed. Check required backend environment settings.' }

  & docker build --file backend/Dockerfile.k8s --tag gvpcew/backend:k8s-local .
  if ($LASTEXITCODE -ne 0) { throw 'Backend image build failed.' }
  & docker build --file frontend/Dockerfile.k8s --tag gvpcew/frontend:k8s-local .
  if ($LASTEXITCODE -ne 0) { throw 'Frontend image build failed.' }

  & kubectl --context $context apply -f (Join-Path $PSScriptRoot 'namespace-config.yaml')
  if ($LASTEXITCODE -ne 0) { throw 'Namespace and ConfigMap apply failed.' }
  & kubectl --context $context apply -f $secretManifest
  if ($LASTEXITCODE -ne 0) { throw 'Kubernetes Secret apply failed.' }
  & kubectl --context $context apply -f (Join-Path $PSScriptRoot 'backend.yaml')
  if ($LASTEXITCODE -ne 0) { throw 'Backend Service or Deployment apply failed.' }
  & kubectl --context $context apply -f (Join-Path $PSScriptRoot 'frontend.yaml')
  if ($LASTEXITCODE -ne 0) { throw 'Frontend Service or Deployment apply failed.' }

  # The local tags are intentionally stable and never pushed; restart pods so
  # Kubernetes uses the freshly built image behind the same tag.
  & kubectl --context $context -n gvpcew-campus rollout restart deployment/gvpcew-backend deployment/gvpcew-frontend
  if ($LASTEXITCODE -ne 0) { throw 'Deployment restart failed.' }

  & kubectl --context $context -n gvpcew-campus rollout status deployment/gvpcew-backend --timeout=240s
  if ($LASTEXITCODE -ne 0) { throw 'Backend deployment did not become ready. Inspect pod status and logs without sharing secret values.' }
  & kubectl --context $context -n gvpcew-campus rollout status deployment/gvpcew-frontend --timeout=180s
  if ($LASTEXITCODE -ne 0) { throw 'Frontend deployment did not become ready.' }

  $site = & curl.exe --fail --silent --show-error --max-time 20 'http://localhost:30080/'
  if ($LASTEXITCODE -ne 0 -or ($site -join "`n") -notmatch '<html') { throw 'Frontend HTTP smoke check failed.' }
  $healthJson = & curl.exe --fail --silent --show-error --max-time 20 'http://localhost:30080/api/health'
  if ($LASTEXITCODE -ne 0) { throw 'Nginx to backend API smoke check failed.' }
  $health = ($healthJson -join "`n") | ConvertFrom-Json
  if ($health.status -ne 'ok') { throw 'Nginx to backend API smoke check failed.' }
  Write-Output 'Deployment is ready. Frontend: http://localhost:30080; proxied API health: healthy.'
}
finally {
  if (Test-Path -LiteralPath $secretManifest) { Remove-Item -LiteralPath $secretManifest -Force }
  Pop-Location
}
