# Docker Desktop Kubernetes

This deployment keeps PostgreSQL external, uses local-only Docker images, and does not run database migrations. It does not change the Render deployment or the mobile app's API URL.

## Prerequisites

- Docker Desktop is running with Kubernetes enabled and its `docker-desktop` kubectl context available.
- `backend/.env` contains the existing external `DATABASE_URL`, a unique `JWT_SECRET` of at least 32 characters, `ENROLLMENT_API_KEY`, and `DATASET_ADMIN_API_KEY`. Existing optional backend settings (such as object storage, FCM, face verification, and Play Integrity) are copied into the Kubernetes Secret without being printed.
- PostgreSQL accepts connections from Docker Desktop's Kubernetes network. The database host in `DATABASE_URL` must be externally reachable from the cluster; `localhost` will refer to the pod, not the Windows host.

When `DATABASE_URL` uses `localhost`, the Secret generator changes only the Kubernetes copy to `host.docker.internal`. The local `backend/.env` stays unchanged. PostgreSQL must accept TCP connections from Docker Desktop's host gateway.

## Deploy

From the project root in PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\deploy\kubernetes\deploy.ps1
```

The script builds `gvpcew/backend:k8s-local` and `gvpcew/frontend:k8s-local`, applies the `gvpcew-campus` namespace, ConfigMap, Secret, Deployments, and Services, then waits for both Deployments and checks `http://localhost:30080/` and `/api/health` through Nginx. Images are not pushed to a registry.

The Secret manifest is generated temporarily from `backend/.env`, applied to the local cluster, and removed in the script's `finally` block. It is excluded from Git. Do not commit generated Secret manifests or environment files.

## Inspect and remove

```powershell
kubectl --context docker-desktop -n gvpcew-campus get pods,services
kubectl --context docker-desktop -n gvpcew-campus logs deployment/gvpcew-backend --tail=80
kubectl --context docker-desktop -n gvpcew-campus logs deployment/gvpcew-frontend --tail=40
```

To remove only this local Kubernetes deployment, run:

```powershell
kubectl --context docker-desktop delete namespace gvpcew-campus
```

This does not delete PostgreSQL data or alter Render or mobile configuration.
